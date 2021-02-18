const csv = require('csv-parser');
const xmlParser = require('fast-xml-parser');
const fs = require('fs');

const log = require('./log');
const utils = require('./utils');
const twimlBins = require('./twimlBins');
const { match } = require('assert');

const getConfigs = async (client) => {
  return client.incomingPhoneNumbers
    .list();
};

const formatConfigsForCSV = async (numberConfigs, client) => {
  if (!numberConfigs || !Array.isArray(numberConfigs)) {
    throw new Error('Number configs value is not an array:', numberConfigs);
  }

  const csvConfigs = numberConfigs.map(number => ({
    phoneNumber: number.phoneNumber,
    sid: number.sid,
    friendlyName: number.friendlyName,
    smsApplicationSid: number.smsApplicationSid,
    smsFallbackMethod: number.smsFallbackMethod,
    smsFallbackUrl: number.smsFallbackUrl,
    smsMethod: number.smsMethod,
    smsUrl: number.smsUrl,
    statusCallback: number.statusCallback,
    statusCallbackMethod: number.statusCallbackMethod,
    trunkSid: number.trunkSid,
    voiceFallbackMethod: number.voiceFallbackMethod,
    voiceFallbackUrl: number.voiceFallbackUrl,
    voiceMethod: number.voiceMethod,
    voiceUrl: number.voiceUrl
  }));

  log.info('Retrieving TwiML for each number with a TwiML Bin voice URL');
  
  utils.startProgressBar(csvConfigs.length);
  const incrementBy = 2;
  for (let i = 0; i < csvConfigs.length; i++) {
    const config = csvConfigs[i];

    const { voiceUrl } = config;
    config.isTwimlBin = twimlBins.isTwimlBinUrl(voiceUrl);

    if (config.isTwimlBin) {
      Object.assign(config, await twimlBins.processTwimlBin(voiceUrl, client));
    }

    utils.incrementProgressBar(incrementBy, i);
  }
  utils.stopProgressBar();

  return twimlBins.makeTwimlBinConfigFirstInArray(csvConfigs);
};

const updateConfig = async (numberSid, config, client) => {
  return client.incomingPhoneNumbers(numberSid)
    .update({ ...config });
};

const processNewConfigsArray = async (newConfigs, configsVoiceUrl, client) => {
  log.debug('New configs array:', newConfigs);

  log.info('Getting current configs for all numbers in account');
  const currentConfigs = await getConfigs(client);
  log.info('Finished getting current configs');
  log.debug('Current configs:', currentConfigs);
  
  log.info('Checking for matching numbers in new config array');

  const updateResults = [];
  const configsToUpdate = [];

  const initializeResult = (phoneNumber) => ({
    phoneNumber,
    inTargetAccount: false,
    currentConfig: null,
    newConfig: null,
    updateTimestamp: null,
    error: false,
    errorDetails: null
  });

  for (const config of newConfigs) {
    const result = initializeResult(config.phoneNumber);

    const matchingConfig = currentConfigs.find(c => c.phoneNumber === config.phoneNumber);
    if (!matchingConfig) {
      log.debug(`Unable to find ${config.phoneNumber} in Twilio account`);
      updateResults.push(result);
      continue;
    }
    log.debug(`Found config for ${config.phoneNumber}:`, matchingConfig);

    if (config['isTwimlBin'] === 'true'
      && config['dialTarget']
      && config['twimlException'] === 'false'
    ) {
      config['voiceUrl'] = configsVoiceUrl;
    }

    const newConfig = {
      ...config,
      phoneNumber: undefined,
      sid: undefined,
      isTwimlBin: undefined,
      dialTarget: undefined,
      twimlException: undefined,
      twimlXml: undefined,
      twimlJson: undefined
    };

    configsToUpdate.push({ matchingConfig, newConfig });
  }

  log.info(`Found ${configsToUpdate.length} numbers to update out of ${newConfigs.length} in config file`);
  log.debug('Configs to update:', configsToUpdate);

  log.info('Starting number updates');
  utils.startProgressBar(configsToUpdate.length);
  const incrementBy = 2;
  for (let i = 0; i < configsToUpdate.length; i++) {
    const config = configsToUpdate[i];
    const { matchingConfig, newConfig } = config;

    const result = initializeResult(matchingConfig.phoneNumber);

    result.inTargetAccount = true;
    result.currentConfig = JSON.stringify(matchingConfig);
    result.newConfig = JSON.stringify(newConfig);
    result.updateTimestamp = new Date().toISOString();

    log.debug(`Updating ${matchingConfig.phoneNumber} with new config:`, newConfig);
    try {
      await updateConfig(matchingConfig.sid, newConfig, client);
    } catch (error) {
      log.error(`Error updating ${config.phoneNumber}.`, error);
      result.error = true;
      result.errorDetails = error;
    }
    
    updateResults.push(result);
    
    utils.incrementProgressBar(incrementBy, i);
  }
  utils.stopProgressBar();

  const resultsFileName = `./output/uploadNumberConfigs_result_${utils.generateTimestamp()}.csv`;
  utils.writeToCsvFile(resultsFileName, updateResults);
  log.info('Number update results written to:\n', resultsFileName, '\n');
}

const updateConfigsFromCsv = (configCsvFile, configsVoiceUrl, client) => new Promise(resolve => {
  log.info('\nParsing phone number configs from CSV', configCsvFile);

  const newConfigs = [];

  fs.createReadStream(configCsvFile)
  .pipe(csv())
  .on('data', data => newConfigs.push(data))
  .on('end', async () => {
    log.info('Finished parsing CSV');

    await processNewConfigsArray(newConfigs, configsVoiceUrl, client);

    resolve();
  })
  .on('error', error => {
    log.error(`Error while reading/parsing CSV file ${configCsvFile}.`, error);
    resolve();
  });
});

module.exports = {
  formatConfigsForCSV,
  getConfigs,
  updateConfigsFromCsv
};
