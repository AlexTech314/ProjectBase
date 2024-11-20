import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { Cluster, ContainerImage, LogDriver } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { BuildSpec, LinuxBuildImage, Project, Source } from 'aws-cdk-lib/aws-codebuild';
import { CustomResource, Duration } from 'aws-cdk-lib';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { DockerImageCode, DockerImageFunction } from 'aws-cdk-lib/aws-lambda';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import path = require('path');

interface UIProps {
  vpc: Vpc;
  apiUrl: string;
}

export class UI extends Construct {
  public readonly url: string;

  constructor(scope: Construct, id: string, props: UIProps) {
    super(scope, id);

    const { vpc, apiUrl } = props;

    const cluster = new Cluster(this, 'ECSCluster', { vpc });

    // Create an ECR repository
    const ecrRepo = new Repository(this, 'ECRRepository');

    // Package the source code as an asset
    const sourceAsset = new Asset(this, 'SourceAsset', {
      path: './src/ui', // Adjust the path
    });


    // Create a CodeBuild project
    const codeBuildProject = new Project(this, 'UICodeBuildProject', {
      source: Source.s3({
        bucket: sourceAsset.bucket,
        path: sourceAsset.s3ObjectKey,
      }),
      environment: {
        buildImage: LinuxBuildImage.STANDARD_5_0,
        privileged: true, // Needed for Docker build
      },
      environmentVariables: {
        AWS_ACCOUNT_ID: { value: cdk.Stack.of(this).account },
        AWS_DEFAULT_REGION: { value: cdk.Stack.of(this).region },
        ECR_REPO_URI: { value: ecrRepo.repositoryUri },
        NEXT_PUBLIC_API_URL: { value: apiUrl },
      },
      buildSpec: BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            commands: [
              'echo Installing unzip...',
              'yum install -y unzip',
            ],
          },
          pre_build: {
            commands: [
              'echo Unzipping source code...',
              'unzip -o $CODEBUILD_SRC_DIR_SourceAsset.zip -d ./src/ui',
              'echo Logging in to Amazon ECR...',
              'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com',
            ],
          },
          build: {
            commands: [
              'echo Build started on `date`',
              'echo Building the Docker image...',
              'docker build --build-arg NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL -t $ECR_REPO_URI:latest ./src/ui',
            ],
          },
          post_build: {
            commands: [
              'echo Build completed on `date`',
              'echo Pushing the Docker image...',
              'docker push $ECR_REPO_URI:latest',
            ],
          },
        },
      }),
    });

    // Grant permissions to CodeBuild
    ecrRepo.grantPullPush(codeBuildProject);
    codeBuildProject.addToRolePolicy(
      new PolicyStatement({
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      })
    );

    const buildTriggerFunction = new DockerImageFunction(this, 'BuildTriggerLambdaFunction', {
      code: DockerImageCode.fromImageAsset('./src/utils'),
      timeout: Duration.minutes(15)
    });


    buildTriggerFunction.addToRolePolicy(new PolicyStatement({
      actions: [
        'codebuild:StartBuild',
        'codebuild:BatchGetBuilds',
        'logs:GetLogEvents',
        'logs:DescribeLogStreams',
        'logs:DescribeLogGroups',
      ],
      resources: ['*'],
    }));

    // Custom resource provider
    const customResourceProvider = new Provider(this, 'CustomResourceProvider', {
      onEventHandler: buildTriggerFunction,
    });

    // Custom resource to trigger the build
    const buildTriggerResource = new CustomResource(this, 'BuildTriggerResource', {
      serviceToken: customResourceProvider.serviceToken,
      properties: {
        ProjectName: codeBuildProject.projectName,
      },
    });

    // Fargate service that uses the image from ECR
    const loadBalancedFargateService = new ApplicationLoadBalancedFargateService(this, 'Service', {
      cluster,
      memoryLimitMiB: 1024,
      desiredCount: 1,
      cpu: 512,
      assignPublicIp: true,
      taskImageOptions: {
        image: ContainerImage.fromEcrRepository(ecrRepo, 'latest'),
        containerPort: 3000,
        logDriver: LogDriver.awsLogs({ streamPrefix: 'UIImageStream' }),
        enableLogging: true,
        environment: {},
      },
    });

    // Ensure the service depends on the build
    loadBalancedFargateService.node.addDependency(buildTriggerResource);

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

    // // Cache invalidation
    // new cdk.CustomResource(this, 'CacheInvalidation', {
    //   serviceToken: customResourceProvider.serviceToken,
    //   properties: {
    //     DistributionId: distribution.distributionId,
    //   },
    // });
  }
}
