import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackProps } from 'aws-cdk-lib';
import { ProjectBase } from '../lib/project_base';

export class ProjectBaseStack extends cdk.Stack {
  public readonly apiUrl: string;
  public readonly cloudFrontUrl: string; // New property to hold CloudFront URL

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const projectBase = new ProjectBase(this, id);
  }
}
