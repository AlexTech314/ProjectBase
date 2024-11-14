const { parse } = require('url');
const next = require('next');
const serverless = require('serverless-http');

const app = next({ dev: false });
const handle = app.getRequestHandler();

exports.handler = async (event, context) => {
  await app.prepare();

  // Determine the URL path based on the API Gateway configuration
  const urlPath = event.path || '/';
  
  try {
    // Log the event for debugging purposes
    console.log("Event:", JSON.stringify(event));

    // Parse the URL to ensure it's handled correctly by Next.js
    const parsedUrl = parse(urlPath, true);

    // Pass the parsed request to serverless-http handler
    return serverless((req, res) => handle(req, res))(event, context);
  } catch (error) {
    console.error("Error handling request:", error);
    throw error;
  }
};
