const {
  APIGatewayClient,
  GetResourcesCommand,
  PutMethodCommand,
  PutMethodResponseCommand,
  PutIntegrationCommand,
  PutIntegrationResponseCommand,
  UpdateMethodResponseCommand,
  UpdateIntegrationResponseCommand,
  CreateDeploymentCommand,
} = require("@aws-sdk/client-api-gateway");

const apiGatewayClient = new APIGatewayClient({});

exports.handler = async (event, context) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  const physicalResourceId = event.PhysicalResourceId || event.LogicalResourceId;

  if (event.RequestType === 'Create' || event.RequestType === 'Update') {
    const restApiId = event.ResourceProperties.RestApiId;
    const allowedOrigin = event.ResourceProperties.AllowedOrigin;
    const stageName = event.ResourceProperties.StageName || 'prod';

    try {
      const getResourcesRecursively = async (position) => {
        const params = { restApiId, limit: 500, position };
        const command = new GetResourcesCommand(params);
        const result = await apiGatewayClient.send(command);

        if (result.position) {
          return result.items.concat(await getResourcesRecursively(result.position));
        }
        return result.items;
      };

      const resources = await getResourcesRecursively();
      console.log('API Resources:', JSON.stringify(resources, null, 2));

      for (const resource of resources) {
        const resourceId = resource.id;
        const resourcePath = resource.path;

        if (!resource.resourceMethods || !resource.resourceMethods.OPTIONS) {
          console.log(`Creating OPTIONS method for resource ${resourcePath}`);

          await apiGatewayClient.send(
            new PutMethodCommand({
              restApiId,
              resourceId,
              httpMethod: 'OPTIONS',
              authorizationType: 'NONE',
            })
          );

          await apiGatewayClient.send(
            new PutMethodResponseCommand({
              restApiId,
              resourceId,
              httpMethod: 'OPTIONS',
              statusCode: '200',
              responseModels: { 'application/json': 'Empty' },
              responseParameters: {
                'method.response.header.Access-Control-Allow-Headers': true,
                'method.response.header.Access-Control-Allow-Methods': true,
                'method.response.header.Access-Control-Allow-Origin': true,
              },
            })
          );

          await apiGatewayClient.send(
            new PutIntegrationCommand({
              restApiId,
              resourceId,
              httpMethod: 'OPTIONS',
              type: 'MOCK',
              requestTemplates: { 'application/json': '{"statusCode": 200}' },
            })
          );

          await apiGatewayClient.send(
            new PutIntegrationResponseCommand({
              restApiId,
              resourceId,
              httpMethod: 'OPTIONS',
              statusCode: '200',
              responseTemplates: { 'application/json': '' },
              responseParameters: {
                'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
                'method.response.header.Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'",
                'method.response.header.Access-Control-Allow-Origin': `'${allowedOrigin}'`,
              },
            })
          );
        }

        if (resource.resourceMethods) {
          const methods = Object.keys(resource.resourceMethods).filter((m) => m !== 'OPTIONS');

          for (const method of methods) {
            console.log(`Processing method ${method} for resource ${resourcePath}`);

            try {
              await apiGatewayClient.send(
                new UpdateMethodResponseCommand({
                  restApiId,
                  resourceId,
                  httpMethod: method,
                  statusCode: '200',
                  patchOperations: [
                    {
                      op: 'add',
                      path: '/responseParameters/method.response.header.Access-Control-Allow-Origin',
                      value: 'false',
                    },
                  ],
                })
              );
            } catch (error) {
              if (error.name === 'NotFoundException') {
                await apiGatewayClient.send(
                  new PutMethodResponseCommand({
                    restApiId,
                    resourceId,
                    httpMethod: method,
                    statusCode: '200',
                    responseModels: { 'application/json': 'Empty' },
                    responseParameters: { 'method.response.header.Access-Control-Allow-Origin': false },
                  })
                );
              } else {
                throw error;
              }
            }

            try {
              await apiGatewayClient.send(
                new UpdateIntegrationResponseCommand({
                  restApiId,
                  resourceId,
                  httpMethod: method,
                  statusCode: '200',
                  patchOperations: [
                    {
                      op: 'add',
                      path: '/responseParameters/method.response.header.Access-Control-Allow-Origin',
                      value: `'${allowedOrigin}'`,
                    },
                  ],
                })
              );
            } catch (error) {
              if (error.name === 'NotFoundException') {
                await apiGatewayClient.send(
                  new PutIntegrationResponseCommand({
                    restApiId,
                    resourceId,
                    httpMethod: method,
                    statusCode: '200',
                    responseTemplates: { 'application/json': '' },
                    responseParameters: {
                      'method.response.header.Access-Control-Allow-Origin': `'${allowedOrigin}'`,
                    },
                  })
                );
              } else {
                throw error;
              }
            }
          }
        }
      }

      console.log(`Deploying API to stage ${stageName}`);
      await apiGatewayClient.send(
        new CreateDeploymentCommand({
          restApiId,
          stageName,
          description: 'Deployment for CORS configuration',
        })
      );
    } catch (error) {
      console.error('Error:', error);
      throw error;
    }
  } else if (event.RequestType === 'Delete') {
    console.log('Delete request received. No action required.');
  }

  return {
    PhysicalResourceId: physicalResourceId,
    Data: {},
  };
};
