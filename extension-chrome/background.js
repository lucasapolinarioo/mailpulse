'use strict';

const api = globalThis.browser || globalThis.chrome;

// URL pública do backend na ShardCloud.
const DEFAULT_BACKEND_URL = 'https://mailpulse.shardweb.app';

const DEFAULT_SETTINGS = {
  trackOpensByDefault: true,
  trackLinksByDefault: false,
  desktopNotifications: true,
};

function generateClientToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function getClientToken() {
  const stored = await api.storage.local.get(['clientToken']);
  if (stored.clientToken && stored.clientToken.length >= 16) {
    return stored.clientToken;
  }
  const token = generateClientToken();
  await api.storage.local.set({ clientToken: token });
  return token;
}

async function getSettings() {
  const stored = await api.storage.local.get(['settings']);
  return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

async function saveSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...partial };
  await api.storage.local.set({ settings: next });
  return next;
}

async function getKnownTracks() {
  const stored = await api.storage.local.get(['knownTracks']);
  return stored.knownTracks || {};
}

async function saveKnownTracks(knownTracks) {
  await api.storage.local.set({ knownTracks });
}

async function apiFetch(path, options = {}) {
  const clientToken = await getClientToken();
  const baseUrl = DEFAULT_BACKEND_URL.replace(/\/+$/, '');

  const headers = {
    'Content-Type': 'application/json',
    'X-Client-Token': clientToken,
    ...(options.headers || {}),
  };

  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

async function pollTracksForNotifications() {
  const settings = await getSettings();

  try {
    const { tracks = [] } = await apiFetch('/api/tracks?limit=100');
    const known = await getKnownTracks();
    let changed = false;

    for (const track of tracks) {
      const prev = known[track.id];
      const prevOpens = prev ? prev.openCount || 0 : 0;

      if (settings.desktopNotifications && prev && track.openCount > prevOpens) {
        const recipientLabel =
          track.recipients && track.recipients.length > 0
            ? track.recipients.join(', ')
            : 'Destinatário';
        const title = track.subject
          ? `MailPulse: "${track.subject}" foi aberto`
          : 'MailPulse: E-mail aberto';
        const message = `${recipientLabel} abriu seu e-mail (${track.openCount}x).`;

        api.notifications.create(`mailpulse-${track.id}-${track.openCount}`, {
          type: 'basic',
          iconUrl: api.runtime.getURL('icons/icon-128.png'),
          title,
          message,
        });
      }

      if (!prev || prev.openCount !== track.openCount || prev.clickCount !== track.clickCount) {
        known[track.id] = {
          id: track.id,
          subject: track.subject,
          recipients: track.recipients,
          createdAt: track.createdAt,
          openCount: track.openCount,
          firstOpenedAt: track.firstOpenedAt,
          lastOpenedAt: track.lastOpenedAt,
          clickCount: track.clickCount,
        };
        changed = true;
      }
    }

    if (changed) {
      await saveKnownTracks(known);
    }
    return tracks;
  } catch (err) {
    console.warn('[MailPulse] Poll failed:', err.message);
    return [];
  }
}

api.runtime.onInstalled.addListener(() => {
  getClientToken();
  api.alarms.create('mailpulse-poll', { periodInMinutes: 1 });
});

api.alarms.create('mailpulse-poll', { periodInMinutes: 1 });

api.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'mailpulse-poll') {
    pollTracksForNotifications();
  }
});

async function handleMessage(msg) {
  if (msg.type === 'GET_SETTINGS') {
    return getSettings();
  }

  if (msg.type === 'SAVE_SETTINGS') {
    return saveSettings(msg.settings || {});
  }

  if (msg.type === 'CREATE_TRACK') {
    const data = await apiFetch('/api/tracks', {
      method: 'POST',
      body: JSON.stringify({
        subject: msg.subject || '',
        recipients: msg.recipients || [],
        links: msg.links || [],
      }),
    });
    const known = await getKnownTracks();
    known[data.track.id] = {
      ...data.track,
    };
    await saveKnownTracks(known);
    return data;
  }

  if (msg.type === 'LIST_TRACKS') {
    const tracks = await pollTracksForNotifications();
    return { tracks };
  }

  if (msg.type === 'DELETE_TRACK') {
    await apiFetch(`/api/tracks/${encodeURIComponent(msg.id)}`, { method: 'DELETE' });
    const known = await getKnownTracks();
    delete known[msg.id];
    await saveKnownTracks(known);
    return { ok: true };
  }

  return null;
}

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return false;
  handleMessage(msg)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: err.message }));
  return true;
});
