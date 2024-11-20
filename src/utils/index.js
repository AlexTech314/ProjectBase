import { CodeBuild } from 'aws-sdk';

exports.handler = async(event, context) => {
  const codebuild = new CodeBuild();

  if (event.RequestType === 'Create' || event.RequestType === 'Update') {
    const params = {
      projectName: event.ResourceProperties.ProjectName,
    };
    const build = await codebuild.startBuild(params).promise();

    // Wait for the build to complete
    const buildId = build.build?.id;
    if (buildId) {
      let buildStatus = 'IN_PROGRESS';
      while (buildStatus === 'IN_PROGRESS') {
        await new Promise((r) => setTimeout(r, 5000));
        const buildStatusResp = await codebuild.batchGetBuilds({ ids: [buildId] }).promise();
        buildStatus = buildStatusResp.builds?.[0].buildStatus || 'FAILED';
        console.log(`Build status: ${buildStatus}`);
      }
      if (buildStatus !== 'SUCCEEDED') {
        throw new Error(`Build failed with status: ${buildStatus}`);
      }
    } else {
      throw new Error('Failed to start build');
    }
  }

  return {
    PhysicalResourceId: context.logStreamName,
    Data: {},
  };
}
