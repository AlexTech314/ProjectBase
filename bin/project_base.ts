#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ProjectBasePipeline } from '../continuous-integration/project_base_pipeline';

const app = new cdk.App();

new ProjectBasePipeline(app, 'ProjectBasePipeline', {
  env: { account: '281318412783', region: 'us-west-1' },
});