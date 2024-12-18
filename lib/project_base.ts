import { Construct } from 'constructs';
import { VPCBase } from './vpc/vpc_base';
import { RelationalDb } from './db/relational_db';
import { Api } from './api/api';
import { UI } from './ui/ui';
import { CustomResource, Duration } from 'aws-cdk-lib';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId, Provider } from 'aws-cdk-lib/custom-resources';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import * as crypto from 'crypto';
import * as cdk from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

export class ProjectBase extends Construct {
  private deploymentHash: string = crypto.randomBytes(16).toString('hex');
  private vpc: VPCBase;
  private relationalDb: RelationalDb;
  private api: Api;
  private ui: UI;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const secretName = 'CORS_ALLOWED_ORIGIN';
    const defaultSecretValue = 'XXXXXXXXXXXXXX';

    const createSecretResource = new AwsCustomResource(this, 'CreateSecretResource', {
      onUpdate: {
        service: 'SecretsManager',
        action: 'createSecret',
        parameters: {
          Name: secretName,
          SecretString: defaultSecretValue,
        },
        physicalResourceId: PhysicalResourceId.of(`${secretName}-${this.deploymentHash}-CREATE-SECRET`),
        ignoreErrorCodesMatching: 'ResourceExistsException',
      },
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          actions: ['secretsmanager:CreateSecret'],
          resources: ['*'],
        }),
      ]),
    });

    const describeSecretResource = new AwsCustomResource(this, 'DescribeSecretResource', {
      onUpdate: {
        service: 'SecretsManager',
        action: 'describeSecret',
        parameters: {
          SecretId: secretName,
        },
        physicalResourceId: PhysicalResourceId.of(`${secretName}-${this.deploymentHash}-DESCRIBE-SECRET`),
      },
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          actions: ['secretsmanager:DescribeSecret'],
          resources: ['*'],
        }),
      ]),
    });

    describeSecretResource.node.addDependency(createSecretResource)

    // Use a CDK condition to decide whether to create the secret
    const secretArn = describeSecretResource.getResponseField('ARN');

    // Output the secret ARN
    new cdk.CfnOutput(this, 'SecretARN', {
      value: secretArn,
      description: 'The ARN of the CORS_ALLOWED_ORIGIN',
    });

    this.vpc = new VPCBase(this, 'VPC');

    this.relationalDb = new RelationalDb(this, 'RelationalDb', {
      vpc: this.vpc.vpc,
      deploymentHash: this.deploymentHash
    });

    this.api = new Api(this, 'Api', {
      vpc: this.vpc.vpc,
      dbCluster: this.relationalDb.dbCluster,
      deploymentHash: this.deploymentHash,
      corsSecretArn: secretArn
    });


    this.ui = new UI(this, 'UI', {
      vpc: this.vpc.vpc,
      apiUrl: this.api.apiGateway.url,
      deploymentHash: this.deploymentHash,
    });

    // AwsCustomResource to update the secret
    const updateSecretResource = new AwsCustomResource(this, 'UpdateSecretResource', {
      onUpdate: {
        service: 'SecretsManager',
        action: 'updateSecret',
        parameters: {
          SecretId: secretArn,
          SecretString: this.ui.url,
        },
        physicalResourceId: PhysicalResourceId.of(`${secretName}-${this.deploymentHash}-SYNC-SECRET`), // Use a unique ID to ensure the resource updates
      },
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          actions: ['secretsmanager:UpdateSecret'],
          resources: [secretArn],
        }),
      ]),
    });

    updateSecretResource.node.addDependency(describeSecretResource)
    updateSecretResource.node.addDependency(this.ui)

    // Create Node.js Lambda function for isComplete
    const corsDeploymentLambda = new Function(this, 'CorsDeploymentLambda', {
      runtime: Runtime.NODEJS_18_X,
      code: Code.fromAsset('./src/utils/cors-deployment-lambda'),
      handler: 'index.handler',
      timeout: Duration.minutes(15),
    });

    // Permissions for API Gateway to get and update resources and integrations
    corsDeploymentLambda.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'apigateway:GET',
          'apigateway:PUT',
          'apigateway:POST',
          'apigateway:DELETE',
          'apigateway:PATCH',
        ],
        resources: [
          `arn:aws:apigateway:${cdk.Stack.of(this).region}::/restapis/${this.api.apiGateway.restApiId}/*`,
        ],
      })
    );

    // Create a custom resource provider
    const corsCustomResourceProvider = new Provider(this, 'CorsCustomResourceProvider', {
      onEventHandler: corsDeploymentLambda,
    });

    // Custom resource to handle CORS
    const corsDeploymentCustomResource = new CustomResource(this, 'CorsUpdateCustomResource', {
      serviceToken: corsCustomResourceProvider.serviceToken,
      properties: {
        RestApiId: this.api.apiGateway.restApiId,
        AllowedOrigin: this.ui.url,
        StageName: 'prod', // Replace with your actual stage name if different
        Trigger: this.deploymentHash, // Ensures the custom resource runs on every deployment
      },
    });

    // Add the dependency
    corsDeploymentCustomResource.node.addDependency(this.ui);
    corsDeploymentCustomResource.node.addDependency(this.api);
    corsDeploymentCustomResource.node.addDependency(updateSecretResource)
  }
}
