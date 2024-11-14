const serverless = require('serverless-http');
const path = require('path');

const app = require(path.join(__dirname, '.next/standalone/server.js'));

exports.handler = serverless(app);
