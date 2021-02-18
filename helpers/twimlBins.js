const got = require('got');
const xmlParser = require('fast-xml-parser');

const utils = require('./utils');

const isTwimlBinUrl = (url) => {
  if (!url || typeof(url) !== 'string') {
    return false;
  }

  const twimlBinPrefix = 'https://handler.twilio.com/twiml';

  return url.startsWith(twimlBinPrefix);
}

const getTwimlBin = async (webhookUrl, parameters = {}, client, method = 'POST') => {
  parameters.AccountSid = client.accountSid;
  return got(webhookUrl, {
    method,
    form: parameters,
    headers: {
      'X-Twilio-Signature': utils.createTwilioSignature(webhookUrl, parameters, client.password),
      'Accept-Charset': 'utf-8',
      Accept: 'application/json',
    }
  });
};

const parseTwimlObject = (twimlObject) => {
  const dialTarget = (
    twimlObject
    && twimlObject.Response
    && twimlObject.Response.Dial
  );

  const validDialTargetTypes = [
    'number',
    'string'
  ];

  return {
    dialTarget: (typeof(dialTarget) === 'object'
      ? JSON.stringify(dialTarget)
      : dialTarget),
    // Since the purpose of the TwiML Map is to map Twilio number to the <Dial> target,
    // the lack of a proper <Dial> target will be flagged as a TwiML exception
    twimlException: !(dialTarget && validDialTargetTypes.includes(typeof(dialTarget))),
  };
};

const processTwimlBin = async (voiceUrl, client) => {
  const parameters = { accountSid: client.accountSid };
  const twimlXml = await getTwimlBin(voiceUrl, parameters, client);
  const twimlObject = xmlParser.parse(twimlXml.body);

  const result = {};

  Object.assign(result, parseTwimlObject(twimlObject));

  result.twimlXml = utils.removeCarriageReturns(twimlXml.body);

  // Converting object to a string for use in a CSV file
  result.twimlJson = JSON.stringify(twimlObject);

  return result;
};

const makeTwimlBinConfigFirstInArray = (configArray) => {
  // Ensuring the first element in the array has all possible object
  // properties for the CSV file header
  const newArray = configArray.map(c => c)

  const firstCompleteObjectIndex = newArray.findIndex(t => t.isTwimlBin && t.dialTarget);
  const firstCompleteObject = newArray.splice(firstCompleteObjectIndex, 1);
  newArray.unshift(...firstCompleteObject);

  return newArray;
}

const createTwimlArray = async (numberConfigs, client, existingTwimlMap) => {
  if (!numberConfigs || !Array.isArray(numberConfigs)) {
    throw new Error('Number configs value is not an array:', numberConfigs);
  }
  
  let twimlArray = [];

  utils.startProgressBar(numberConfigs.length);
  const incrementBy = 2;
  for (let i = 0; i < numberConfigs.length; i++) {
    const number = numberConfigs[i];
    const {
      phoneNumber,
      voiceUrl
    } = number;

    const value = { 
      phoneNumber,
      voiceUrl,
      isTwimlBin: isTwimlBinUrl(voiceUrl),
    };

    if (value.isTwimlBin) {
      Object.assign(value, await processTwimlBin(voiceUrl, client));
    }

    if (existingTwimlMap) {
      existingTwimlMap.set(phoneNumber, value);
    } else {
      twimlArray.push(value);
    }
    
    utils.incrementProgressBar(incrementBy, i);
  }
  utils.stopProgressBar();

  if (existingTwimlMap) {
    twimlArray = Array.from(existingTwimlMap.values());
  }

  return makeTwimlBinConfigFirstInArray(twimlArray);
};

module.exports = {
  createTwimlArray,
  getTwimlBin,
  isTwimlBinUrl,
  makeTwimlBinConfigFirstInArray,
  parseTwimlObject,
  processTwimlBin
};
