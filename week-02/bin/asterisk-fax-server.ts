#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { AsteriskFaxServerStack } from '../lib/asterisk-fax-server-stack';

const app = new cdk.App();


new AsteriskFaxServerStack(app, 'AsteriskFaxServerStack');
