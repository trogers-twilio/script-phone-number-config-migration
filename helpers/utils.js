const readline = require('readline');
const crypto = require('crypto');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csv = require('csv-parser');
const cliProgress = require('cli-progress');
const colors = require('colors');
const fs = require('fs');
const path = require('path');

const log = require('./log');
const { scriptMode } = require('./enums');

const progressBar = new cliProgress.SingleBar({
  format: colors.cyan('{bar}') + ' {percentage}% | {value}/{total} | Elapsed: {duration_formatted} | ETA: {eta_formatted}',
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  hideCursor: true,
  etaBuffer: 2
});

const queryUserForCredentials = () => new Promise(resolve => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Enter Twilio Account SID: ', accountSid => {
    console.log('Enter Twilio Auth Token:')
    rl.stdoutMuted = true;

    rl.question("", authToken => {
      rl.close();
      resolve({ accountSid, authToken });
    })
  });

  rl._writeToOutput = function _writeToOutput(stringToWrite) {
    if (rl.stdoutMuted && stringToWrite.charCodeAt(0) !== 32) {
      rl.output.write('*');
    } else {
      rl.output.write(stringToWrite);
    }
  }
});

const getAccountCredentials = async (mode) => {
  const {
    DOWNLOAD_ACCOUNT_SID,
    DOWNLOAD_AUTH_TOKEN,
    UPLOAD_ACCOUNT_SID,
    UPLOAD_AUTH_TOKEN,
    MAP_TWIML_ACCOUNT_SID,
    MAP_TWIML_AUTH_TOKEN
  } = process.env;

  let credentials = {};
  const setCredentials = (accountSid, authToken) => {
    return { accountSid, authToken };
  }

  switch (mode) {
    case scriptMode.downloadNumberConfigs: {
      if (!DOWNLOAD_ACCOUNT_SID || !DOWNLOAD_AUTH_TOKEN) {
        credentials = await queryUserForCredentials();
      } else {
        credentials = setCredentials(DOWNLOAD_ACCOUNT_SID, DOWNLOAD_AUTH_TOKEN);
      }
      break;
    }
    case scriptMode.uploadNumberConfigs: {
      if (!UPLOAD_ACCOUNT_SID || !UPLOAD_AUTH_TOKEN) {
        credentials = await queryUserForCredentials();
      } else {
        credentials = setCredentials(UPLOAD_ACCOUNT_SID, UPLOAD_AUTH_TOKEN);
      }
      break;
    }
    case scriptMode.mapTwiml: {
      if (!MAP_TWIML_ACCOUNT_SID || !MAP_TWIML_AUTH_TOKEN) {
        credentials = await queryUserForCredentials();
      } else {
        credentials = setCredentials(MAP_TWIML_ACCOUNT_SID, MAP_TWIML_AUTH_TOKEN);
      }
      break;
    }
    default: {
      log.error('Unhandled getAccountCreds mode:', mode);
    }
  }

  return credentials;
};

const confirmTargetAccount = (client) => new Promise(async resolve => {
  const account = await client.api
    .accounts(client.accountSid)
    .fetch();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question(`Target account: ${account.friendlyName} (${account.sid})\n`
    + `Is this correct? (Y or N): `, response => {
      console.log("");
      rl.close();
      
      const isConfirmed = !!(response && response.toLowerCase().trim() === 'y');

      if (!isConfirmed) {
        console.log('\nPlease try again with correct Account SID and Auth Token\n');
      }

      resolve(isConfirmed);
  });
});

const queryUserForInput = (question) => new Promise(resolve => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question(question, response => {
    console.log("");
    rl.close();
    resolve(response);
  });
});

const createTwilioSignature = (url, params, token) => {
  const signUrl = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  return crypto
    .createHmac('sha1', token)
    .update(Buffer.from(signUrl, 'utf-8'))
    .digest('base64');
};

const writeToCsvFile = (csvFileName, data) => {
  if (!data || !Array.isArray(data) || data.length === 0) {
    throw new Error('data must be an array with at least one element.', data);
  }

  const header = Object.keys(data[0]).map(key => ({ id: key, title: key }));
  log.debug('CSV writer header object:', header);

  if (!fs.existsSync(path.dirname(csvFileName))) {
    fs.mkdirSync(path.dirname(csvFileName));
  }

  const csvWriter = createCsvWriter({
    path: csvFileName,
    header
  });

  return csvWriter.writeRecords(data);
};

const parseCsvToArray = (csvFile) => new Promise(resolve => {
  let result = []

  fs.createReadStream(csvFile)
  .pipe(csv())
  .on('data', data => result.push(data))
  .on('end', async () => {
    log.info('Finished parsing CSV');

    resolve(result);
  })
  .on('error', error => {
    log.error(`Error while reading/parsing CSV file ${csvFile}.`, error);
    resolve();
  });
});

const generateTimestamp = () => {
  const now = new Date();

  const utcMonth = now.getUTCMonth();
  const utcDate = now.getUTCDate();
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const utcSeconds = now.getUTCSeconds();

  let timestamp = ""
  timestamp += now.getUTCFullYear();
  timestamp += utcMonth < 10 ? '0' + utcMonth : utcMonth;
  timestamp += utcDate < 10 ? '0' + utcDate : utcDate;
  timestamp += '-';
  timestamp += utcHours < 10 ? '0' + utcHours : utcHours;
  timestamp += utcMinutes < 10 ? '0' + utcMinutes : utcMinutes;
  timestamp += utcSeconds < 10 ? '0' + utcSeconds : utcSeconds;
  timestamp += 'Z';

  return timestamp;
};

const removeCarriageReturns = (stringToModify) => {
  if (!stringToModify || typeof(stringToModify) !== 'string') {
    return
  }
  return stringToModify.replace(/\r?\n|\r/g, "");
};

const createMapFromObjectsArray = (sourceArray, keyProperty) => {
  const result = new Map();

  for (const item of sourceArray) {
    result.set(item[keyProperty], item);
  }

  return result;
};

const startProgressBar = (total) => {
  console.log("");
  progressBar.start(total, 0);
};

const incrementProgressBar = (delta = 1, currentIndex) => {
  if ((currentIndex + 1) % delta === 0) {
    progressBar.increment(delta);
  }
};

const stopProgressBar = () => {
  progressBar.update(progressBar.getTotal());
  progressBar.stop();
  console.log("");
};

const sleep = (seconds) => new Promise(resolve => {
  setTimeout(() => {
    resolve();
  }, seconds * 1000);
});

module.exports = {
  confirmTargetAccount,
  createMapFromObjectsArray,
  createTwilioSignature,
  generateTimestamp,
  getAccountCredentials,
  incrementProgressBar,
  parseCsvToArray,
  queryUserForInput,
  removeCarriageReturns,
  sleep,
  startProgressBar,
  stopProgressBar,
  writeToCsvFile
};
