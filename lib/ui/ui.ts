import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { Cluster, ContainerImage, LogDriver } from 'aws-cdk-lib/aws-ecs';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';

interface UIProps {
  vpc: Vpc
}

export class UI extends Construct {
  public readonly url: string; 

  constructor(scope: Construct, id: string, props: UIProps) {
    super(scope, id);

    const { vpc } = props;

    const cluster = new Cluster(this, 'ECSCluster', { vpc });

    const image = new DockerImageAsset(this, 'UIImage', {
      directory: './src/ui'
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
}
