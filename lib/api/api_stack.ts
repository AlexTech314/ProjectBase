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

interface ApiStackProps extends cdk.StackProps {
    vpc: Vpc;
    dbCluster: DatabaseCluster;
    dbCredentialsSecret: DatabaseSecret;
}

export class ApiStack extends cdk.NestedStack {
    constructor(scope: Construct, id: string, props: ApiStackProps) {
        super(scope, id, props);

        const { vpc, dbCluster, dbCredentialsSecret } = props;

        // Create a security group for the Lambda function
        const lambdaSecurityGroup = new SecurityGroup(this, 'LambdaSecurityGroup', {
            vpc,
            description: 'Security group for Lambda to access RDS',
            allowAllOutbound: true,
        });

        // Allow Lambda's security group to connect to the DB's default port
        dbCluster.connections.allowDefaultPortFrom(lambdaSecurityGroup, 'Allow Lambda to connect to DB');

        // Create the Lambda function using DockerImageFunction
        const lambdaFunction = new DockerImageFunction(this, 'ApiLambdaFunction', {
            code: DockerImageCode.fromImageAsset('./src/api', {
                cmd: ['index.handler'], // Ensure the correct handler is specified
            }),
            vpc,
            vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
            securityGroups: [lambdaSecurityGroup],
            environment: {
                DB_HOST: dbCluster.clusterEndpoint.hostname,
                DB_PORT: dbCluster.clusterEndpoint.port.toString(),
                DB_NAME: 'base', // Replace with your database name if different
                DB_SECRET_ARN: dbCredentialsSecret.secretArn,
            },
        });

        // Grant the Lambda function permissions to read the database secret
        dbCredentialsSecret.grantRead(lambdaFunction);

        // Create API Gateway and integrate it with the Lambda function
        new LambdaRestApi(this, 'ApiGateway', {
            handler: lambdaFunction,
            proxy: true,
        });

    }
}
