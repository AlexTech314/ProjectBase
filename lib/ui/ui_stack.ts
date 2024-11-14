import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Vpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { DockerImageCode, DockerImageFunction } from 'aws-cdk-lib/aws-lambda';
import { LambdaRestApi } from 'aws-cdk-lib/aws-apigateway';

interface UIStackProps extends cdk.StackProps {
  vpc: Vpc;
}

export class UIStack extends cdk.NestedStack {
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: UIStackProps) {
    super(scope, id, props);

    const { vpc } = props;

    // Create the Lambda function using DockerImageFunction
    const lambdaFunction = new DockerImageFunction(this, 'NextJsLambdaFunction', {
      code: DockerImageCode.fromImageAsset('./ui', {
        // Exclude unnecessary files to reduce image size
        exclude: ['cdk.out', 'node_modules', '.git', '.github', '.vscode'],
      }),
      vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      memorySize: 1024, // Adjust as needed
      timeout: cdk.Duration.seconds(30), // Adjust as needed
    });

    // Create API Gateway and integrate it with the Lambda function
    const api = new LambdaRestApi(this, 'NextJsApiGateway', {
      handler: lambdaFunction,
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: ['*'],
        allowMethods: ['*'],
        allowHeaders: ['*'],
        allowCredentials: true,
        maxAge: cdk.Duration.days(1)
      } 
    });

    this.apiUrl = api.url;

    // Output the API URL
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.apiUrl,
      description: 'API Gateway endpoint URL',
    });
  }
}
