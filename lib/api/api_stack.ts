import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DatabaseCluster } from 'aws-cdk-lib/aws-rds';
import {
    Vpc,
    SubnetType,
    SecurityGroup,
} from 'aws-cdk-lib/aws-ec2';
import { LambdaRestApi } from 'aws-cdk-lib/aws-apigateway';
import { DockerImageCode, DockerImageFunction } from 'aws-cdk-lib/aws-lambda';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

interface ApiStackProps extends cdk.StackProps {
    vpc: Vpc;
    dbCluster: DatabaseCluster;
    dbCredentialsSecretArn: string;
    lambdaSecurityGroup: SecurityGroup;
}

export class ApiStack extends cdk.NestedStack {
    constructor(scope: Construct, id: string, props: ApiStackProps) {
        super(scope, id, props);

        const { vpc, dbCluster, dbCredentialsSecretArn, lambdaSecurityGroup } = props;

        // Create the Lambda function using DockerImageFunction
        const lambdaFunction = new DockerImageFunction(this, 'ApiLambdaFunction', {
            code: DockerImageCode.fromImageAsset('./api'),
            vpc,
            vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
            securityGroups: [lambdaSecurityGroup],
            environment: {
                DB_HOST: dbCluster.clusterEndpoint.hostname,
                DB_PORT: dbCluster.clusterEndpoint.port.toString(),
                DB_NAME: 'base', // Replace with your database name if different
                DB_SECRET_ARN: dbCredentialsSecretArn,
            },
        });

        // Grant the Lambda function permissions to read the database secret        
        lambdaFunction.role?.addToPrincipalPolicy(new PolicyStatement({
            actions: ['secretsmanager:GetSecretValue'],
            resources: [dbCredentialsSecretArn],
        }));    

        // Create API Gateway and integrate it with the Lambda function
        const apiGateway = new LambdaRestApi(this, 'ApiGateway', {
            handler: lambdaFunction,
            proxy: true,
        });

        // Output the API Gateway URL
        new cdk.CfnOutput(this, 'ApiGatewayUrl', {
            value: apiGateway.url,
        });
    }
}
