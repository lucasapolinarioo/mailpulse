'use strict';

const crypto = require('node:crypto');
const { TRANSPARENT_GIF, signLink, verifyLinkSignature, isSafeHttpUrl } = require('./pixel');

const MAX_BODY_BYTES = 64 * 1024;

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Token',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendPixel(res) {
  res.writeHead(200, {
    'Content-Type': 'image/gif',
    'Content-Length': TRANSPARENT_GIF.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(TRANSPARENT_GIF);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '';
}

function resolveBaseUrl(req, config) {
  if (config.publicBaseUrl) return config.publicBaseUrl;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${config.port}`;
  return `${proto}://${host}`;
}

function getOwnerHash(req) {
  const headerToken = req.headers['x-client-token'];
  const auth = req.headers.authorization;
  const bearer = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const token = String(headerToken || bearer || '').trim();
  if (token.length < 16) return null;
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sanitizeTrack(track) {
  if (!track) return null;
  const { ownerHash: _omitted, ...publicTrack } = track;
  return publicTrack;
}

function buildSignedLinks(trackId, links, baseUrl, signingSecret) {
  if (!Array.isArray(links)) return {};
  const result = {};
  for (const rawUrl of links.slice(0, 50)) {
    if (typeof rawUrl !== 'string' || !isSafeHttpUrl(rawUrl)) continue;
    const sig = signLink(trackId, rawUrl, signingSecret);
    result[rawUrl] = `${baseUrl}/c/${encodeURIComponent(trackId)}?u=${encodeURIComponent(rawUrl)}&sig=${encodeURIComponent(sig)}`;
  }
  return result;
}

function createRequestHandler({ config, store }) {
  return async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Token',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      });
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // Public root & healthcheck
    if (req.method === 'GET' && (pathname === '/' || pathname === '/health')) {
      return sendJson(res, 200, {
        ok: true,
        service: 'mailpulse-backend',
        version: '1.0.0',
      });
    }

    // Tracking pixel: GET /t/:id(.gif|.png)
    if (req.method === 'GET' && pathname.startsWith('/t/')) {
      const rawId = pathname.slice(3).replace(/\.(gif|png)$/i, '');
      const trackId = decodeURIComponent(rawId);
      const referer = String(req.headers.referer || '');
      const isGmailComposeLoad = referer.startsWith('https://mail.google.com/');
      if (trackId && !isGmailComposeLoad) {
        store.recordOpen(trackId, {
          userAgent: req.headers['user-agent'] || '',
          ip: getClientIp(req),
          graceMs: config.openGraceMs,
        });
      }
      return sendPixel(res);
    }

    // Click redirect: GET /c/:id?u=<url>&sig=<sig>
    if (req.method === 'GET' && pathname.startsWith('/c/')) {
      const trackId = decodeURIComponent(pathname.slice(3));
      const targetUrl = url.searchParams.get('u') || '';
      const sig = url.searchParams.get('sig') || '';

      if (!isSafeHttpUrl(targetUrl) || !verifyLinkSignature(trackId, targetUrl, sig, config.signingSecret)) {
        return sendJson(res, 400, { error: 'Invalid or unsigned redirect URL' });
      }

      store.recordClick(trackId, {
        url: targetUrl,
        userAgent: req.headers['user-agent'] || '',
        ip: getClientIp(req),
      });

      res.writeHead(302, {
        Location: targetUrl,
        'Cache-Control': 'no-store',
      });
      res.end();
      return;
    }

    // Protected API routes (isolated per anonymous client token)
    if (pathname.startsWith('/api/')) {
      const ownerHash = getOwnerHash(req);
      if (!ownerHash) {
        return sendJson(res, 401, { error: 'Missing or invalid X-Client-Token' });
      }

      if (req.method === 'POST' && pathname === '/api/tracks') {
        let body;
        try {
          body = await readJsonBody(req);
        } catch (err) {
          return sendJson(res, 400, { error: err.message });
        }

        const track = store.createTrack({
          ownerHash,
          subject: body.subject,
          recipients: body.recipients,
        });
        const baseUrl = resolveBaseUrl(req, config);
        const pixelUrl = `${baseUrl}/t/${encodeURIComponent(track.id)}.gif`;
        const signedLinks = buildSignedLinks(track.id, body.links, baseUrl, config.signingSecret);

        return sendJson(res, 201, {
          track: sanitizeTrack(track),
          pixelUrl,
          signedLinks,
        });
      }

      if (req.method === 'GET' && pathname === '/api/tracks') {
        const idsParam = url.searchParams.get('ids');
        const ids = idsParam
          ? idsParam.split(',').map((s) => s.trim()).filter(Boolean)
          : null;
        const limit = Number(url.searchParams.get('limit') || 100);
        const tracks = store.listTracks({ ownerHash, ids, limit }).map(sanitizeTrack);
        return sendJson(res, 200, { tracks });
      }

      const trackMatch = pathname.match(/^\/api\/tracks\/([^/]+)$/);
      if (trackMatch) {
        const trackId = decodeURIComponent(trackMatch[1]);
        if (req.method === 'GET') {
          const track = store.getTrack(trackId, ownerHash);
          if (!track) return sendJson(res, 404, { error: 'Track not found' });
          return sendJson(res, 200, { track: sanitizeTrack(track) });
        }
        if (req.method === 'DELETE') {
          const deleted = store.deleteTrack(trackId, ownerHash);
          if (!deleted) return sendJson(res, 404, { error: 'Track not found' });
          return sendJson(res, 200, { ok: true });
        }
      }

      return sendJson(res, 404, { error: 'Not found' });
    }

    return sendJson(res, 404, { error: 'Not found' });
  };
}

module.exports = { createRequestHandler };
