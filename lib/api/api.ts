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
import { DockerImageCode, DockerImageFunction, Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { DatabaseCluster } from 'aws-cdk-lib/aws-rds';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';

interface ApiProps {
    vpc: Vpc;
    dbCluster: DatabaseCluster;
}

export class Api extends Construct {
    public readonly url: string;
    private readonly apiGateway: RestApi;
    private readonly mainLambda: DockerImageFunction;

    constructor(scope: Construct, id: string, props: ApiProps) {
        super(scope, id);

        const { vpc, dbCluster } = props;

        // Create the main Lambda function using DockerImageFunction
        this.mainLambda = new DockerImageFunction(this, 'ApiLambdaFunction', {
            code: DockerImageCode.fromImageAsset('./src/api/main'),
            vpc,
            vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
            environment: {
                DB_HOST: dbCluster.clusterEndpoint.hostname,
                DB_PORT: dbCluster.clusterEndpoint.port.toString(),
                DB_NAME: 'base',
                DB_SECRET_ARN: dbCluster.secret!.secretFullArn || '',
            },
        });

        // Grant the main Lambda read access to the RDS secret
        dbCluster.secret!.grantRead(this.mainLambda.role!);
        // Allow the main Lambda to connect to the RDS cluster on default port 3306
        dbCluster.connections.allowDefaultPortFrom(this.mainLambda, 'Allow Lambda to connect to RDS');

        // Create API Gateway as a RestApi for more flexibility
        this.apiGateway = new RestApi(this, 'ApiGateway', {
            restApiName: 'RDS API',
            description: 'API Gateway for RDS Cluster',
            defaultCorsPreflightOptions: undefined, // We'll handle CORS manually
        });

        // Integrate the main Lambda with API Gateway
        const mainIntegration = new LambdaIntegration(this.mainLambda, {
            proxy: true,
        });

        // Add a root resource and method
        const root = this.apiGateway.root;
        root.addMethod('ANY', mainIntegration); // Handles all methods via proxy

        this.url = this.apiGateway.url;

        // Output the API Gateway URL
        new cdk.CfnOutput(this, 'ApiGatewayUrl', {
            value: this.apiGateway.url,
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
