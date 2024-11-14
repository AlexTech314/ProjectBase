const serverless = require('serverless-http');
const path = require('path');

const app = require(path.join(__dirname, '.next/standalone/server.js'));

const handle = app.getRequestHandler();

exports.handler = async (event, context) => {
  await app.prepare();
  return serverless((req, res) => handle(req, res))(event, context);
};
