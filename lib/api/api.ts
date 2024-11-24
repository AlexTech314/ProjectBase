import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
    Vpc,
    SubnetType
} from 'aws-cdk-lib/aws-ec2';
import {
    RestApi,
    LambdaIntegration,
} from 'aws-cdk-lib/aws-apigateway';
import { DockerImageFunction } from 'aws-cdk-lib/aws-lambda';
import { DatabaseCluster } from 'aws-cdk-lib/aws-rds';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { TokenInjectableDockerBuilder } from 'token-injectable-docker-builder'

interface ApiProps {
    vpc: Vpc;
    dbCluster: DatabaseCluster;
    deploymentHash: string;
    corsSecretArn: string;
}

export class Api extends Construct {
    public readonly apiGateway: RestApi;
    public readonly mainLambda: DockerImageFunction;

    constructor(scope: Construct, id: string, props: ApiProps) {
        super(scope, id);

        const { vpc, dbCluster, deploymentHash, corsSecretArn } = props;

        const tokenInjectableDockerBuilder = new TokenInjectableDockerBuilder(this, "ApiLambdaBuilder", {
            path: './src/api/main'
        })

        // Create the main Lambda function using DockerImageFunction
        this.mainLambda = new DockerImageFunction(this, 'ApiLambdaFunction', {
            code: tokenInjectableDockerBuilder.dockerImageCode,
            vpc,
            vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
            environment: {
                DB_HOST: dbCluster.clusterEndpoint.hostname,
                DB_PORT: dbCluster.clusterEndpoint.port.toString(),
                DB_NAME: 'base',
                DB_SECRET_ARN: dbCluster.secret!.secretFullArn || '',
                DEPLOYMENT_HASH: deploymentHash,
                CORS_SECRET_ARN: corsSecretArn
            },
        });

        this.mainLambda.node.addDependency(tokenInjectableDockerBuilder)

        // Grant the main Lambda read access to the RDS secret
        dbCluster.secret!.grantRead(this.mainLambda.role!);
        this.mainLambda.role!.addToPrincipalPolicy(
            new PolicyStatement({
                actions: ['secretsmanager:GetSecretValue'],
                resources: [corsSecretArn], // Replace with the ARN of your secret
            })
        );
        // Allow the main Lambda to connect to the RDS cluster on default port 3306
        dbCluster.connections.allowDefaultPortFrom(this.mainLambda, 'Allow Lambda to connect to RDS');

        // Create API Gateway as a RestApi for more flexibility
        this.apiGateway = new RestApi(this, 'ApiGateway', {
            restApiName: 'RDS API',
            description: 'API Gateway for RDS Cluster',
            // Removed defaultCorsPreflightOptions
        });

        // Integrate the main Lambda with API Gateway
        const mainIntegration = new LambdaIntegration(this.mainLambda, {
            proxy: true,
        });

        // Add a proxy resource at root level
        const proxyResource = this.apiGateway.root.addResource('{proxy+}');
        proxyResource.addMethod('ANY', mainIntegration); // Handles all methods via proxy

        // Optionally, add ANY method to the root resource to handle root path requests
        this.apiGateway.root.addMethod('ANY', mainIntegration);

        // Output the API Gateway URL
        new cdk.CfnOutput(this, 'ApiGatewayUrl', {
            value: this.apiGateway.url,
        });
    }
}
