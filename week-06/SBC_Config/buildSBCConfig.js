var fs = require('fs');
const cdk_output = require("./cdk-outputs.json");


fs.readFile('SBC_Template.ini', 'utf8', function (err,data) {
  if (err) {
    return console.log(err);
  }
  var result = data.replace(/OUTBOUND_HOST_NAME/g, cdk_output.SIPRECChimeWithSBC.VoiceConnector)
                   .replace(/ASTERISK_HOST/g, cdk_output.SIPRECChimeWithSBC.AsteriskPrivateIP)
                   .replace(/EXTERNAL_PUBLIC_IP/g, cdk_output.SIPRECChimeWithSBC.publicSBCIP)
                   .replace(/INTERNAL_PRIVATE_IP/g, cdk_output.SIPRECChimeWithSBC.privateSBCIP)
                   .replace(/STREAMING_HOST_NAME/g, cdk_output.SIPRECChimeWithSBC.streamingHostName);

  fs.writeFile('SBC_Config.ini', result, 'utf8', function (err) {
     if (err) return console.log(err);
  });
});

