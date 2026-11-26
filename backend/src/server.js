'use strict';

const http = require('node:http');
const { loadConfig } = require('./config');
const { TrackStore } = require('./store');
const { createRequestHandler } = require('./routes');

function createApp(overrides = {}) {
  const config = loadConfig(overrides);
  const store = new TrackStore(config.dataDir);
  const handler = createRequestHandler({ config, store });
  const server = http.createServer(handler);
  return { server, config, store };
}

if (require.main === module) {
  const { server, config } = createApp();
  server.listen(config.port, '0.0.0.0', () => {
    console.log(`[mailpulse-backend] Listening on http://0.0.0.0:${config.port}`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { createApp };
