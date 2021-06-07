import * as cdk from '@aws-cdk/core';
import { AsteriskParsing } from '../lib/asterisk_parsing';

const app = new cdk.App();

const SecurityGroupIP = app.node.tryGetContext('SecurityGroupIP') || '10.10.10.10'

new AsteriskParsing(app, 'AsteriskParsing', {
    SecurityGroupIP: SecurityGroupIP
});
