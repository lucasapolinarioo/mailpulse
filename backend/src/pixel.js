'use strict';

const crypto = require('node:crypto');

// 1x1 transparent GIF (43 bytes)
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

/**
 * Sign a redirect target URL for a given track ID using HMAC-SHA256.
 * Prevents open-redirect abuse on the tracking domain.
 */
function signLink(trackId, targetUrl, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${trackId}:${targetUrl}`)
    .digest('base64url')
    .slice(0, 22);
}

/**
 * Verify a link signature in constant time.
 */
function verifyLinkSignature(trackId, targetUrl, signature, secret) {
  if (!signature || typeof signature !== 'string') return false;
  const expected = signLink(trackId, targetUrl, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Validate that a redirect URL uses http: or https:.
 */
function isSafeHttpUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

module.exports = {
  TRANSPARENT_GIF,
  signLink,
  verifyLinkSignature,
  isSafeHttpUrl,
};
