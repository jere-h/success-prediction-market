// persistence.js
//
// The localStorage "port" for Chip Market.
//
// This module is the ONLY place that talks to the browser's persistence layer.
// It exposes a tiny, backend-agnostic surface (load / save / exportState /
// downloadBackup / clearAll) so a real server-backed store could replace it
// later WITHOUT touching domain.js, store.js, or the views. Everything above
// this file thinks in terms of a plain AppState object.
//
// Responsibilities:
//   * load()  — return the persisted AppState, seeding the bundled sample data
//               ONLY when storage is genuinely empty (first ever visit). It must
//               never re-seed on a normal load, or a user who dismissed the
//               sample would see it reappear.
//   * save()  — persist the full AppState JSON under a single stable key.
//   * On a schemaVersion mismatch we DO NOT silently wipe accumulated history.
//               The prior blob is copied to a timestamped backup key and also
//               offered for download/export, so leaderboard history survives a
//               schema bump even if the new code can't read the old shape.
//
// Storage layout (localStorage):
//   chip-market:v1            -> the live AppState JSON (current schema)
//   chip-market:v1:backup:<t> -> preserved prior blob(s) from schema migrations
//
// Note: the key embeds the app namespace, not the schema version, on purpose —
// SCHEMA_VERSION lives *inside* the JSON so we can detect a mismatch and react,
// rather than orphaning data under a version-suffixed key the new build never
// looks at.

import { sampleState } from './sample-data.js';

export const STORAGE_KEY = 'chip-market:v1';
export const BACKUP_KEY_PREFIX = 'chip-market:v1:backup:';

// Bump this whenever the AppState shape changes incompatibly. The seeded sample
// data carries the same number so a fresh seed is always "current".
export const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Low-level storage access (guarded so the app still runs if localStorage is
// unavailable — e.g. privacy mode / sandboxed iframe). When unavailable we fall
// back to an in-memory shim that lives for the page session only.
// ---------------------------------------------------------------------------

const memoryShim = (() => {
  let backing = Object.create(null);
  return {
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(backing, k) ? backing[k] : null;
    },
    setItem(k, v) {
      backing[k] = String(v);
    },
    removeItem(k) {
      delete backing[k];
    },
    key(i) {
      return Object.keys(backing)[i] ?? null;
    },
    get length() {
      return Object.keys(backing).length;
    },
  };
})();

let _storageWarned = false;

function getStorage() {
  try {
    const s = window.localStorage;
    // Probe — Safari private mode throws on setItem rather than on access.
    const probe = '__chip_market_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch (err) {
    if (!_storageWarned) {
      _storageWarned = true;
      console.warn(
        '[chip-market] localStorage unavailable — using in-memory storage for this session only. Data will not persist.',
        err,
      );
    }
    return memoryShim;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowStamp() {
  // ISO-ish, filesystem/key-safe (no colons).
  try {
    return new Date().toISOString().replace(/[:.]/g, '-');
  } catch (_) {
    return String(Date.now());
  }
}

function deepClone(obj) {
  // structuredClone is widely available; fall back to JSON round-trip.
  try {
    if (typeof structuredClone === 'function') return structuredClone(obj);
  } catch (_) {
    /* fall through */
  }
  return JSON.parse(JSON.stringify(obj));
}

function freshSampleState() {
  // Always hand callers their own copy so nothing accidentally mutates the
  // shared sample module export. Stamp the current schema version on it.
  const seeded = deepClone(sampleState);
  seeded.schemaVersion = SCHEMA_VERSION;
  return seeded;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load the persisted AppState.
 *
 * Seeding rules:
 *   - No stored blob at all (truly empty)  -> seed bundled sample, persist it.
 *   - Stored blob present, schema matches   -> return it as-is.
 *   - Stored blob present, schema mismatch  -> preserve old blob under a backup
 *                                              key, then seed a fresh current
 *                                              state (sample) so the app still
 *                                              boots. The backup is recoverable
 *                                              via exportBackups()/downloadBackup().
 *   - Stored blob present but corrupt JSON   -> preserve raw text as a backup,
 *                                              then seed fresh.
 *
 * @returns {{state: object, seeded: boolean, migratedFrom: number|null,
 *            backupKey: string|null}}
 */
export function load() {
  const storage = getStorage();
  const raw = storage.getItem(STORAGE_KEY);

  // --- Truly empty: first run. Seed exactly once. ---
  if (raw === null || raw === undefined || raw === '') {
    const state = freshSampleState();
    save(state);
    return { state, seeded: true, migratedFrom: null, backupKey: null };
  }

  // --- Parse what's there. ---
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn('[chip-market] stored state is corrupt JSON — preserving it as a backup and re-seeding.', err);
    const backupKey = backupRawBlob(storage, raw);
    const state = freshSampleState();
    save(state);
    return { state, seeded: true, migratedFrom: null, backupKey };
  }

  if (parsed === null || typeof parsed !== 'object') {
    console.warn('[chip-market] stored state is not an object — preserving it as a backup and re-seeding.');
    const backupKey = backupRawBlob(storage, raw);
    const state = freshSampleState();
    save(state);
    return { state, seeded: true, migratedFrom: null, backupKey };
  }

  const storedVersion =
    typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 0;

  // --- Schema matches: normal path, return untouched. ---
  if (storedVersion === SCHEMA_VERSION) {
    return { state: parsed, seeded: false, migratedFrom: null, backupKey: null };
  }

  // --- Schema mismatch: DO NOT WIPE. Preserve, then seed fresh. ---
  console.warn(
    `[chip-market] schema mismatch (stored v${storedVersion}, app v${SCHEMA_VERSION}). ` +
      'Preserving prior data under a backup key — use downloadBackup() to recover your leaderboard history.',
  );
  const backupKey = backupRawBlob(storage, raw);
  const state = freshSampleState();
  save(state);
  return { state, seeded: true, migratedFrom: storedVersion, backupKey };
}

/**
 * Persist the full AppState. Always stamps the current SCHEMA_VERSION so future
 * loads can detect mismatches.
 *
 * @param {object} state - the AppState to persist.
 * @returns {boolean} true on success.
 */
export function save(state) {
  if (state === null || typeof state !== 'object') {
    console.warn('[chip-market] save() ignored a non-object state.');
    return false;
  }
  const storage = getStorage();
  const toWrite = { ...state, schemaVersion: SCHEMA_VERSION };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(toWrite));
    return true;
  } catch (err) {
    // Quota exceeded or serialization failure — surface but never throw into
    // the mutation path (store.js calls this after every action).
    console.error('[chip-market] failed to persist state.', err);
    return false;
  }
}

