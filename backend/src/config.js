'use strict';

const path = require('node:path');

/**
 * Load runtime configuration from environment variables.
 * ShardCloud injects `PORT` automatically.
 */
function loadConfig(overrides = {}) {
  const signingSecret =
    overrides.signingSecret ??
    process.env.SIGNING_SECRET ??
    'mailpulse-default-signing-secret';

  return {
    port: Number(overrides.port ?? process.env.PORT ?? 3000),
    signingSecret,
    publicBaseUrl: (overrides.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? '').replace(/\/+$/, ''),
    dataDir: path.resolve(overrides.dataDir ?? process.env.DATA_DIR ?? path.join(__dirname, '..', 'data')),
    openGraceMs: Math.max(0, Number(overrides.openGraceMs ?? process.env.OPEN_GRACE_MS ?? 15000)),
  };
}

module.exports = { loadConfig };
