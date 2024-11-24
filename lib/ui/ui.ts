import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { Cluster, LogDriver } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { TokenInjectableDockerBuilder } from 'token-injectable-docker-builder';

interface UIProps {
  vpc: Vpc;
  apiUrl: string;
  deploymentHash: string;
}

export class UI extends Construct {
  public readonly url: string;

  constructor(scope: Construct, id: string, props: UIProps) {
    super(scope, id);

    const { vpc, apiUrl, deploymentHash } = props;

    const cluster = new Cluster(this, 'ECSCluster', { vpc });

    const tokenInjectableDockerBuilder = new TokenInjectableDockerBuilder(this, "TestingMyThing", {
      path: './src/ui',
      buildArgs: {
        NEXT_PUBLIC_API_URL: apiUrl
      }
    })

    // Fargate service that uses the image from ECR
    const loadBalancedFargateService = new ApplicationLoadBalancedFargateService(this, 'Service', {
      cluster,
      memoryLimitMiB: 1024,
      desiredCount: 1,
      cpu: 512,
      assignPublicIp: true,
      taskImageOptions: {
        image: tokenInjectableDockerBuilder.containerImage,
        containerPort: 3000,
        logDriver: LogDriver.awsLogs({ streamPrefix: 'UIImageStream' }),
        enableLogging: true,
        environment: {
          DEPLOYMENT_TRIGGER: deploymentHash,
        },
      },
    });

    loadBalancedFargateService.node.addDependency(tokenInjectableDockerBuilder)

    // Auto-scaling configurations
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

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'CloudFrontDistribution', {
      defaultBehavior: {
        origin: new origins.LoadBalancerV2Origin(loadBalancedFargateService.loadBalancer, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
    });

    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'URL of the CloudFront Distribution for the UI',
      exportName: 'CloudFrontURL',
    });

    this.url = `https://${distribution.distributionDomainName}`;

    // Cache invalidation using AwsCustomResource
    const invalidationResource = new AwsCustomResource(this, 'InvalidateCache', {
      onUpdate: {
        service: 'CloudFront',
        action: 'createInvalidation',
        parameters: {
          DistributionId: distribution.distributionId,
          InvalidationBatch: {
            CallerReference: Date.now().toString(),
            Paths: {
              Quantity: 1,
              Items: ['/*'],
            },
          },
        },
        physicalResourceId: PhysicalResourceId.of(Date.now().toString()), // Always create a new invalidation
      },
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: [`arn:aws:cloudfront::${cdk.Stack.of(this).account}:distribution/${distribution.distributionId}`],
      }),
    });

    invalidationResource.node.addDependency(loadBalancedFargateService);
  }
}
