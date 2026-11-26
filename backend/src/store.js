'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_EVENTS_PER_TRACK = 50;

/**
 * Lightweight JSON-backed store for tracked emails, open events, and click events.
 * Uses atomic temp-file + rename writes so data survives restarts safely.
 */
class TrackStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, 'store.json');
    this.tracks = new Map();
    this._load();
  }

  _load() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    if (!fs.existsSync(this.filePath)) return;

    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tracks)) {
        for (const track of parsed.tracks) {
          if (track && track.id) {
            this.tracks.set(track.id, track);
          }
        }
      }
    } catch (err) {
      console.error('[mailpulse] Failed to load store.json, starting empty:', err.message);
    }
  }

  _save() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tmpPath = `${this.filePath}.${process.pid}.tmp`;
    const payload = JSON.stringify({ tracks: Array.from(this.tracks.values()) }, null, 2);
    fs.writeFileSync(tmpPath, payload, 'utf8');
    fs.renameSync(tmpPath, this.filePath);
  }

  createTrack({ ownerHash, subject = '', recipients = [] } = {}) {
    const id = crypto.randomBytes(9).toString('base64url');
    const now = Date.now();
    const track = {
      id,
      ownerHash: String(ownerHash || ''),
      subject: String(subject || '').slice(0, 300),
      recipients: Array.isArray(recipients)
        ? recipients.map((r) => String(r).slice(0, 200)).slice(0, 25)
        : [],
      createdAt: now,
      openCount: 0,
      firstOpenedAt: null,
      lastOpenedAt: null,
      clickCount: 0,
      opens: [],
      clicks: [],
    };
    this.tracks.set(id, track);
    this._save();
    return track;
  }

  getTrack(id, ownerHash = null) {
    const track = this.tracks.get(id) || null;
    if (!track) return null;
    if (ownerHash && track.ownerHash !== ownerHash) return null;
    return track;
  }

  listTracks({ ownerHash, ids = null, limit = 100 } = {}) {
    let items;
    if (Array.isArray(ids) && ids.length > 0) {
      items = ids
        .map((id) => this.tracks.get(id))
        .filter((t) => t && (!ownerHash || t.ownerHash === ownerHash));
    } else {
      items = Array.from(this.tracks.values()).filter(
        (t) => !ownerHash || t.ownerHash === ownerHash
      );
    }
    items.sort((a, b) => b.createdAt - a.createdAt);
    return items.slice(0, Math.max(1, Math.min(500, limit)));
  }

  deleteTrack(id, ownerHash = null) {
    const track = this.tracks.get(id);
    if (!track) return false;
    if (ownerHash && track.ownerHash !== ownerHash) return false;
    const deleted = this.tracks.delete(id);
    if (deleted) this._save();
    return deleted;
  }

  recordOpen(id, { userAgent = '', ip = '', graceMs = 0 } = {}) {
    const track = this.tracks.get(id);
    if (!track) return null;

    const now = Date.now();
    if (graceMs > 0 && now - track.createdAt < graceMs) {
      return { track, ignored: true };
    }

    track.openCount += 1;
    if (!track.firstOpenedAt) track.firstOpenedAt = now;
    track.lastOpenedAt = now;
    track.opens.unshift({
      at: now,
      ua: String(userAgent || '').slice(0, 200),
      ip: String(ip || '').slice(0, 64),
    });
    if (track.opens.length > MAX_EVENTS_PER_TRACK) {
      track.opens.length = MAX_EVENTS_PER_TRACK;
    }

    this._save();
    return { track, ignored: false };
  }

  recordClick(id, { url = '', userAgent = '', ip = '' } = {}) {
    const track = this.tracks.get(id);
    if (!track) return null;

    const now = Date.now();
    track.clickCount += 1;
    track.clicks.unshift({
      at: now,
      url: String(url || '').slice(0, 1000),
      ua: String(userAgent || '').slice(0, 200),
      ip: String(ip || '').slice(0, 64),
    });
    if (track.clicks.length > MAX_EVENTS_PER_TRACK) {
      track.clicks.length = MAX_EVENTS_PER_TRACK;
    }

    this._save();
    return track;
  }
}

module.exports = { TrackStore };
