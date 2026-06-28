// store.js — In-memory AppState and the ONLY module permitted to mutate it.
//
// Responsibilities:
//   * Hold the single source of truth (AppState) loaded from persistence.
//   * Expose read-only getters for the views.
//   * Expose action functions (the only mutators): createRound, addItem,
//     setRoster, selectParticipant, submitAllocation, settleRound.
//   * After EVERY mutation: persist the new state and notify subscribers
//     (the router) so the active screen re-renders.
//
// All *displayed metrics* (chip shares, P&L, leaderboard) are recomputed from
// domain.js on demand — this module never caches derived numbers.

import { load, save } from './persistence.js';
import { normalizeTo100 } from './domain.js';

// ---------------------------------------------------------------------------
// Source of truth
// ---------------------------------------------------------------------------
// persistence.load() returns a WRAPPER { state, seeded, migratedFrom, backupKey }.
// We keep only the AppState here. (Reading the wrapper as if it were the state
// was the first-paint-empty bug — getRounds() read wrapper.rounds === undefined.)
const _loaded = load();
let state = _loaded.state;

// Surface load-time metadata so views can show "seeded sample" / migration hints
// without re-reading storage. Read-only snapshot, never mutated.
export const loadInfo = {
  seeded: !!_loaded.seeded,
  migratedFrom: _loaded.migratedFrom || null,
  backupKey: _loaded.backupKey || null,
};

// ---------------------------------------------------------------------------
// Subscriptions (router re-render)
// ---------------------------------------------------------------------------
const listeners = new Set();

/**
 * Register a callback invoked after every mutation. Returns an unsubscribe fn.
 * The router subscribes its render function here.
 */
export function subscribe(fn) {
  if (typeof fn === 'function') listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch (err) {
      // A broken view listener must not corrupt the store or block persistence.
      console.error('store listener error', err);
    }
  }
}

