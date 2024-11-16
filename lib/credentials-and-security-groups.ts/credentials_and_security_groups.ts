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
  public readonly uiSecurityGroupId: string;
  public readonly dbCredentialsSecretArn: string;

  constructor(scope: Construct, id: string, props: CredentialsAndSecurityStackProps) {
    super(scope, id, props);

    const { vpc } = props;

    // --------------------------------------------
    // 1. Create a Security Group for the RDS Database
    // --------------------------------------------
    this.dbSecurityGroup = new SecurityGroup(this, 'DBSecurityGroup', {
      vpc,
      description: 'Allow database access from Lambda and CodeBuild',
      allowAllOutbound: true, // Allow outbound traffic to any destination
    });

    // --------------------------------------------
    // 2. Create a Secret for RDS Credentials
    // --------------------------------------------
    const dbCredentialsSecret = new DatabaseSecret(this, 'DBCredentialsSecret', {
      username: 'admin',
    });

    this.dbCredentialsSecretArn = dbCredentialsSecret.secretArn;

    // --------------------------------------------
    // 3. Create a Security Group for CodeBuild
    // --------------------------------------------
    this.codebuildSecurityGroup = new SecurityGroup(this, 'CodeBuildSecurityGroup', {
      vpc,
      description: 'Allow CodeBuild access to RDS',
      allowAllOutbound: true,
    });

    // --------------------------------------------
    // 4. Create a Security Group for Lambda
    // --------------------------------------------
    this.lambdaSecurityGroup = new SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc,
      description: 'Security group for Lambda to access RDS and receive traffic from UI',
      allowAllOutbound: true,
    });

    // --------------------------------------------
    // 5. Create a Security Group for the Fargate UI Service
    // --------------------------------------------
    const uiSecurityGroup = new SecurityGroup(this, 'UISecurityGroup', {
      vpc,
      description: 'Security group for the load-balanced Fargate UI',
      allowAllOutbound: true,
    })

    this.uiSecurityGroupId = uiSecurityGroup.securityGroupId;

    // --------------------------------------------
    // 6. Configure Ingress Rules
    // --------------------------------------------

    // 6.1 Allow UI Security Group to communicate with Lambda Security Group
    // Assuming Lambda listens on port 443 (HTTPS). Adjust the port as needed.
    this.lambdaSecurityGroup.addIngressRule(
      uiSecurityGroup,
      Port.tcp(443),
      'Allow UI to access Lambda on port 443'
    );

    // 6.2 Allow Lambda Security Group to access the Database on port 3306 (MySQL)
    this.dbSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      Port.tcp(3306),
      'Allow Lambda to connect to RDS'
    );

    // 6.3 Allow CodeBuild Security Group to access the Database on port 3306 (MySQL)
    this.dbSecurityGroup.addIngressRule(
      this.codebuildSecurityGroup,
      Port.tcp(3306),
      'Allow CodeBuild to connect to RDS'
    );

    // --------------------------------------------
    // 7. Output Security Group IDs
    // --------------------------------------------
    new cdk.CfnOutput(this, 'UISecurityGroupId', {
      value: this.uiSecurityGroupId,
      description: 'Security Group ID for the Fargate UI',
    });

    new cdk.CfnOutput(this, 'LambdaSecurityGroupId', {
      value: this.lambdaSecurityGroup.securityGroupId,
      description: 'Security Group ID for Lambda',
    });

    new cdk.CfnOutput(this, 'DBSecurityGroupId', {
      value: this.dbSecurityGroup.securityGroupId,
      description: 'Security Group ID for RDS Database',
    });

    new cdk.CfnOutput(this, 'CodeBuildSecurityGroupId', {
      value: this.codebuildSecurityGroup.securityGroupId,
      description: 'Security Group ID for CodeBuild',
    });
  }
}
