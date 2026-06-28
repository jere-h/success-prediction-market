// domain.js
//
// Pure, side-effect-free domain core for Chip Market — the riskiest logic,
// isolated here so it can be unit-tested in plain Node with zero DOM/storage.
//
// NOTHING in this module reads or writes localStorage, the DOM, or globals.
// Every function takes plain data in and returns plain data out. store.js owns
// all mutation; app.js owns all rendering; this file owns all *math*.
//
// ---------------------------------------------------------------------------
// Data shapes (documented contract — siblings build values of these shapes)
// ---------------------------------------------------------------------------
//   Item        = { id: string, label: string, ... }      // a content item
//   Allocation  = { [itemId: string]: number }            // one participant's chips per item
//   Round       = {
//                   id: string,
//                   name: string,
//                   metricLabel: string,                  // e.g. "D7 units"
//                   items: Item[],
//                   roster: string[],                     // participant names
//                   allocations: { [name: string]: Allocation },
//                   actuals: { [itemId: string]: number },// settlement values
//                   settled: boolean
//                 }
//
// ---------------------------------------------------------------------------
// Two properties this module guarantees (and that tests pin):
//
//  1. EQUAL-SPLIT ⇒ 0 P&L. A participant who spreads chips equally across all
//     N items has, for every item, chipFraction_i == 1/N, so every term
//     (chipFraction_i − 1/N)·normActual_i == 0 and total P&L is exactly 0.
//     The equal split is the baseline; you only score by deviating from it.
//
//  2. INTRA-ROUND NORMALIZATION MAKES SCALES COMPARABLE. Each item's actual is
//     divided by the round's actual-sum (normActual_i = actual_i / Σactual),
//     so P&L depends only on the *within-round share* of demand, never on the
//     raw magnitude or unit of the settlement metric. A round measured in
//     "D7 units" (tens of thousands) and a round measured in "wishlist adds"
//     (hundreds) both produce P&L on the same dimensionless scale, so summing
//     them on a cumulative leaderboard is meaningful.
// ---------------------------------------------------------------------------

/**
 * Coerce a value to a finite, non-negative number; anything invalid → 0.
 * @param {*} v
 * @returns {number}
 */
function num(v) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Resolve an item's id from either a string id or an Item object.
 * @param {(string|Item)} item
 * @returns {string}
 */
function itemId(item) {
  if (item == null) return '';
  if (typeof item === 'string') return item;
  if (typeof item === 'object') return String(item.id != null ? item.id : (item.itemId != null ? item.itemId : ''));
  return String(item);
}

/**
 * Largest-remainder (Hamilton) apportionment of `values` into integers that
 * sum *exactly* to `target` (default 100). Proportional shares are floored,
 * then the leftover units are handed out to the largest fractional remainders.
 * Ties break by ascending index so the result is fully deterministic.
 *
 * If all values are zero (nothing to apportion) every output is 0 — the caller
 * decides whether "all zeros" is meaningful.
 *
 * @param {number[]} values  non-negative weights
 * @param {number} [target=100]
 * @returns {number[]} integers, same length as `values`, summing to target (or 0)
 */
function largestRemainder(values, target = 100) {
  const list = (values || []).map(num);
  const n = list.length;
  if (n === 0) return [];
  const sum = list.reduce((s, v) => s + v, 0);
  if (sum <= 0) return list.map(() => 0);

  const exact = list.map((v) => (v / sum) * target);
  const floors = exact.map(Math.floor);
  const placed = floors.reduce((s, v) => s + v, 0);
  let remainder = Math.round(target - placed);

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => (b.frac - a.frac) || (a.i - b.i));

  const out = floors.slice();
  for (let k = 0; k < remainder && k < order.length; k++) {
    out[order[k].i] += 1;
  }
  return out;
}

/**
 * Sum of chips in a single participant's allocation (negative/invalid → 0).
 * @param {Allocation} allocation
 * @returns {number}
 */
