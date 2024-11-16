import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Cluster, ContainerImage, LogDriver } from 'aws-cdk-lib/aws-ecs';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';

interface UIStackProps extends cdk.StackProps {
  vpc: Vpc;
  uiSecurityGroupId: string
  apiUrl: string
}

export class UIStack extends cdk.NestedStack {
  public readonly apiUrl: string;
  public readonly cloudFrontUrl: string; // New property to hold CloudFront URL

  constructor(scope: Construct, id: string, props: UIStackProps) {
    super(scope, id, props);

    const { vpc, uiSecurityGroupId } = props;

    // --------------------------------------------
    // 1. Create ECS Cluster
    // --------------------------------------------
    const cluster = new Cluster(this, 'ECSCluster', { vpc });

    // --------------------------------------------
    // 2. Build Docker Image for UI
    // --------------------------------------------
    let apiUrl: string = ''
    if (id.toLowerCase().includes('main')) {
      apiUrl = 'https://3c5pp045vl.execute-api.us-west-1.amazonaws.com/prod'
    }

    const image = new DockerImageAsset(this, 'UIImage', {
      directory: './ui',
      buildArgs: {
        NEXT_PUBLIC_API_URL: apiUrl
      }
    });

    // --------------------------------------------
    // 3. Create Application Load Balanced Fargate Service
    // --------------------------------------------
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
      },
      securityGroups: [
        SecurityGroup.fromSecurityGroupId(this, "UISecurity", uiSecurityGroupId)
      ]
    });

    // --------------------------------------------
    // 4. Auto Scaling Configuration
    // --------------------------------------------
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

    // --------------------------------------------
    // 5. Create CloudFront Distribution
    // --------------------------------------------
    const distribution = new cloudfront.Distribution(this, 'CloudFrontDistribution', {
      defaultBehavior: {
        origin: new origins.LoadBalancerV2Origin(loadBalancedFargateService.loadBalancer, {
          // Optional: Configure connection settings, such as protocol policy
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY, // Adjust as needed
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED, // You can customize caching policies
      },
    });

    // --------------------------------------------
    // 6. Output CloudFront Distribution URL
    // --------------------------------------------
    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'URL of the CloudFront Distribution for the UI',
      exportName: 'CloudFrontURL',
    });

    // Optionally, you can store the CloudFront URL in a class property
    this.cloudFrontUrl = `https://${distribution.distributionDomainName}`;

    // --------------------------------------------
    // 7. Add Cache Invalidation Custom Resource
    // --------------------------------------------
    const invalidation = new AwsCustomResource(this, 'CacheInvalidation', {
      onUpdate: {
        service: 'CloudFront',
        action: 'createInvalidation',
        parameters: {
          DistributionId: distribution.distributionId,
          InvalidationBatch: {
            Paths: {
              Quantity: 1,
              Items: ['/*'], // Invalidate all files. Adjust as needed.
            },
            CallerReference: new Date().toISOString(),
          },
        },
        physicalResourceId: PhysicalResourceId.of(`CacheInvalidation-${new Date().toISOString()}`),
      },
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          actions: ['cloudfront:CreateInvalidation'],
          resources: ['*'], // Adjust to the specific distribution ARN if possible
        }),
      ]),
    });
  }
}
