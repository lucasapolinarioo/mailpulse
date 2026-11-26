'use strict';

const api = globalThis.browser || globalThis.chrome;

const tabs = document.querySelectorAll('.groove-tab');
const panels = document.querySelectorAll('.panel');
const summaryBar = document.getElementById('summaryBar');
const totalCountEl = document.getElementById('totalCount');
const openedCountEl = document.getElementById('openedCount');
const tracksList = document.getElementById('tracksList');
const emptyState = document.getElementById('emptyState');
const refreshBtn = document.getElementById('refreshBtn');

const settingsForm = document.getElementById('settingsForm');
const trackOpensInput = document.getElementById('trackOpensByDefault');
const trackLinksInput = document.getElementById('trackLinksByDefault');
const notificationsInput = document.getElementById('desktopNotifications');
const settingsFeedback = document.getElementById('settingsFeedback');

function switchTab(name) {
  for (const t of tabs) t.classList.toggle('active', t.dataset.tab === name);
  for (const p of panels) p.classList.toggle('active', p.id === `tab-${name}`);
}

for (const tab of tabs) {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
}

function formatDateShort(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString([], {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function collectFormSettings() {
  return {
    trackOpensByDefault: trackOpensInput.checked,
    trackLinksByDefault: trackLinksInput.checked,
    desktopNotifications: notificationsInput.checked,
  };
}

async function loadSettings() {
  const settings = await api.runtime.sendMessage({ type: 'GET_SETTINGS' });
  trackOpensInput.checked = settings.trackOpensByDefault !== false;
  trackLinksInput.checked = Boolean(settings.trackLinksByDefault);
  notificationsInput.checked = settings.desktopNotifications !== false;
}

function createDeleteIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M6 6l12 12M18 6L6 18');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  svg.appendChild(path);
  return svg;
}

async function loadTracks() {
  tracksList.innerHTML = '';
  const { tracks = [] } = await api.runtime.sendMessage({ type: 'LIST_TRACKS' });

  if (tracks.length === 0) {
    summaryBar.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  summaryBar.classList.remove('hidden');
  totalCountEl.textContent = String(tracks.length);
  openedCountEl.textContent = String(tracks.filter((t) => (t.openCount || 0) > 0).length);

  for (const track of tracks) {
    const li = document.createElement('li');
    li.className = 'record-card';

    const body = document.createElement('div');
    body.className = 'record-body';

    const subj = document.createElement('div');
    subj.className = 'record-subject';
    subj.textContent = track.subject || '(Sem assunto)';

    const rcpt = document.createElement('div');
    rcpt.className = 'record-recipient';
    rcpt.textContent =
      track.recipients && track.recipients.length > 0
        ? track.recipients.join(', ')
        : 'Destinatário não informado';

    const footer = document.createElement('div');
    footer.className = 'record-footer';

    const opened = (track.openCount || 0) > 0;
    const state = document.createElement('span');
    state.className = `record-state ${opened ? 'record-state--paid' : 'record-state--sent'} fig`;
    if (opened) {
      state.textContent = track.clickCount
        ? `Aberto ${track.openCount}x (${track.clickCount} clique${track.clickCount > 1 ? 's' : ''})`
        : `Aberto ${track.openCount}x`;
    } else {
      state.textContent = 'Enviado';
    }

    const time = document.createElement('span');
    time.className = 'record-time fig';
    time.textContent = formatDateShort(opened ? track.lastOpenedAt : track.createdAt);

    footer.appendChild(state);
    footer.appendChild(time);

    body.appendChild(subj);
    body.appendChild(rcpt);
    body.appendChild(footer);

    const del = document.createElement('button');
    del.className = 'record-del';
    del.type = 'button';
    del.title = 'Remover registro';
    del.setAttribute('aria-label', 'Remover registro');
    del.appendChild(createDeleteIcon());
    del.addEventListener('click', async () => {
      await api.runtime.sendMessage({ type: 'DELETE_TRACK', id: track.id });
      loadTracks();
    });

    li.appendChild(body);
    li.appendChild(del);
    tracksList.appendChild(li);
  }
}

settingsForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  settingsFeedback.textContent = 'Salvando...';
  await api.runtime.sendMessage({
    type: 'SAVE_SETTINGS',
    settings: collectFormSettings(),
  });
  settingsFeedback.textContent = 'Preferências salvas.';
});

refreshBtn.addEventListener('click', () => {
  loadTracks();
});

loadSettings().then(loadTracks);
