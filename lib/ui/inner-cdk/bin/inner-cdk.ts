#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { Cluster, ContainerImage, LogDriver } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { AwsCustomResource, PhysicalResourceId, AwsCustomResourcePolicy } from 'aws-cdk-lib/custom-resources';
import { CachePolicy, Distribution, OriginProtocolPolicy, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { LoadBalancerV2Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { IRestApi, LambdaIntegration, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { DockerImageFunction, Function } from 'aws-cdk-lib/aws-lambda';
import { Runtime, Code } from 'aws-cdk-lib/aws-lambda';

const app = new cdk.App();

class InnerUIStack extends cdk.Stack {
  private apiGateway: IRestApi

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const vpcId: string = process.env.VPC_ID || '';
    const apiGatewayId: string = process.env.API_GATEWAY_ID || ''

    this.apiGateway = RestApi.fromRestApiId(this, "Api", apiGatewayId)

    const vpc = Vpc.fromLookup(this, 'InnerVpc', {
      vpcId: vpcId
    })

    const cluster = new Cluster(this, 'ECSCluster', { vpc });

    const image = new DockerImageAsset(this, 'UIImage', {
      directory: './src/ui',
      buildArgs: {
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || ''
      }
    });

    const loadBalancedFargateService = new ApplicationLoadBalancedFargateService(this, 'Service', {
      cluster,
      memoryLimitMiB: 1024,
      desiredCount: 1,
      cpu: 512,
      assignPublicIp: true,
      taskImageOptions: {
        image: ContainerImage.fromDockerImageAsset(image),
        containerPort: 3000,
        logDriver: LogDriver.awsLogs({ streamPrefix: 'UIImageStream' }),
        enableLogging: true,
        environment: {}
      }
    });

    const scalableTarget = loadBalancedFargateService.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 1000,
    });

    scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 95,
    });

    scalableTarget.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 95,
    });

    const distribution = new Distribution(this, 'CloudFrontDistribution', {
      defaultBehavior: {
        origin: new LoadBalancerV2Origin(loadBalancedFargateService.loadBalancer, {
          protocolPolicy: OriginProtocolPolicy.HTTP_ONLY,
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
      },
    });

    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'URL of the CloudFront Distribution for the UI',
      exportName: 'CloudFrontURL',
    });

    new AwsCustomResource(this, 'CacheInvalidation', {
      onUpdate: {
        service: 'CloudFront',
        action: 'createInvalidation',
        parameters: {
          DistributionId: distribution.distributionId,
          InvalidationBatch: {
            Paths: {
              Quantity: 1,
              Items: ['/*'],
            },
            CallerReference: new Date().toISOString(),
          },
        },
        physicalResourceId: PhysicalResourceId.of(`CacheInvalidation-${new Date().toISOString()}`),
      },
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          actions: ['cloudfront:CreateInvalidation'],
          resources: [
            `arn:aws:cloudfront::${cdk.Stack.of(this).account}:distribution/${distribution.distributionId}`
          ],
        }),
      ]),
    });

    
  }

  public addCorsHandler(origin: string): void {
    // 1. Create the CORS Lambda function
    const corsLambda = new Function(this, 'CorsLambdaFunction', {
        runtime: Runtime.NODEJS_LATEST, // Choose runtime as per your preference
        handler: 'index.handler',
        code: Code.fromAsset('./src/api/cors'), // Directory with your CORS Lambda code
        environment: {
            ALLOWED_ORIGIN: origin
        },
    });

    // 2. Grant API Gateway permission to invoke the CORS Lambda
    corsLambda.addPermission('ApiGatewayInvokeCorsLambda', {
        principal: new ServicePrincipal('apigateway.amazonaws.com'),
        sourceArn: `${this.apiGateway.arnForExecuteApi('*')}/*/*`,
    });

    // 3. Integrate the CORS Lambda with API Gateway
    const corsIntegration = new LambdaIntegration(corsLambda, {
        proxy: true,
    });

    // 4. Add OPTIONS method to the root resource
    this.apiGateway.root.addMethod('OPTIONS', corsIntegration, {
        methodResponses: [
            {
                statusCode: '200',
                responseParameters: {
                    'method.response.header.Access-Control-Allow-Origin': true,
                    'method.response.header.Access-Control-Allow-Methods': true,
                    'method.response.header.Access-Control-Allow-Headers': true,
                },
            },
        ],
    });

    this.mainLambda.addEnvironment("ALLOWED_ORIGIN", origin)
}
}

new InnerUIStack(app, 'InnerCdkStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});