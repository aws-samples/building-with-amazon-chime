#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import { ChimeWithSBC } from '../lib/chime-with-sbc';

const app = new cdk.App();

new ChimeWithSBC(app, 'ChimeWithSBC', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION
  }
})
