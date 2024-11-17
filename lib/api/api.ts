import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DatabaseCluster, DatabaseSecret } from 'aws-cdk-lib/aws-rds';
import {
    Vpc,
    SubnetType,
    SecurityGroup,
} from 'aws-cdk-lib/aws-ec2';
import { LambdaRestApi } from 'aws-cdk-lib/aws-apigateway';
import { DockerImageCode, DockerImageFunction } from 'aws-cdk-lib/aws-lambda';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

interface ApiProps {
    vpc: Vpc;
    dbCluster: DatabaseCluster;
    dbCredentialsSecret: DatabaseSecret;
    lambdaSecurityGroup: SecurityGroup;
}

export class Api extends Construct {
    public readonly url: string
    constructor(scope: Construct, id: string, props: ApiProps) {
        super(scope, id);

        const { vpc, dbCluster, dbCredentialsSecret, lambdaSecurityGroup } = props;

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
                DB_SECRET_ARN: dbCredentialsSecret.secretFullArn || '',
            },
        });

        dbCredentialsSecret.grantRead(lambdaFunction.role!)        

        // Create API Gateway and integrate it with the Lambda function
        const apiGateway = new LambdaRestApi(this, 'ApiGateway', {
            handler: lambdaFunction,
            proxy: true,
        });

        this.url = apiGateway.url

        // Output the API Gateway URL
        new cdk.CfnOutput(this, 'ApiGatewayUrl', {
            value: apiGateway.url,
        });
    }
}