/**
 * Copy a raw stored blob to a timestamped backup key so it survives a schema
 * bump / corruption. Returns the backup key (or null if the copy failed).
 */
function backupRawBlob(storage, raw) {
  const key = `${BACKUP_KEY_PREFIX}${nowStamp()}`;
  try {
    storage.setItem(key, raw);
    return key;
  } catch (err) {
    console.error('[chip-market] could not write backup blob (storage may be full).', err);
    return null;
  }
}

/**
 * List the keys of all preserved migration/corruption backups, newest first.
 * @returns {string[]}
 */
export function listBackupKeys() {
  const storage = getStorage();
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (typeof k === 'string' && k.startsWith(BACKUP_KEY_PREFIX)) keys.push(k);
  }
  // Timestamps are lexicographically sortable; reverse for newest-first.
  keys.sort();
  keys.reverse();
  return keys;
}

/**
 * Return all backup blobs as an array of { key, raw }, newest first. Useful for
 * a recovery UI or for exporting before clearing.
 */
export function exportBackups() {
  const storage = getStorage();
  return listBackupKeys().map((key) => ({ key, raw: storage.getItem(key) }));
}

/**
 * Serialize the current live state plus any preserved backups into a single
 * JSON string suitable for download or handoff to a future backend.
 * @returns {string}
 */
export function exportState() {
  const storage = getStorage();
  const live = storage.getItem(STORAGE_KEY);
  let liveParsed = null;
  try {
    liveParsed = live ? JSON.parse(live) : null;
  } catch (_) {
    liveParsed = null;
  }
  const payload = {
    app: 'chip-market',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowStamp(),
    state: liveParsed,
    rawState: liveParsed ? undefined : live, // keep raw if unparseable
    backups: exportBackups(),
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Trigger a browser download of the full export (live state + backups). This is
 * the user-facing escape hatch promised on a schema bump: accumulated
 * leaderboard history can always be saved to disk.
 *
 * @param {string} [filename]
 */
export function downloadBackup(filename) {
  const json = exportState();
  const name = filename || `chip-market-backup-${nowStamp()}.json`;
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke on the next tick so the click has a chance to start.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch (err) {
    console.error('[chip-market] download failed.', err);
    return false;
  }
}

/**
 * Remove the live state (and optionally all backups), then re-seed the sample.
 * Used by the "reset to sample" affordance. Backups are KEPT by default so a
 * reset never destroys history silently.
 *
 * @param {{ wipeBackups?: boolean }} [opts]
 * @returns {object} the freshly seeded sample AppState.
 */
export function clearAll(opts = {}) {
  const storage = getStorage();
  try {
    storage.removeItem(STORAGE_KEY);
  } catch (_) {
    /* ignore */
  }
  if (opts.wipeBackups) {
    for (const key of listBackupKeys()) {
      try {
        storage.removeItem(key);
      } catch (_) {
        /* ignore */
      }
    }
  }
  const state = freshSampleState();
  save(state);
  return state;
}