function allocationTotal(allocation) {
  if (!allocation || typeof allocation !== 'object') return 0;
  return Object.keys(allocation).reduce((s, k) => s + num(allocation[k]), 0);
}

/**
 * Normalize a raw allocation so its values are integer percentages summing to
 * exactly 100 (largest-remainder rounding). Keys are preserved. An all-zero /
 * empty allocation normalizes to all zeros (cannot manufacture a 100 from
 * nothing); the caller treats that as "no bet placed".
 *
 * @param {Allocation} allocation
 * @returns {Allocation} same keys, integer values summing to 100 (or 0)
 */
function normalizeTo100(allocation) {
  const src = (allocation && typeof allocation === 'object') ? allocation : {};
  const keys = Object.keys(src);
  const pct = largestRemainder(keys.map((k) => num(src[k])), 100);
  const out = {};
  keys.forEach((k, i) => { out[k] = pct[i]; });
  return out;
}

/**
 * Flatten whatever "allocations" shape is handed in into a flat list of
 * Allocation objects for a given round. Tolerates:
 *   - an Array of Allocation
 *   - a map { name: Allocation }
 *   - a per-round map { roundId: { name: Allocation } } (selected by roundId)
 * @param {*} allocations
 * @param {string} [roundId]
 * @returns {Allocation[]}
 */
function allocationList(allocations, roundId) {
  if (!allocations) return [];
  let scope = allocations;
  if (!Array.isArray(allocations) && roundId != null &&
      Object.prototype.hasOwnProperty.call(allocations, roundId)) {
    scope = allocations[roundId];
  }
  let arr;
  if (Array.isArray(scope)) arr = scope;
  else if (scope && typeof scope === 'object') arr = Object.values(scope);
  else return [];
  return arr.filter((a) => a && typeof a === 'object');
}

/**
 * Aggregate the whole round's chip allocations into a normalized popularity
 * signal: the % of all chips each item attracted, across every participant,
 * summing to exactly 100 via largest-remainder rounding. This is the
 * "aggregate normalized chip-share" the Signal screen renders as bars.
 *
 * @param {Item[]} items
 * @param {*} allocations  array, name→Allocation map, or roundId→(name→Allocation) map
 * @param {string} [roundId]
 * @returns {{itemId:string,label:string,chips:number,share:number}[]}
 *          one row per item (item order preserved); `chips` is the raw total,
 *          `share` is the rounded percent. If no chips were placed at all,
 *          every `share` is 0 (the signal is simply empty, not an error).
 */
function chipShares(items, allocations, roundId) {
  const list = (items || []);
  const ids = list.map(itemId);
  const totals = {};
  ids.forEach((id) => { totals[id] = 0; });

  for (const alloc of allocationList(allocations, roundId)) {
    for (const id of ids) {
      totals[id] += num(alloc[id]);
    }
  }

  const grand = ids.reduce((s, id) => s + totals[id], 0);
  const pct = largestRemainder(ids.map((id) => totals[id]), 100);

  return list.map((item, i) => ({
    itemId: ids[i],
    label: (item && typeof item === 'object' && item.label != null) ? String(item.label) : ids[i],
    chips: totals[ids[i]],
    share: grand > 0 ? pct[i] : 0,
  }));
}

