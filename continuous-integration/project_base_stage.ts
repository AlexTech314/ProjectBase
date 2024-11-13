import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ProjectBaseStack } from '../lib/project_base_stack';

export class ProjectBaseStage extends cdk.Stage {
    constructor(scope: Construct, id: string, props?: cdk.StageProps) {
        super(scope, id, props)
        new ProjectBaseStack(this, `ProjectBaseStack${id}`);
    }
}