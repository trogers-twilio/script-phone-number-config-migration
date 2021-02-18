const Twilio = require('twilio');
const csv = require('csv-parser');
const fs = require('fs');

exports.handler = function(context, event, callback) {
  const twiml = new Twilio.twiml.VoiceResponse();

  const dialTargetsFileName = 'dialTargets.csv';

  const dialTargetsAsset = Runtime.getAssets()[`/${dialTargetsFileName}`];
  const dialTargetsPath = dialTargetsAsset.path;

  const dialTargets = [];

  console.log('Parsing', dialTargetsFileName);
  fs.createReadStream(dialTargetsPath)
    .pipe(csv())
    .on('data', data => dialTargets.push(data))
    .on('end', () => {
      console.log('Parsed CSV');

      const matchingTarget = dialTargets.find(t => t.phoneNumber === event.To);
      console.log(`matchingTarget: ${matchingTarget && JSON.stringify(matchingTarget)}`);

      if (matchingTarget && matchingTarget.dialTarget) {
        twiml.dial(matchingTarget.dialTarget);
      } else {
        twiml.say('Could not find a matching dial target');
        console.log('this is my new version');
      }

      callback(null, twiml);
    });
};
