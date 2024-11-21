const AWS = require('aws-sdk');

exports.handler = async (event, context) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  const apigateway = new AWS.APIGateway();
  const lambda = new AWS.Lambda();

  // Set the PhysicalResourceId
  let physicalResourceId = event.PhysicalResourceId || event.LogicalResourceId;

  if (event.RequestType === 'Create' || event.RequestType === 'Update') {
    const restApiId = event.ResourceProperties.RestApiId;
    const allowedOrigin = event.ResourceProperties.AllowedOrigin;
    const stageName = event.ResourceProperties.StageName || 'prod';

    try {
      // Step 1: Get all resources of the API
      const getResourcesRecursively = async (position) => {
        const params = { restApiId, limit: 500 };
        if (position) params.position = position;
        const result = await apigateway.getResources(params).promise();
        if (result.position) {
          return result.items.concat(await getResourcesRecursively(result.position));
        }
        return result.items;
      };

      const resources = await getResourcesRecursively();
      console.log('API Resources:', JSON.stringify(resources, null, 2));

      const lambdaFunctionArnsSet = new Set();

      // Step 2: Iterate through resources and methods
      for (const resource of resources) {
        const resourceId = resource.id;
        const resourcePath = resource.path;

        // Ensure OPTIONS method exists
        if (!resource.resourceMethods || !resource.resourceMethods.OPTIONS) {
          console.log(`Creating OPTIONS method for resource ${resourcePath}`);

          // Create OPTIONS method
          await apigateway.putMethod({
            restApiId,
            resourceId,
            httpMethod: 'OPTIONS',
            authorizationType: 'NONE',
          }).promise();

          // Define method response
          await apigateway.putMethodResponse({
            restApiId,
            resourceId,
            httpMethod: 'OPTIONS',
            statusCode: '200',
            responseModels: {
              'application/json': 'Empty',
            },
            responseParameters: {
              'method.response.header.Access-Control-Allow-Headers': true,
              'method.response.header.Access-Control-Allow-Methods': true,
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          }).promise();

          // Define integration
          await apigateway.putIntegration({
            restApiId,
            resourceId,
            httpMethod: 'OPTIONS',
            type: 'MOCK',
            requestTemplates: {
              'application/json': '{"statusCode": 200}',
            },
          }).promise();

          // Define integration response
          await apigateway.putIntegrationResponse({
            restApiId,
            resourceId,
            httpMethod: 'OPTIONS',
            statusCode: '200',
            responseTemplates: {
              'application/json': '',
            },
            responseParameters: {
              'method.response.header.Access-Control-Allow-Headers':
                "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
              'method.response.header.Access-Control-Allow-Methods':
                "'GET,POST,PUT,DELETE,OPTIONS'",
              'method.response.header.Access-Control-Allow-Origin': `'${allowedOrigin}'`,
            },
          }).promise();
        }

        // Update existing methods to include CORS headers and collect Lambda ARNs
        if (resource.resourceMethods) {
          const methods = Object.keys(resource.resourceMethods).filter((m) => m !== 'OPTIONS');

          for (const method of methods) {
            console.log(`Processing method ${method} for resource ${resourcePath}`);

            // Get integration to find the Lambda function ARN
            const integration = await apigateway.getIntegration({
              restApiId,
              resourceId,
              httpMethod: method,
            }).promise();

            if (integration.type === 'AWS' && integration.uri.includes('lambda:path')) {
              // Extract the Lambda function ARN from the integration URI
              const uriParts = integration.uri.split(':');
              const functionArn = uriParts.slice(uriParts.indexOf('functions') + 1, uriParts.indexOf('invocations')).join(':');
              console.log(`Found Lambda function ARN: ${functionArn}`);
              lambdaFunctionArnsSet.add(functionArn);
            }

            // Add response parameters to method response
            try {
              await apigateway.updateMethodResponse({
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
              }).promise();
            } catch (error) {
              if (error.code === 'NotFoundException') {
                // Create method response if it doesn't exist
                await apigateway.putMethodResponse({
                  restApiId,
                  resourceId,
                  httpMethod: method,
                  statusCode: '200',
                  responseModels: {
                    'application/json': 'Empty',
                  },
                  responseParameters: {
                    'method.response.header.Access-Control-Allow-Origin': false,
                  },
                }).promise();
              } else {
                throw error;
              }
            }

            // Add response parameters to integration response
            try {
              await apigateway.updateIntegrationResponse({
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
              }).promise();
            } catch (error) {
              if (error.code === 'NotFoundException') {
                // Create integration response if it doesn't exist
                await apigateway.putIntegrationResponse({
                  restApiId,
                  resourceId,
                  httpMethod: method,
                  statusCode: '200',
                  responseTemplates: {
                    'application/json': '',
                  },
                  responseParameters: {
                    'method.response.header.Access-Control-Allow-Origin': `'${allowedOrigin}'`,
                  },
                }).promise();
              } else {
                throw error;
              }
            }
          }
        }
      }

      // Step 3: Deploy the API to apply the changes
      await apigateway.createDeployment({
        restApiId,
        stageName,
        description: 'Deployment for CORS configuration',
      }).promise();

      // Step 4: Update ALLOWED_ORIGIN environment variable in Lambda functions
      const lambdaFunctionArns = Array.from(lambdaFunctionArnsSet);
      console.log('Lambda Functions to update:', lambdaFunctionArns);

      for (const functionArn of lambdaFunctionArns) {
        console.log(`Updating environment variable for Lambda function: ${functionArn}`);

        // Get current function configuration
        const functionConfig = await lambda.getFunctionConfiguration({
          FunctionName: functionArn,
        }).promise();

        // Update environment variables
        const newEnv = {
          ...functionConfig.Environment?.Variables,
          ALLOWED_ORIGIN: allowedOrigin,
        };

        // Update function configuration
        await lambda.updateFunctionConfiguration({
          FunctionName: functionArn,
          Environment: {
            Variables: newEnv,
          },
        }).promise();
      }
    } catch (error) {
      console.error('Error:', error);
      throw error;
    }
  } else if (event.RequestType === 'Delete') {
    // No action needed for delete, but ensure PhysicalResourceId remains the same
    console.log('Delete request received. No action required.');
  }

  return {
    PhysicalResourceId: physicalResourceId,
    Data: {},
  };
};