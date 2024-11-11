import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';


export class SeleniumGlobalPipeline extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);
        const pipeline = new CodePipeline(this, `${id}-Pipeline`, {
            pipelineName: 'pipe',
            synth: new ShellStep('Synth', {
                input: CodePipelineSource.gitHub('AlexTech314/SeleniumGlobal', 'main'),
                commands: [
                    'npm ci',
                    'npm run build',
                    'npx cdk synth'
                ]
            })
        });
        // -- Insert stages to deploy below --
        

    }
}