/**
 * PINNED chip-weighted P&L for one participant in one round.
 *
 *     pnl_p = Σ_i ( chips_i/100 − 1/N ) × normActual_i
 *     normActual_i = actual_i / Σactual          (within-round demand share)
 *
 * where N is the number of items in the round and chips_i is the participant's
 * normalized chip weight on item i.
 *
 * Implementation notes:
 *  - We use chipFraction_i = chips_i / Σchips, which equals chips_i/100 exactly
 *    when the allocation is normalized to 100 (store.js guarantees this on
 *    submit). Using Σchips instead of a hard-coded 100 makes the function
 *    robust to un-normalized input while keeping the pinned formula intact.
 *  - The demand-capture contribution of an item the participant placed NO
 *    chips on is chipFraction_i·normActual_i = 0 — i.e. an item with no
 *    allocation contributes nothing on the upside; it still counts against the
 *    1/N equal-split baseline, which is exactly the cost of ignoring demand.
 *
 * GUARDS (both yield a P&L of 0):
 *  - Σactual == 0  → the metric carries no signal yet (and we must not divide
 *    by zero), so P&L is 0 for everyone this round.
 *  - The participant placed no chips at all (Σchips == 0, i.e. never submitted)
 *    → they did not participate, so they have no P&L rather than an artificial
 *    −(1/N) baseline loss.
 *
 * EQUAL-SPLIT ⇒ 0: if chipFraction_i == 1/N for all i, every term is 0.
 *
 * @param {Allocation} allocation  this participant's chips per itemId
 * @param {Object<string,number>} actuals  settlement value per itemId
 * @param {Item[]} items  the round's items (defines N and the item set)
 * @returns {number} the participant's P&L (a small signed dimensionless number)
 */
function participantPnl(allocation, actuals, items) {
  const list = (items || []);
  const N = list.length;
  if (N === 0) return 0;

  const ids = list.map(itemId);
  const totalChips = allocationTotal(allocation);
  if (totalChips <= 0) return 0; // no allocation submitted → no P&L

  const actualMap = (actuals && typeof actuals === 'object') ? actuals : {};
  const sumActual = ids.reduce((s, id) => s + num(actualMap[id]), 0);
  if (sumActual <= 0) return 0; // no demand signal / guard divide-by-zero

  const baseline = 1 / N;
  let pnl = 0;
  for (const id of ids) {
    const chipFraction = num(allocation && allocation[id]) / totalChips;
    const normActual = num(actualMap[id]) / sumActual;
    pnl += (chipFraction - baseline) * normActual;
  }
  return pnl;
}

/**
 * P&L for a named participant in a Round object (convenience wrapper).
 * Returns 0 if the participant has no allocation in that round.
 * @param {Round} round
 * @param {string} name
 * @returns {number}
 */
function roundParticipantPnl(round, name) {
  if (!round) return 0;
  const alloc = (round.allocations || {})[name];
  if (!alloc) return 0;
  return participantPnl(alloc, round.actuals, round.items);
}

/**
 * Cumulative leaderboard: sum each participant's normalized per-round P&L over
 * every SETTLED round, sorted highest-first. Because each round's P&L is
 * already intra-round normalized (see property #2 above), the per-round values
 * live on the same scale and can be added directly.
 *
 * A participant who is absent from a round (not on its roster, or never
 * submitted) contributes exactly 0 for that round — missing ⇒ 0, never a
 * penalty. Names are gathered from the union of every settled round's roster
 * and submitted allocations, so anyone who ever played appears.
 *
 * @param {Round[]} rounds
 * @returns {{name:string,total:number,rounds:{roundId:string,pnl:number}[]}[]}
 *          sorted by total descending, then name ascending for stable order.
 */
function cumulativeLeaderboard(rounds) {
  const settled = (rounds || []).filter((r) => r && r.settled);

  const names = new Set();
  for (const r of settled) {
    (r.roster || []).forEach((n) => { if (n != null && String(n).trim() !== '') names.add(String(n)); });
    Object.keys(r.allocations || {}).forEach((n) => { if (String(n).trim() !== '') names.add(String(n)); });
  }

  const rows = [...names].map((name) => {
    const perRound = settled.map((r) => ({ roundId: r.id, pnl: roundParticipantPnl(r, name) }));
    const total = perRound.reduce((s, x) => s + x.pnl, 0);
    return { name, total, rounds: perRound };
  });

  rows.sort((a, b) => (b.total - a.total) || a.name.localeCompare(b.name));
  return rows;
}

export {
  num,
  itemId,
  largestRemainder,
  allocationTotal,
  normalizeTo100,
  allocationList,
  chipShares,
  participantPnl,
  roundParticipantPnl,
  cumulativeLeaderboard,
};
