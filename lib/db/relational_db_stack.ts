import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { PipelineProject } from 'aws-cdk-lib/aws-codebuild';
import { CodeBuildAction, GitHubSourceAction, GitHubTrigger } from 'aws-cdk-lib/aws-codepipeline-actions';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';


interface RelationalDbStackProps extends cdk.StackProps {
    vpc: ec2.Vpc;
}

export class RelationalDbStack extends cdk.NestedStack {
    constructor(scope: Construct, id: string, props: RelationalDbStackProps) {
        super(scope, id, props);

        const vpc = props.vpc;

        // Create a security group for the RDS instance
        const dbSecurityGroup = new ec2.SecurityGroup(this, 'DBSecurityGroup', {
            vpc,
            description: 'Allow database access',
            allowAllOutbound: true,
        });

        // Create a secret for the RDS credentials
        const dbCredentialsSecret = new rds.DatabaseSecret(this, 'DBCredentialsSecret', {
            username: 'admin',
        });

        // Create the RDS instance
        const dbInstance = new rds.DatabaseInstance(this, 'DBInstance', {
            engine: rds.DatabaseInstanceEngine.mysql({
                version: rds.MysqlEngineVersion.VER_8_0_39,
            }),
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
            credentials: rds.Credentials.fromSecret(dbCredentialsSecret),
            vpc,
            securityGroups: [dbSecurityGroup],
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
            },
            databaseName: 'base',
        });

        // Security group for the CodeBuild project
        const codebuildSecurityGroup = new ec2.SecurityGroup(this, 'CodeBuildSecurityGroup', {
            vpc,
            description: 'Allow CodeBuild access to RDS',
            allowAllOutbound: true,
        });

        // Allow CodeBuild to connect to the RDS instance
        dbInstance.connections.allowDefaultPortFrom(codebuildSecurityGroup);

        // Define the build specification
        const buildSpec = codebuild.BuildSpec.fromObject({
            version: '0.2',
            phases: {
                install: {
                    commands: [
                        'echo Downloading MySQL JDBC driver',
                        'mkdir -p /liquibase/classpath',
                        'curl -L -o /liquibase/classpath/mysql-connector-java.jar https://repo1.maven.org/maven2/mysql/mysql-connector-java/8.0.28/mysql-connector-java-8.0.28.jar',
                    ],
                },
                build: {
                    commands: [
                        'echo Running Liquibase changelog',
                        'liquibase \
                          --classpath=/liquibase/classpath/mysql-connector-java.jar \
                          --changeLogFile=src/db/changeLog.sql \
                          --url="jdbc:mysql://${DB_HOST}:${DB_PORT}/${DB_NAME}" \
                          --username=${DB_USER} \
                          --password=${DB_PASSWORD} \
                          --logLevel=FINE \
                          update',
                    ],
                },
            },
        });

        // Define the pipeline
        const pipe = new Pipeline(this, 'MyPipeline');

        // Retrieve GitHub token from Secrets Manager
        const githubToken = Secret.fromSecretNameV2(
            this, 'GitHubToken', 'github-token'
        );

        // Source action for GitHub
        const sourceOut = new Artifact();
        const sourceAction = new GitHubSourceAction({
            actionName: 'GitHub_Source',
            owner: 'AlexTech314',
            repo: 'ProjectBase',
            branch: 'main',  // Replace with the branch you want to use
            oauthToken: githubToken.secretValue,
            output: sourceOut,
            trigger: GitHubTrigger.WEBHOOK,  // Optionally enable webhook for immediate triggers
        });

        // Add the source stage to the pipeline
        pipe.addStage({
            stageName: 'Source',
            actions: [sourceAction],
        });

        // Create the CodeBuild project without a source, as it will receive source code from CodePipeline
        const project = new PipelineProject(this, 'LiquibaseCodeBuildProject', {
            environment: {
                buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('liquibase/liquibase'),
            },
            environmentVariables: {
                DB_HOST: { value: dbInstance.dbInstanceEndpointAddress },
                DB_PORT: { value: dbInstance.dbInstanceEndpointPort },
                DB_NAME: { value: 'base' },
                DB_USER: {
                    type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER,
                    value: `${dbCredentialsSecret.secretArn}:username`,
                },
                DB_PASSWORD: {
                    type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER,
                    value: `${dbCredentialsSecret.secretArn}:password`,
                },
            },
            vpc,
            securityGroups: [codebuildSecurityGroup],
            subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            buildSpec: buildSpec,
        });

        // Grant CodeBuild permissions to access the artifact bucket
        pipe.artifactBucket.grantReadWrite(project.role!);

        // Add the source stage to the pipeline
        pipe.addStage({
            stageName: 'Build',
            actions: [new CodeBuildAction({
                actionName: 'Liquibase',
                project: project,
                input: sourceOut
            })],
        });

        // Grant CodeBuild permissions to read the database secret
        dbCredentialsSecret.grantRead(project.role!);
    }
}

