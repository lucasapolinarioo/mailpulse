'use strict';

(() => {
  const api = globalThis.browser || globalThis.chrome;

  let settings = {
    trackOpensByDefault: true,
    trackLinksByDefault: false,
  };
  let tracksCache = [];
  let lastFetchAt = 0;

  const SEND_SELECTOR = [
    'div[role="button"][data-tooltip*="Send"]',
    'div[role="button"][aria-label*="Send"]',
    'div[role="button"][data-tooltip*="Enviar"]',
    'div[role="button"][aria-label*="Enviar"]',
  ].join(', ');

  async function refreshSettings() {
    try {
      const res = await api.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (res) settings = { ...settings, ...res };
    } catch {
      // Ignore if extension context invalidated
    }
  }

  async function refreshTracks(force = false) {
    const now = Date.now();
    if (!force && now - lastFetchAt < 15000) return tracksCache;
    lastFetchAt = now;
    try {
      const res = await api.runtime.sendMessage({ type: 'LIST_TRACKS' });
      if (res && Array.isArray(res.tracks)) {
        tracksCache = res.tracks;
      }
    } catch {
      // Ignore transient errors
    }
    return tracksCache;
  }

  function findComposeRoot(el) {
    return (
      el.closest('div[role="dialog"]') ||
      el.closest('div.M9') ||
      el.closest('table.aoP') ||
      el.closest('div.nH')
    );
  }

  function extractComposeMeta(root) {
    const subjectInput = root.querySelector('input[name="subjectbox"]');
    const subject = subjectInput ? subjectInput.value.trim() : '';

    const recipientNodes = root.querySelectorAll('span[email], div[data-hovercard-id]');
    const recipients = new Set();
    for (const node of recipientNodes) {
      const email = node.getAttribute('email') || node.getAttribute('data-hovercard-id');
      if (email && email.includes('@')) recipients.add(email);
    }

    const bodyEl = root.querySelector('div[role="textbox"][contenteditable="true"]');
    const links = [];
    if (bodyEl) {
      for (const a of bodyEl.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href') || '';
        if (/^https?:\/\//i.test(href)) {
          links.push(href);
        }
      }
    }

    return { subject, recipients: Array.from(recipients), bodyEl, links };
  }

  function injectPixelIntoBody(bodyEl, pixelUrl, signedLinks, trackLinks) {
    // Remove any previous MailPulse pixel if user re-edited
    for (const old of bodyEl.querySelectorAll('img[data-mailpulse="1"]')) {
      old.remove();
    }

    if (trackLinks && signedLinks) {
      for (const a of bodyEl.querySelectorAll('a[href]')) {
        const original = a.getAttribute('href');
        if (original && signedLinks[original]) {
          a.setAttribute('href', signedLinks[original]);
        }
      }
    }

    const img = document.createElement('img');
    img.src = pixelUrl;
    img.alt = '';
    img.width = 1;
    img.height = 1;
    img.setAttribute('data-mailpulse', '1');
    img.style.cssText = 'width:1px;height:1px;border:0;opacity:0;pointer-events:none;display:inline-block;';
    bodyEl.appendChild(img);
  }

  function attachComposeControls() {
    const sendButtons = document.querySelectorAll(SEND_SELECTOR);
    for (const sendBtn of sendButtons) {
      if (sendBtn.dataset.mailpulseBound === '1') continue;
      const root = findComposeRoot(sendBtn);
      if (!root) continue;

      sendBtn.dataset.mailpulseBound = '1';

      // Create toggle pill next to Send toolbar
      const toolbar = sendBtn.closest('tr') || sendBtn.parentElement;
      if (toolbar && !root.querySelector('.mailpulse-compose-pill')) {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'mailpulse-compose-pill';
        const enabled = settings.trackOpensByDefault !== false;
        pill.dataset.enabled = enabled ? '1' : '0';
        pill.title = 'Alternar rastreamento de leitura (MailPulse)';

        const setPillContent = (isOn) => {
          pill.textContent = '';
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('class', 'mailpulse-compose-dot');
          svg.setAttribute('viewBox', '0 0 24 24');
          svg.setAttribute('fill', 'none');
          svg.setAttribute('aria-hidden', 'true');
          const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          p.setAttribute('d', 'M3 13h4.5l2.5-6 3.5 11 2.5-5H21');
          p.setAttribute('stroke', 'currentColor');
          p.setAttribute('stroke-width', '2.2');
          p.setAttribute('stroke-linecap', 'round');
          p.setAttribute('stroke-linejoin', 'round');
          svg.appendChild(p);
          pill.appendChild(svg);
          pill.appendChild(document.createTextNode(isOn ? 'MailPulse ativo' : 'MailPulse pausado'));
        };

        setPillContent(enabled);

        pill.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const next = pill.dataset.enabled !== '1';
          pill.dataset.enabled = next ? '1' : '0';
          setPillContent(next);
        });

        sendBtn.parentElement.insertAdjacentElement('afterend', pill);
      }

      // Intercept Send click in capture phase
      sendBtn.addEventListener(
        'click',
        async (ev) => {
          if (sendBtn.dataset.mailpulseBypass === '1') {
            sendBtn.dataset.mailpulseBypass = '0';
            return;
          }

          const pill = root.querySelector('.mailpulse-compose-pill');
          const enabled = pill ? pill.dataset.enabled === '1' : settings.trackOpensByDefault;
          if (!enabled) return;

          const { subject, recipients, bodyEl, links } = extractComposeMeta(root);
          if (!bodyEl) return;

          ev.preventDefault();
          ev.stopImmediatePropagation();

          try {
            const trackLinks = Boolean(settings.trackLinksByDefault);
            const data = await api.runtime.sendMessage({
              type: 'CREATE_TRACK',
              subject,
              recipients,
              links: trackLinks ? links : [],
            });
            if (data && data.pixelUrl) {
              injectPixelIntoBody(bodyEl, data.pixelUrl, data.signedLinks, trackLinks);
            }
          } catch (err) {
            console.warn('[MailPulse] Could not attach tracking pixel:', err.message);
          }

          sendBtn.dataset.mailpulseBypass = '1';
          sendBtn.click();
          setTimeout(() => refreshTracks(true), 1500);
        },
        true
      );
    }
  }

  function formatTimestamp(ts) {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return '';
    }
  }

  function createCheckBadge(track) {
    const span = document.createElement('span');
    const opened = (track.openCount || 0) > 0;
    span.className = `mailpulse-badge ${opened ? 'mailpulse-opened' : 'mailpulse-sent'}`;
    span.textContent = opened ? `Aberto ${track.openCount}x` : 'Enviado';
    span.title = opened
      ? `MailPulse: Aberto ${track.openCount}x (última leitura: ${formatTimestamp(track.lastOpenedAt)})`
      : 'MailPulse: Enviado, aguardando leitura';
    return span;
  }

  function renderInboxBadges() {
    if (!tracksCache || tracksCache.length === 0) return;

    // Build subject -> most recent matching track map
    const bySubject = new Map();
    for (const t of tracksCache) {
      if (t.subject && !bySubject.has(t.subject)) {
        bySubject.set(t.subject, t);
      }
    }

    const rows = document.querySelectorAll('tr.zA');
    for (const row of rows) {
      if (row.querySelector('.mailpulse-badge')) continue;
      const subjectEl = row.querySelector('span.bog');
      if (!subjectEl) continue;
      const subjectText = subjectEl.textContent.trim();
      const track = bySubject.get(subjectText);
      if (!track) continue;

      const badge = createCheckBadge(track);
      subjectEl.insertAdjacentElement('beforebegin', badge);
    }
  }

  let scanTimer = null;
  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(async () => {
      scanTimer = null;
      attachComposeControls();
      await refreshTracks(false);
      renderInboxBadges();
    }, 450);
  }

  refreshSettings().then(() => {
    attachComposeControls();
    refreshTracks(true).then(renderInboxBadges);
  });

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });

  api.storage.onChanged.addListener((changes) => {
    if (changes.settings && changes.settings.newValue) {
      settings = { ...settings, ...changes.settings.newValue };
    }
    if (changes.knownTracks) {
      refreshTracks(true).then(renderInboxBadges);
    }
  });
})();
