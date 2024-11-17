import { Construct } from 'constructs';
import { VPCBase } from './vpc/vpc_base';
import { RelationalDb } from './db/relational_db';
import { Api } from './api/api';
import { CredentialsAndSecurityBase } from './credentials-and-security-groups.ts/credentials_and_security_groups';
import { UI } from './ui/ui';


export class ProjectBase extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const vpcBase = new VPCBase(this, 'VPC');

    const credentialsAndSecurityBase = new CredentialsAndSecurityBase(this, 'CredentialsAndSecurity', {
      vpc: vpcBase.vpc
    })

    const relationalDbBase = new RelationalDb(this, 'RelationalDb', {
      vpc: vpcBase.vpc,
      dbSecurityGroup: credentialsAndSecurityBase.dbSecurityGroup,
      dbCredentialsSecret: credentialsAndSecurityBase.dbCredentialsSecret,
      codebuildSecurityGroup: credentialsAndSecurityBase.codebuildSecurityGroup,
    })

    const apiStack = new Api(this, 'Api', {
      vpc: vpcBase.vpc,
      dbCluster: relationalDbBase.dbCluster,
      dbCredentialsSecret: credentialsAndSecurityBase.dbCredentialsSecret,
      lambdaSecurityGroup: credentialsAndSecurityBase.lambdaSecurityGroup
    });

    new UI(this, 'UI', {
      vpc: vpcBase.vpc,
      uiSecurityGroup: credentialsAndSecurityBase.uiSecurityGroup,
      apiUrl: apiStack.url
    })
  }
}
