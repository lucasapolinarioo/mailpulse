'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/server');

const TOKEN_A = 'client-token-user-a-1234567890';
const TOKEN_B = 'client-token-user-b-0987654321';

async function withServer(overrides, fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailpulse-test-'));
  const { server } = createApp({ dataDir: tmpDir, port: 0, ...overrides });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await fn(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('healthcheck returns ok', async () => {
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.service, 'mailpulse-backend');
  });
});

test('API rejects missing/short client token and isolates tracks per user', async () => {
  await withServer({}, async (baseUrl) => {
    const unauth = await fetch(`${baseUrl}/api/tracks`);
    assert.equal(unauth.status, 401);

    const shortTok = await fetch(`${baseUrl}/api/tracks`, {
      headers: { 'X-Client-Token': 'too-short' },
    });
    assert.equal(shortTok.status, 401);

    // User A creates a track
    const createA = await fetch(`${baseUrl}/api/tracks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Token': TOKEN_A,
      },
      body: JSON.stringify({ subject: 'Email do A' }),
    });
    assert.equal(createA.status, 201);
    const { track: trackA } = await createA.json();
    assert.equal(trackA.ownerHash, undefined);

    // User B cannot see or delete User A's track
    const listB = await fetch(`${baseUrl}/api/tracks`, {
      headers: { 'X-Client-Token': TOKEN_B },
    });
    assert.equal(listB.status, 200);
    assert.deepEqual((await listB.json()).tracks, []);

    const getB = await fetch(`${baseUrl}/api/tracks/${trackA.id}`, {
      headers: { 'X-Client-Token': TOKEN_B },
    });
    assert.equal(getB.status, 404);

    const delB = await fetch(`${baseUrl}/api/tracks/${trackA.id}`, {
      method: 'DELETE',
      headers: { 'X-Client-Token': TOKEN_B },
    });
    assert.equal(delB.status, 404);

    // User A sees their own track
    const listA = await fetch(`${baseUrl}/api/tracks`, {
      headers: { 'X-Client-Token': TOKEN_A },
    });
    assert.equal((await listA.json()).tracks.length, 1);
  });
});

test('creates track, records pixel open, and signs/tracks link clicks', async () => {
  await withServer({ openGraceMs: 0 }, async (baseUrl) => {
    const createRes = await fetch(`${baseUrl}/api/tracks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Token': TOKEN_A,
      },
      body: JSON.stringify({
        subject: 'Proposta Comercial',
        recipients: ['cliente@example.com'],
        links: ['https://example.com/docs', 'javascript:alert(1)'],
      }),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.ok(created.track.id);
    assert.ok(created.pixelUrl.endsWith(`/t/${created.track.id}.gif`));
    assert.ok(created.signedLinks['https://example.com/docs']);
    assert.equal(created.signedLinks['javascript:alert(1)'], undefined);

    const pixelRes = await fetch(created.pixelUrl, {
      headers: { 'User-Agent': 'TestMailClient/1.0' },
    });
    assert.equal(pixelRes.status, 200);
    assert.equal(pixelRes.headers.get('content-type'), 'image/gif');
    assert.match(pixelRes.headers.get('cache-control'), /no-store/);
    const buf = Buffer.from(await pixelRes.arrayBuffer());
    assert.equal(buf.subarray(0, 6).toString('ascii'), 'GIF89a');

    const clickRes = await fetch(created.signedLinks['https://example.com/docs'], {
      redirect: 'manual',
    });
    assert.equal(clickRes.status, 302);
    assert.equal(clickRes.headers.get('location'), 'https://example.com/docs');

    const badClick = await fetch(
      `${baseUrl}/c/${created.track.id}?u=${encodeURIComponent('https://evil.example')}&sig=tampered`,
      { redirect: 'manual' }
    );
    assert.equal(badClick.status, 400);

    const getRes = await fetch(`${baseUrl}/api/tracks/${created.track.id}`, {
      headers: { 'X-Client-Token': TOKEN_A },
    });
    assert.equal(getRes.status, 200);
    const { track } = await getRes.json();
    assert.equal(track.openCount, 1);
    assert.equal(track.clickCount, 1);
    assert.equal(track.opens[0].ua, 'TestMailClient/1.0');
    assert.equal(track.clicks[0].url, 'https://example.com/docs');
  });
});

test('grace window ignores immediate self-open right after creation', async () => {
  await withServer({ openGraceMs: 60_000 }, async (baseUrl) => {
    const createRes = await fetch(`${baseUrl}/api/tracks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Token': TOKEN_A,
      },
      body: JSON.stringify({ subject: 'Grace test' }),
    });
    const { track, pixelUrl } = await createRes.json();

    await fetch(pixelUrl);

    const getRes = await fetch(`${baseUrl}/api/tracks/${track.id}`, {
      headers: { 'X-Client-Token': TOKEN_A },
    });
    const data = await getRes.json();
    assert.equal(data.track.openCount, 0);
  });
});

test('ignores direct pixel loads from Gmail compose referer', async () => {
  await withServer({ openGraceMs: 0 }, async (baseUrl) => {
    const createRes = await fetch(`${baseUrl}/api/tracks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Token': TOKEN_A,
      },
      body: JSON.stringify({ subject: 'Referer test' }),
    });
    const { track, pixelUrl } = await createRes.json();

    await fetch(pixelUrl, {
      headers: { Referer: 'https://mail.google.com/mail/u/0/' },
    });

    const getRes = await fetch(`${baseUrl}/api/tracks/${track.id}`, {
      headers: { 'X-Client-Token': TOKEN_A },
    });
    const data = await getRes.json();
    assert.equal(data.track.openCount, 0);
  });
});
