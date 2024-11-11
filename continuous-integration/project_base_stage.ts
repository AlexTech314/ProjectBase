import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class SeleniumRegionalStage extends cdk.Stage {
    constructor(scope: Construct, region: string, props?: cdk.StageProps) {
        super(scope, region, props)
        // -- Insert stack to deploy below --
    }
}