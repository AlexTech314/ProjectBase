import { Construct } from 'constructs';
import { VPCBase } from './vpc/vpc_base';
import { RelationalDb } from './db/relational_db';
import { Api } from './api/api';
import { UI } from './ui/ui';
import { CustomResource } from 'aws-cdk-lib';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { DockerImageCode, DockerImageFunction } from 'aws-cdk-lib/aws-lambda';
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

    this.vpc = new VPCBase(this, 'VPC');

    this.relationalDb = new RelationalDb(this, 'RelationalDb', {
      vpc: this.vpc.vpc,
    });

    this.api = new Api(this, 'Api', {
      vpc: this.vpc.vpc,
      dbCluster: this.relationalDb.dbCluster,
      deploymentHash: this.deploymentHash
    });


    this.ui = new UI(this, 'UI', {
      vpc: this.vpc.vpc,
      apiUrl: this.api.apiGateway.url,
      deploymentHash: this.deploymentHash,
    });

    // Create the Lambda function for handling CORS
    const corsDeploymentLambda = new DockerImageFunction(this, 'CorsDeploymentLambda', {
      code: DockerImageCode.fromImageAsset('./src/utils/cors-deployment-lambda'),
      timeout: cdk.Duration.minutes(15),
      environment: {
        DEPLOYMENT_HASH: this.deploymentHash
      }
    });

    // Add necessary permissions to the Lambda function

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

    // Permissions for updating Lambda function configurations
    const lambdaFunctionArns = [this.api.mainLambda.functionArn];

    corsDeploymentLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ['lambda:GetFunctionConfiguration', 'lambda:UpdateFunctionConfiguration'],
        resources: lambdaFunctionArns,
      })
    );

    // Create a custom resource provider
    // const corsCustomResourceProvider = new Provider(this, 'CorsCustomResourceProvider', {
    //   onEventHandler: corsDeploymentLambda,
    // });

    // Custom resource to handle CORS
    // const corsDeploymentCustomResource = new CustomResource(this, 'CorsUpdateCustomResource', {
    //   serviceToken: corsCustomResourceProvider.serviceToken,
    //   properties: {
    //     RestApiId: this.api.apiGateway.restApiId,
    //     AllowedOrigin: this.ui.url,
    //     StageName: 'prod', // Replace with your actual stage name if different
    //     LambdaFunctionArns: lambdaFunctionArns,
    //     Trigger: this.deploymentHash, // Ensures the custom resource runs on every deployment
    //   },
    // });

    // // Add the dependency
    // corsDeploymentCustomResource.node.addDependency(this.ui);
    // corsDeploymentCustomResource.node.addDependency(this.api);
  }
}
