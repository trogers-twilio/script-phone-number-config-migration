const Twilio = require('twilio');
const fs = require('fs');

const log = require('./helpers/log');
const utils = require('./helpers/utils');
const numbers = require('./helpers/numbers');
const twimlBins = require('./helpers/twimlBins');
const { scriptMode } = require('./helpers/enums');

const downloadNumberConfigs = async () => {
  const credentials = await utils.getAccountCredentials(scriptMode.downloadNumberConfigs);
  const client = Twilio(credentials.accountSid, credentials.authToken);

  const isConfirmed = await utils.confirmTargetAccount(client);
  if (!isConfirmed) {
    return;
  }

  log.info('Getting all phone number configs');
  const numberConfigs = await numbers.getConfigs(client);

  const formattedConfigs = await numbers.formatConfigsForCSV(numberConfigs, client);
  log.debug('Formatted number configs:', formattedConfigs);

  const csvFileName = `./output/phoneNumbers_${client.accountSid}_${utils.generateTimestamp()}.csv`;
  await utils.writeToCsvFile(csvFileName, formattedConfigs);
  log.info('Phone number configs written to CSV file:\n', csvFileName, '\n');
};

const uploadNumberConfigs = async () => {
  const credentials = await utils.getAccountCredentials(scriptMode.uploadNumberConfigs);
  const client = Twilio(credentials.accountSid, credentials.authToken);

  const isConfirmed = await utils.confirmTargetAccount(client);
  if (!isConfirmed) {
    return;
  }

  const question = 'Please enter the phone number configs CSV file name.\n'
    + 'Include path relative to current directory.\n'
    + `Current directory: ${process.cwd()}\n`
    + 'CSV file name: ';
  const configsCsvFile = await utils.queryUserForInput(question);

  const questionVoiceUrl = 'Please enter the new Voice Url when isTwimlBin is true.\n'
    + 'Include full url with http.\n'
    + 'New Voice Url: ';
  const configsVoiceUrl = await utils.queryUserForInput(questionVoiceUrl);

  await numbers.updateConfigsFromCsv(configsCsvFile, configsVoiceUrl, client);
  log.info('Finished updating number configs\n');
}

const mapTwiml = async () => {
  const credentials = await utils.getAccountCredentials(scriptMode.mapTwiml);
  const client = Twilio(credentials.accountSid, credentials.authToken);

  const isConfirmed = await utils.confirmTargetAccount(client);
  if (!isConfirmed) {
    return;
  }

  const existingTwimlMapCsvPath = './serverless/assets/dialTargets.private.csv';

  let existingTwimlMap;
  if (fs.existsSync(existingTwimlMapCsvPath)) {
    log.info('Parsing existing TwiML map entries from CSV:\n', existingTwimlMapCsvPath);
    const existingTwimlArray = await utils.parseCsvToArray(existingTwimlMapCsvPath);
    existingTwimlMap = utils.createMapFromObjectsArray(existingTwimlArray, 'phoneNumber');
  }

  log.info('Getting all phone number configs');
  const numberConfigs = await numbers.getConfigs(client);

  log.info('Generating number -> TwiML map');
  const numberTwimlArray = await twimlBins.createTwimlArray(numberConfigs, client, existingTwimlMap);
  log.debug('Number TwiML Array:', numberTwimlArray);

  const csvFileName = `./output/numbersTwimlMap_${client.accountSid}_${utils.generateTimestamp()}.csv`;
  await utils.writeToCsvFile(csvFileName, numberTwimlArray);
  log.info('Phone number TwiML map written to CSV file:\n', csvFileName, '\n');
};

module.exports = {
  downloadNumberConfigs,
  mapTwiml,
  uploadNumberConfigs
};
