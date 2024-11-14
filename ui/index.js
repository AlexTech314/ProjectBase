const serverless = require('serverless-http');
const next = require('next');

const app = next({
  dev: false,
  conf: {
    compress: false,
    poweredByHeader: false,
    generateEtags: false
  },
});

const handle = app.getRequestHandler();

exports.handler = async (event, context) => {
  await app.prepare();
  return serverless((req, res) => handle(req, res))(event, context);
};
