import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ProjectBaseStack} from './project_base_stack'

export class ProjectBaseStage extends cdk.Stage {
    constructor(scope: Construct, id: string, props?: cdk.StageProps) {
        super(scope, id, props)
        
        const projectBase = new ProjectBaseStack(this, id)
    }
}