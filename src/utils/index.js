const AWS = require('aws-sdk');

exports.handler = async (event, context) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    const codebuild = new AWS.CodeBuild();

    const params = {
        projectName: event.ResourceProperties.ProjectName,
    };

    try {
        const build = await codebuild.startBuild(params).promise();
        console.log('Started build:', JSON.stringify(build, null, 2));

        // Wait for the build to complete
        const buildId = build.build?.id;
        console.log('Build ID:', buildId);

        if (buildId) {
            let buildStatus = 'IN_PROGRESS';
            while (buildStatus === 'IN_PROGRESS') {
                await new Promise((r) => setTimeout(r, 5000));
                const buildStatusResp = await codebuild.batchGetBuilds({ ids: [buildId] }).promise();

                console.log('Build status response:', JSON.stringify(buildStatusResp, null, 2));

                buildStatus = buildStatusResp.builds?.[0].buildStatus || 'FAILED';
                console.log(`Build status: ${buildStatus}`);
            }
            if (buildStatus !== 'SUCCEEDED') {
                // Log the complete build details
                const buildDetails = await codebuild.batchGetBuilds({ ids: [buildId] }).promise();
                console.log('Build details:', JSON.stringify(buildDetails, null, 2));

                // Extract logs information
                const logsInfo = buildDetails.builds[0].logs;
                if (logsInfo && logsInfo.deepLink) {
                    console.log(`Build logs available at: ${logsInfo.deepLink}`);
                }

                // Retrieve CloudWatch Logs for the build
                if (logsInfo && logsInfo.groupName && logsInfo.streamName) {
                    const cloudwatchlogs = new AWS.CloudWatchLogs();
                    const logEvents = await cloudwatchlogs.getLogEvents({
                        logGroupName: logsInfo.groupName,
                        logStreamName: logsInfo.streamName,
                        startFromHead: true,
                    }).promise();

                    // Collect log messages as an array
                    const logMessages = logEvents.events.map(event => event.message);

                    // Get the last 5 messages
                    const lastFiveMessages = logMessages.slice(-5).join('\n');

                    // Include the last 5 log messages in the error
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
        throw error;
    }


    return {
        PhysicalResourceId: context.logStreamName,
        Data: {},
    };
};
