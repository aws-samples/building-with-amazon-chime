#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import { SIPRECChimeWithSBC } from '../lib/siprec-chime-with-sbc';

const app = new cdk.App();

new SIPRECChimeWithSBC(app, 'SIPRECChimeWithSBC', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION
  }
})
