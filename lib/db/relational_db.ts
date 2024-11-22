import { Construct } from 'constructs';
import {
    BuildEnvironmentVariableType,
    BuildSpec,
    LinuxBuildImage,
    Project,
    Source,
} from 'aws-cdk-lib/aws-codebuild';
import { SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import {
    AuroraMysqlEngineVersion,
    ClusterInstance,
    Credentials,
    DatabaseCluster,
    DatabaseClusterEngine,
    DatabaseSecret,
} from 'aws-cdk-lib/aws-rds';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import * as iam from 'aws-cdk-lib/aws-iam';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Stack } from 'aws-cdk-lib';

interface RelationalDbProps {
    vpc: Vpc;
    deploymentHash: string;
}

export class RelationalDb extends Construct {
    public readonly dbCluster: DatabaseCluster;
    public readonly liquibaseCodeBuild: Project;

    constructor(scope: Construct, id: string, props: RelationalDbProps) {
        super(scope, id);

        const { vpc, deploymentHash } = props;

        const dbCredentialsSecret = new DatabaseSecret(this, 'DBCredentialsSecret', {
            username: 'admin',
        });

        const dbCluster = new DatabaseCluster(this, 'Database', {
            engine: DatabaseClusterEngine.auroraMysql({ version: AuroraMysqlEngineVersion.VER_3_07_1 }),
            writer: ClusterInstance.serverlessV2('writer', {
                scaleWithWriter: true,
            }),
            defaultDatabaseName: 'base',
            credentials: Credentials.fromSecret(dbCredentialsSecret),
            vpcSubnets: {
                subnetType: SubnetType.PRIVATE_ISOLATED,
            },
            vpc: vpc,
        });

        this.dbCluster = dbCluster;

        // Package the source code as an asset
        const sourceAsset = new Asset(this, 'SourceAsset', {
            path: './src/db', // Adjust the path
        });

        // Create the CodeBuild project
        const project = new Project(this, 'LiquibaseCodeBuildProject', {
            source: Source.s3({
                bucket: sourceAsset.bucket,
                path: sourceAsset.s3ObjectKey,
            }),
            environment: {
                buildImage: LinuxBuildImage.fromDockerRegistry('liquibase/liquibase'),
            },
            environmentVariables: {
                DB_HOST: { value: dbCluster.clusterEndpoint.hostname },
                DB_PORT: { value: dbCluster.clusterEndpoint.port.toString() },
                DB_NAME: { value: 'base' },
                DB_USER: {
                    type: BuildEnvironmentVariableType.SECRETS_MANAGER,
                    value: `${dbCredentialsSecret.secretFullArn}:username`,
                },
                DB_PASSWORD: {
                    type: BuildEnvironmentVariableType.SECRETS_MANAGER,
                    value: `${dbCredentialsSecret.secretFullArn}:password`,
                },
            },
            vpc,
            subnetSelection: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
            buildSpec: BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        commands: [
                            'echo Downloading MySQL JDBC driver',
                            'cd $CODEBUILD_SRC_DIR',
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
            }),
        });

        // Grant permissions to CodeBuild for CloudWatch Logs
        project.role!.addToPrincipalPolicy(
            new PolicyStatement({
                actions: [
                    'logs:PutLogEvents',
                    'logs:CreateLogGroup',
                    'logs:CreateLogStream',
                ],
                resources: [
                    `arn:aws:logs:${Stack.of(this).region}:${Stack.of(this).account}:*`,
                ],
            })
        );

        this.liquibaseCodeBuild = project;

        // Grant permissions
        dbCredentialsSecret.grantRead(this.liquibaseCodeBuild.role!);
        dbCluster.connections.allowDefaultPortFrom(project);

        // Create AwsCustomResource to start the build
        const startBuild = new AwsCustomResource(this, 'StartLiquibaseBuild', {
            onUpdate: {
                service: 'CodeBuild',
                action: 'startBuild',
                parameters: {
                    projectName: this.liquibaseCodeBuild.projectName,
                },
                physicalResourceId: PhysicalResourceId.of(`StartBuild-${deploymentHash}`),
            },
            policy: AwsCustomResourcePolicy.fromStatements([
                new iam.PolicyStatement({
                    actions: ['codebuild:StartBuild'],
                    resources: [this.liquibaseCodeBuild.projectArn],
                }),
            ]),
        });

        // Ensure the custom resource runs after the project is created
        startBuild.node.addDependency(this.liquibaseCodeBuild);
    }
}
