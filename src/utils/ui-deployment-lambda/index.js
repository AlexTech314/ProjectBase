const { CodeBuildClient, StartBuildCommand, BatchGetBuildsCommand } = require("@aws-sdk/client-codebuild");
const { CloudWatchLogsClient, GetLogEventsCommand } = require("@aws-sdk/client-cloudwatch-logs");

const codebuildClient = new CodeBuildClient({});
const cloudWatchLogsClient = new CloudWatchLogsClient({});

exports.handler = async (event, context) => {
    console.log('Event:', JSON.stringify(event, null, 2));

    // Set the PhysicalResourceId
    let physicalResourceId = event.PhysicalResourceId || event.LogicalResourceId;

    if (event.RequestType === 'Create' || event.RequestType === 'Update') {
        const params = {
            projectName: event.ResourceProperties.ProjectName,
        };

        try {
            const startBuildCommand = new StartBuildCommand(params);
            const buildResponse = await codebuildClient.send(startBuildCommand);
            console.log('Started build:', JSON.stringify(buildResponse, null, 2));

            const buildId = buildResponse.build?.id;
            console.log('Build ID:', buildId);

            if (buildId) {
                let buildStatus = 'IN_PROGRESS';
                while (buildStatus === 'IN_PROGRESS') {
                    await new Promise((resolve) => setTimeout(resolve, 5000));
                    const batchGetBuildsCommand = new BatchGetBuildsCommand({ ids: [buildId] });
                    const buildStatusResp = await codebuildClient.send(batchGetBuildsCommand);

                    console.log('Build status response:', JSON.stringify(buildStatusResp, null, 2));

                    buildStatus = buildStatusResp.builds?.[0].buildStatus || 'FAILED';
                    console.log(`Build status: ${buildStatus}`);
                }
                if (buildStatus !== 'SUCCEEDED') {
                    // Log the complete build details
                    const batchGetBuildsCommand = new BatchGetBuildsCommand({ ids: [buildId] });
                    const buildDetails = await codebuildClient.send(batchGetBuildsCommand);
                    console.log('Build details:', JSON.stringify(buildDetails, null, 2));

                    const logsInfo = buildDetails.builds[0].logs;
                    if (logsInfo && logsInfo.deepLink) {
                        console.log(`Build logs available at: ${logsInfo.deepLink}`);
                    }

                    if (logsInfo && logsInfo.groupName && logsInfo.streamName) {
                        const getLogEventsCommand = new GetLogEventsCommand({
                            logGroupName: logsInfo.groupName,
                            logStreamName: logsInfo.streamName,
                            startFromHead: true,
                        });

                        const logEvents = await cloudWatchLogsClient.send(getLogEventsCommand);

                        const logMessages = logEvents.events.map(event => event.message);

                        const lastFiveMessages = logMessages.slice(-5).join('\n');

                        throw new Error(`Build failed with status: ${buildStatus}\nLast 5 build logs:\n${lastFiveMessages}`);
                    } else {
                        throw new Error(`Build failed with status: ${buildStatus}, but logs are not available.`);
                    }
                }
            } else {
                throw new Error('Failed to start build: No build ID returned.');
            }
        } catch (error) {
            console.error('Error during build:', error);

            return {
                PhysicalResourceId: physicalResourceId,
                Data: {},
                Reason: error.message,
            };
        }
    } else if (event.RequestType === 'Delete') {
        console.log('Delete request received. No action required.');
    }

    return {
        PhysicalResourceId: physicalResourceId,
        Data: {},
    };
};
