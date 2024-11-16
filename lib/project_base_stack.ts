import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { VPCStack } from './vpc/vpc_stack';
import { RelationalDbStack } from './db/relational_db_stack';
import { ApiStack } from './api/api_stack';
import { CredentialsAndSecurityStack } from './credentials-and-security-groups.ts/credentials_and_security_groups';
import { UIStack } from './ui/ui_stack';


export class ProjectBaseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpcStack = new VPCStack(this, 'VPCStack');

    const credentialsAndSecurityStack = new CredentialsAndSecurityStack(this, 'CredentialsAndSecurityStack', {
      vpc: vpcStack.vpc
    })

    const relationalDbStack = new RelationalDbStack(this, 'RelationalDbStack', {
      vpc: vpcStack.vpc,
      dbSecurityGroup: credentialsAndSecurityStack.dbSecurityGroup,
      dbCredentialsSecretArn: credentialsAndSecurityStack.dbCredentialsSecretArn,
      codebuildSecurityGroup: credentialsAndSecurityStack.codebuildSecurityGroup,
    })

    const apiStack = new ApiStack(this, 'ApiStack', {
      vpc: vpcStack.vpc,
      dbCluster: relationalDbStack.dbCluster,
      dbCredentialsSecretArn: credentialsAndSecurityStack.dbCredentialsSecretArn,
      lambdaSecurityGroup: credentialsAndSecurityStack.lambdaSecurityGroup
    });

    new UIStack(this, 'UIStack', {
      vpc: vpcStack.vpc,
      uiSecurityGroupId: credentialsAndSecurityStack.uiSecurityGroupId,
      apiUrl: apiStack.url
    })
  }
}
