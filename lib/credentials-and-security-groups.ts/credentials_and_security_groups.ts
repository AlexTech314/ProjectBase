import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  Vpc,
  SecurityGroup,
  Port,
} from 'aws-cdk-lib/aws-ec2';
import { DatabaseSecret } from 'aws-cdk-lib/aws-rds';

interface CredentialsAndSecurityStackProps extends cdk.StackProps {
  vpc: Vpc;
}

export class CredentialsAndSecurityStack extends cdk.NestedStack {
  public readonly dbSecurityGroup: SecurityGroup;
  public readonly codebuildSecurityGroup: SecurityGroup;
  public readonly lambdaSecurityGroup: SecurityGroup;
  public readonly dbCredentialsSecretArn: string;

  constructor(scope: Construct, id: string, props: CredentialsAndSecurityStackProps) {
    super(scope, id, props);

    const { vpc } = props;

    // Create a security group for the RDS instance
    this.dbSecurityGroup = new SecurityGroup(this, 'DBSecurityGroup', {
      vpc,
      description: 'Allow database access',
      allowAllOutbound: true,
    });

    // Create a secret for the RDS credentials
    const dbCredentialsSecret = new DatabaseSecret(this, 'DBCredentialsSecret', {
      username: 'admin',
    });

    this.dbCredentialsSecretArn = dbCredentialsSecret.secretArn;

    // Security group for the CodeBuild project
    this.codebuildSecurityGroup = new SecurityGroup(this, 'CodeBuildSecurityGroup', {
      vpc,
      description: 'Allow CodeBuild access to RDS',
      allowAllOutbound: true,
    });

    // Create a security group for the Lambda function
    this.lambdaSecurityGroup = new SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc,
      description: 'Security group for Lambda to access RDS',
      allowAllOutbound: true,
    });

    this.dbSecurityGroup.connections.allowFrom(this.codebuildSecurityGroup, Port.tcp(3306), 'Allow CodeBuild to connect to RDS');
    this.dbSecurityGroup.connections.allowFrom(this.lambdaSecurityGroup, Port.tcp(3306), 'Allow Lambda to connect to RDS');
  }
}
