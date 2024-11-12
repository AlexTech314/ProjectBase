import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { VPCStack } from './vpc/vpc_stack';
import { RelationalDbStack } from './db/relational_db_stack';
import { ApiStack } from './api/api_stack';


export class ProjectBaseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpcStack = new VPCStack(this, 'VPCStack');
    
    const relationalDbStack = new RelationalDbStack(this, 'RelationalDbStack', {
      vpc: vpcStack.vpc
    })

    new ApiStack(this, 'ApiStack', {
      vpc: vpcStack.vpc,
      dbCluster: relationalDbStack.dbCluster,
      dbCredentialsSecret: relationalDbStack.dbCredentialsSecret,
    });
  }
}
