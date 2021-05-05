// Copyright Amazon.com Inc. or its affiliates.

import * as cdk from '@aws-cdk/core';
import { Ec2CdkStack } from '../lib/ec2-cdk-stack';

const app = new cdk.App();

const SecurityGroupIP = app.node.tryGetContext('SecurityGroupIP')

new Ec2CdkStack(app, 'Ec2CdkStack', {
    SecurityGroupIP: SecurityGroupIP
});
