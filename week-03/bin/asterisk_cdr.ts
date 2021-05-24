import * as cdk from '@aws-cdk/core';
import { AsteriskCdrStack } from '../lib/asterisk_cdr-stack';

const app = new cdk.App();

const SecurityGroupIP = app.node.tryGetContext('SecurityGroupIP')

new AsteriskCdrStack(app, 'AsteriskCdrStack', {
    SecurityGroupIP: SecurityGroupIP
});
