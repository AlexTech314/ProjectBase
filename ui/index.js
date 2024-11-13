const serverless = require('serverless-http');
const next = require('next');

const app = next({
  dev: false,
  conf: {
    // Any custom Next.js configuration goes here
  },
});

const handle = app.getRequestHandler();

exports.handler = async (event, context) => {
  await app.prepare();
  return serverless((req, res) => handle(req, res))(event, context);
};
