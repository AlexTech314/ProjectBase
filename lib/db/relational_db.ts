import { Construct } from 'constructs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { BuildEnvironmentVariableType, BuildSpec, LinuxBuildImage, PipelineProject } from 'aws-cdk-lib/aws-codebuild';
import { CodeBuildAction, GitHubSourceAction, GitHubTrigger } from 'aws-cdk-lib/aws-codepipeline-actions';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import { SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { AuroraMysqlEngineVersion, ClusterInstance, Credentials, DatabaseCluster, DatabaseClusterEngine, DatabaseSecret } from 'aws-cdk-lib/aws-rds';


interface RelationalDbProps {
    vpc: Vpc
}

export class RelationalDb extends Construct {
    public readonly dbCluster: DatabaseCluster;
    public readonly liquibaseCodeBuild: PipelineProject;

    constructor(scope: Construct, id: string, props: RelationalDbProps) {
        super(scope, id);

        const { vpc } = props;

        const dbCredentialsSecret = new DatabaseSecret(this, 'DBCredentialsSecret', {
            username: 'admin',
        });

        const dbCluster = new DatabaseCluster(this, 'Database', {
            engine: DatabaseClusterEngine.auroraMysql({ version: AuroraMysqlEngineVersion.VER_3_07_1 }),
            writer: ClusterInstance.serverlessV2('writer', {
                scaleWithWriter: true
            }),
            defaultDatabaseName: 'base',
            credentials: Credentials.fromSecret(dbCredentialsSecret),
            vpcSubnets: {
                subnetType: SubnetType.PRIVATE_ISOLATED,
            },
            vpc: vpc
        })

        this.dbCluster = dbCluster;

        // Define the build specification
        const buildSpec = BuildSpec.fromObject({
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
            buildSpec: buildSpec,
        });

        this.liquibaseCodeBuild = project

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

        dbCredentialsSecret.grantRead(this.liquibaseCodeBuild.role!)
        dbCluster.connections.allowDefaultPortFrom(project)
    }
}