// Called at the end of every action: persist first (durability), then re-render.
function commit() {
  try {
    save(state);
  } catch (err) {
    console.error('store: persistence.save failed', err);
  }
  notify();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
let _idSeq = 0;
function makeId(prefix) {
  _idSeq += 1;
  // Date.now keeps ids monotonic across reloads; the counter disambiguates a burst.
  return `${prefix}_${Date.now().toString(36)}_${_idSeq.toString(36)}`;
}

function cleanName(raw) {
  return typeof raw === 'string' ? raw.trim() : '';
}

// Dedupe a list of names case-insensitively, dropping empty/whitespace entries,
// while preserving the first-seen original casing and input order.
function normalizeNames(names) {
  const seen = new Set();
  const out = [];
  for (const n of names || []) {
    const name = cleanName(n);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function findRound(roundId) {
  return (state.rounds || []).find((r) => r.id === roundId) || null;
}

// ---------------------------------------------------------------------------
// Getters (read-only views of the source of truth)
// ---------------------------------------------------------------------------
export function getState() {
  return state;
}

export function getRounds() {
  return state.rounds || [];
}

export function getRoundById(roundId) {
  return findRound(roundId);
}

export function getCurrentRound() {
  if (!state.currentRoundId) {
    const rounds = getRounds();
    return rounds.length ? rounds[rounds.length - 1] : null;
  }
  return findRound(state.currentRoundId);
}

export function getSelectedParticipant() {
  return state.selectedParticipant || null;
}

/** Who in a round's roster has already submitted a (non-empty) allocation. */
export function getSubmissionStatus(roundId) {
  const round = findRound(roundId);
  if (!round) return [];
  const submitted = round.submitted || {};
  return (round.roster || []).map((name) => ({
    name,
    submitted: !!submitted[name],
  }));
}

// ---------------------------------------------------------------------------
// Actions (the ONLY mutators). Each ends with commit().
// ---------------------------------------------------------------------------

/**
 * Create a new prioritization round and make it current.
 * @returns the created round.
 */
export function createRound(title, metricLabel, opts = {}) {
  const round = {
    id: makeId('round'),
    title: cleanName(title) || 'Untitled Round',
    metricLabel: cleanName(metricLabel) || 'units',
    isSample: false,
    createdAt: Date.now(),
    items: [],
    roster: normalizeNames(opts.roster),
    allocations: {}, // { [participant]: { [itemId]: chips } } — normalized to 100
    submitted: {}, // { [participant]: true }
    actuals: {}, // { [itemId]: number }
    settled: false,
  };
  // Seed any provided initial items.
  if (Array.isArray(opts.items)) {
    for (const name of opts.items) {
      const itemName = cleanName(name);
      if (itemName) round.items.push({ id: makeId('item'), name: itemName });
    }
  }
  state.rounds = getRounds().concat(round);
  state.currentRoundId = round.id;
  state.selectedParticipant = null;
  commit();
  return round;
}

/**
 * Add a content item to a round. Ignored for settled rounds.
 * @returns the created item, or null if not added.
 */
export function addItem(roundId, name) {
  const round = findRound(roundId);
  if (!round || round.settled) return null;
  const itemName = cleanName(name);
  if (!itemName) return null;
  const item = { id: makeId('item'), name: itemName };
  round.items = (round.items || []).concat(item);
  commit();
  return item;
}

/**
 * Replace a round's participant roster. Blocks empty/whitespace names and
 * deduplicates (case-insensitive). Prunes allocations/submission status for
 * participants no longer on the roster.
 * @returns the cleaned roster array.
 */
export function setRoster(roundId, names) {
  const round = findRound(roundId);
  if (!round) return [];
  const roster = normalizeNames(names);
  round.roster = roster;

  const keep = new Set(roster.map((n) => n.toLowerCase()));
  const allocations = round.allocations || {};
  const submitted = round.submitted || {};
  for (const p of Object.keys(allocations)) {
    if (!keep.has(p.toLowerCase())) delete allocations[p];
  }
  for (const p of Object.keys(submitted)) {
    if (!keep.has(p.toLowerCase())) delete submitted[p];
  }
  round.allocations = allocations;
  round.submitted = submitted;

  // Drop a stale selection that's no longer on the roster.
  if (
    state.selectedParticipant &&
    !keep.has(state.selectedParticipant.toLowerCase())
  ) {
    state.selectedParticipant = null;
  }
  commit();
  return roster;
}

/** Operator picks which roster participant is currently allocating. */
export function selectParticipant(name) {
  const clean = cleanName(name);
  state.selectedParticipant = clean || null;
  commit();
  return state.selectedParticipant;
}

/**
 * Submit one participant's chip allocation for a round.
 *  - blocks empty/whitespace participant names and names off the roster
 *  - accepts arbitrary non-negative integers; normalizes them to sum to 100
 *    via domain.normalizeTo100 (largest-remainder)
 *  - records per-round submission status for the roster
 * @param rawAllocations object { [itemId]: number }
 * @returns the normalized allocation map, or null if rejected.
 */
export function submitAllocation(roundId, participant, rawAllocations) {
  const round = findRound(roundId);
  if (!round || round.settled) return null;

  const name = cleanName(participant);
  if (!name) return null; // blocks empty / whitespace-only names

  // Must be a known roster participant (case-insensitive); keep the roster casing.
  const rosterMatch = (round.roster || []).find(
    (n) => n.toLowerCase() === name.toLowerCase()
  );
  if (!rosterMatch) return null;

  // Coerce raw inputs to non-negative integers keyed by current item ids only.
  const raw = {};
  for (const item of round.items || []) {
    const v = rawAllocations ? Number(rawAllocations[item.id]) : 0;
    raw[item.id] = Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  }

  const normalized = normalizeTo100(raw);

  round.allocations = round.allocations || {};
  round.submitted = round.submitted || {};
  round.allocations[rosterMatch] = normalized;
  round.submitted[rosterMatch] = true;

  commit();
  return normalized;
}

/**
 * Enter the settlement actuals for a round and mark it settled. Missing or
 * non-numeric actuals are coerced to 0 (domain.js handles zero-sum safely).
 * @param actuals object { [itemId]: number }
 * @returns the settled round, or null if not found.
 */
export function settleRound(roundId, actuals) {
  const round = findRound(roundId);
  if (!round) return null;

  const clean = {};
  for (const item of round.items || []) {
    const v = actuals ? Number(actuals[item.id]) : 0;
    clean[item.id] = Number.isFinite(v) && v > 0 ? v : 0;
  }
  round.actuals = clean;
  round.settled = true;
  round.settledAt = Date.now();

  commit();
  return round;
}

/**
 * Dismiss / delete a round (used by the dismissable sample banner). Clears the
 * current selection if it pointed at the removed round.
 */
export function dismissRound(roundId) {
  const before = getRounds();
  state.rounds = before.filter((r) => r.id !== roundId);
  if (state.currentRoundId === roundId) {
    const rounds = state.rounds;
    state.currentRoundId = rounds.length ? rounds[rounds.length - 1].id : null;
    state.selectedParticipant = null;
  }
  commit();
}

/** Make an existing round the active one (nav between rounds). */
export function setCurrentRound(roundId) {
  if (findRound(roundId)) {
    state.currentRoundId = roundId;
    state.selectedParticipant = null;
    commit();
  }
}
