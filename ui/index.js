const { parse } = require('url');
const next = require('next');
const serverless = require('serverless-http');

const app = next({ dev: false });
const handle = app.getRequestHandler();

exports.handler = async (event, context) => {
  const parsedUrl = parse(event.rawPath, true);
  const { pathname } = parsedUrl;

  if (pathname.startsWith('/_next') || pathname.startsWith('/static')) {
    return serverless((req, res) => handle(req, res))(event, context);
  }

  await app.prepare();
  return serverless((req, res) => handle(req, res))(event, context);
};