// app.js — Chip Market
// Self-contained, hash-routed SPA. Boots a pre-populated sample round so every
// screen is alive on the very first paint. All imagery is inline SVG — no CDN.

const STORAGE_KEY = 'chip-market:v1';
const APP_MARK = 2;

/* ---------- tiny utils ---------- */
const app = document.getElementById('app');
const uid = (p) => p + Math.random().toString(36).slice(2, 8);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\'': '&#39;' }[c]));
const clampInt = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
const round0 = (n) => Math.round(Number(n) || 0);
const pts = (n) => ((Number(n) || 0) * 100).toFixed(1);

/* ---------- domain core (pure, side-effect free) ---------- */
// Largest-remainder normalization to a fixed 100-chip budget.
function normalizeTo100(vals) {
  const arr = vals.map((v) => Math.max(0, Number(v) || 0));
  const sum = arr.reduce((a, b) => a + b, 0);
  if (sum <= 0) return arr.map(() => 0);
  const raw = arr.map((v) => (v / sum) * 100);
  const floors = raw.map(Math.floor);
  const rem = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  const out = floors.slice();
  for (let k = 0; k < rem && order.length; k++) out[order[k % order.length].i]++;
  return out;
}
function allocationTotal(map, items) {
  return items.reduce((a, it) => a + clampInt(map ? map[it.id] : 0), 0);
}
// Aggregate normalized chip-share across all submitted ballots (sums to 100%).
function chipShares(round) {
  const items = round.items || [];
  const allocs = round.allocations || {};
  const totals = items.map((it) => Object.keys(allocs).reduce((s, p) => s + clampInt(allocs[p][it.id]), 0));
  const shares = normalizeTo100(totals);
  return items.map((it, i) => ({ item: it, share: shares[i], raw: totals[i] }));
}
// PINNED formula: pnl_p = Σ (chips_i/100 − 1/N) × normActual_i ,  normActual = actual_i / Σactual.
// Equal-split (100/N each) => 0. Guards Σactual == 0. Intra-round normalization
// makes differing metric scales comparable.
function participantPnl(round, name) {
  const items = round.items || [];
  const N = items.length;
  if (!N) return 0;
  const actuals = round.actuals || {};
  const sumA = items.reduce((a, it) => a + Math.max(0, Number(actuals[it.id]) || 0), 0);
  if (sumA <= 0) return 0;
  const alloc = (round.allocations || {})[name] || {};
  let pnl = 0;
  for (const it of items) {
    const chips = clampInt(alloc[it.id]);
    const na = Math.max(0, Number(actuals[it.id]) || 0) / sumA;
    pnl += (chips / 100 - 1 / N) * na;
  }
  return pnl;
}
// Cumulative normalized P&L across settled rounds; non-submitters contribute 0.
function cumulativeLeaderboard(state) {
  const names = new Set();
  for (const r of state.rounds) {
    for (const n of (r.roster || [])) names.add(n);
    for (const n of Object.keys(r.allocations || {})) names.add(n);
  }
  const totals = {};
  const counts = {};
  for (const n of names) { totals[n] = 0; counts[n] = 0; }
  for (const r of state.rounds) {
    if (!r.settled) continue;
    for (const n of Object.keys(r.allocations || {})) {
      totals[n] = (totals[n] || 0) + participantPnl(r, n);
      counts[n] = (counts[n] || 0) + 1;
    }
  }
  return Object.keys(totals)
    .map((n) => ({ name: n, pnl: totals[n], rounds: counts[n] || 0 }))
    .sort((a, b) => b.pnl - a.pnl || a.name.localeCompare(b.name));
}

/* ---------- self-contained inline SVG imagery ---------- */
const CHIP_PALETTE = [
  ['#e63946', '#ffd6db'], ['#2a9d8f', '#cdeee9'], ['#e9a23b', '#fbe6c4'],
  ['#457b9d', '#cfe2ee'], ['#9b5de5', '#e6d6fb'], ['#f15bb5', '#ffd6ef']
];
function chipColor(i) { return CHIP_PALETTE[i % CHIP_PALETTE.length][0]; }
function chipThumb(i, size) {
  const s = size || 46;
  const base = CHIP_PALETTE[i % CHIP_PALETTE.length][0];
  const light = CHIP_PALETTE[i % CHIP_PALETTE.length][1];
  return `<svg class='chip-svg' viewBox='0 0 100 100' width='${s}' height='${s}' role='img' aria-label='poker chip'>`
    + `<circle cx='50' cy='50' r='47' fill='${base}'/>`
    + `<circle cx='50' cy='50' r='47' fill='none' stroke='#ffffff' stroke-width='5' stroke-dasharray='13 9'/>`
    + `<circle cx='50' cy='50' r='32' fill='none' stroke='rgba(255,255,255,.75)' stroke-width='3'/>`
    + `<circle cx='50' cy='50' r='24' fill='${light}'/>`
    + `<circle cx='50' cy='50' r='24' fill='none' stroke='rgba(0,0,0,.12)' stroke-width='2'/>`
    + `</svg>`;
}
function trophy(size) {
  const s = size || 28;
  return `<svg class='trophy-svg' viewBox='0 0 24 24' width='${s}' height='${s}' role='img' aria-label='trophy'>`
    + `<path d='M6 3h12v3a6 6 0 0 1-12 0V3z' fill='#f4c542'/>`
    + `<path d='M5 4H2v2a4 4 0 0 0 4 4V8a2 2 0 0 1-2-2V4zm14 0h3v2a4 4 0 0 1-4 4V8a2 2 0 0 0 2-2V4z' fill='#d9a521'/>`
    + `<rect x='10' y='11' width='4' height='4' fill='#d9a521'/>`
    + `<rect x='7' y='15' width='10' height='2.5' rx='1' fill='#caa11d'/>`
    + `<rect x='8.5' y='17' width='7' height='3' rx='1' fill='#f4c542'/>`
    + `</svg>`;
}
function chipStack(size) {
  const s = size || 22;
  return `<svg viewBox='0 0 24 24' width='${s}' height='${s}' aria-hidden='true'>`
    + `<ellipse cx='12' cy='18' rx='8' ry='3' fill='#2a9d8f'/>`
    + `<ellipse cx='12' cy='13' rx='8' ry='3' fill='#e9a23b'/>`
    + `<ellipse cx='12' cy='8' rx='8' ry='3' fill='#e63946'/>`
    + `</svg>`;
}

/* ---------- persistence (single seam) ---------- */
function loadRaw() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { return null; }
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* memory-only fallback */ }
}

/* ---------- bundled, clearly-labeled sample round ---------- */
function sampleState() {
  const items = [
    { id: 'it-dragon', name: 'Neon Dragon Skin' },
    { id: 'it-arcade', name: 'Retro Arcade Pack' },
    { id: 'it-pet', name: 'Mythic Pet Companion' }
  ];
  const roster = ['Ava', 'Ben', 'Cara', 'Dan'];
  const allocations = {
    Ava: { 'it-dragon': 50, 'it-arcade': 30, 'it-pet': 20 },
    Ben: { 'it-dragon': 60, 'it-arcade': 10, 'it-pet': 30 },
    Cara: { 'it-dragon': 20, 'it-arcade': 50, 'it-pet': 30 },
    Dan: { 'it-dragon': 40, 'it-arcade': 40, 'it-pet': 20 }
  };
  const actuals = { 'it-dragon': 1200, 'it-arcade': 800, 'it-pet': 1000 };
  const round = {
    id: 'r-sample', name: 'Q3 Skin Greenlight', metricLabel: 'D7 units',
    sample: true, items, roster, allocations, actuals, settled: true,
    selectedParticipant: 'Ava'
  };
  return { __app: APP_MARK, schemaVersion: 1, rounds: [round], currentRoundId: 'r-sample' };
}

function boot() {
  const raw = loadRaw();
  if (raw && raw.__app === APP_MARK && Array.isArray(raw.rounds)) return raw;
  return sampleState();
}

/* ---------- in-memory state + the only mutators ---------- */
let state = boot();
save();

function currentRound() {
  return state.rounds.find((r) => r.id === state.currentRoundId) || state.rounds[state.rounds.length - 1] || null;
}
function commit() { save(); render(); }

function createRound(name, metricLabel, itemNames, rosterNames) {
  const items = itemNames.map((n) => ({ id: uid('it-'), name: n }));
  const seen = new Set();
  const roster = rosterNames.filter((n) => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  const round = {
    id: uid('r-'), name: name || 'Untitled Round', metricLabel: metricLabel || 'units',
    sample: false, items, roster, allocations: {}, actuals: {}, settled: false,
    selectedParticipant: roster[0] || null
  };
  state.rounds.push(round);
  state.currentRoundId = round.id;
  commit();
}
function selectParticipant(name) {
  const r = currentRound();
  if (!r) return;
  r.selectedParticipant = name;
  commit();
}
function submitAllocation(name, rawMap) {
  const r = currentRound();
  if (!r || !name) return;
  const values = r.items.map((it) => clampInt(rawMap[it.id]));
  const norm = normalizeTo100(values);
  const m = {};
  r.items.forEach((it, i) => { m[it.id] = norm[i]; });
  r.allocations[name] = m;
  r.selectedParticipant = name;
  commit();
}
function settleRound(rawActuals) {
  const r = currentRound();
  if (!r) return;
  const a = {};
  r.items.forEach((it) => { a[it.id] = Math.max(0, round0(rawActuals[it.id])); });
  r.actuals = a;
  r.settled = true;
  commit();
}
function dismissSample() {
  state.rounds = state.rounds.filter((r) => !r.sample);
  state.currentRoundId = state.rounds.length ? state.rounds[state.rounds.length - 1].id : null;
  save();
  location.hash = '#/setup';
  render();
}

/* ---------- hash router ---------- */
const ROUTES = ['setup', 'allocate', 'signal', 'settle', 'leaderboard'];
function currentRoute() {
  const h = (location.hash || '').replace(/^#\/?/, '').toLowerCase();
  return ROUTES.indexOf(h) >= 0 ? h : 'signal';
}
function setActiveNav(route) {
  const links = document.querySelectorAll('a');
  links.forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (href.indexOf('#/') !== 0) return;
    const r = href.replace(/^#\//, '').toLowerCase();
    a.classList.toggle('active', r === route);
    a.setAttribute('aria-current', r === route ? 'page' : 'false');
  });
}

/* ---------- shared view bits ---------- */
function sampleBadge(r) {
  if (!r || !r.sample) return '';
  return `<div class='sample-banner'><span class='badge'>Sample</span>`
    + `<span>You are viewing the bundled <strong>(Sample) ${esc(r.name)}</strong> round &mdash; explore freely, then <a href='#/setup'>make your own</a>.</span>`
    + `<a class='btn ghost small' href='#/setup'>Create a round</a></div>`;
}
function emptyState(msg) {
  return `<section class='card empty-state'>${chipStack(40)}<p>${esc(msg || 'No round yet.')}</p>`
    + `<a class='btn primary' href='#/setup'>Go to Setup</a></section>`;
}

/* ---------- views ---------- */
function viewSetup(r) {
  const rounds = state.rounds;
  const list = rounds.length
    ? rounds.map((rr) => `<li class='round-item ${rr.id === state.currentRoundId ? 'current' : ''}'>`
        + `<button class='link' data-action='make-current' data-id='${esc(rr.id)}'>`
        + `${rr.sample ? `<span class='badge tiny'>Sample</span> ` : ''}${esc(rr.name)}</button>`
        + `<span class='muted small'>${rr.items.length} items · ${rr.roster.length} players · ${rr.settled ? 'settled' : 'open'}</span>`
        + `</li>`).join('')
    : `<li class='muted'>No rounds yet.</li>`;
  return `${sampleBadge(r)}`
    + `<section class='card'>`
    + `<h2>Create a Round</h2>`
    + `<p class='muted'>The admin sets up one prioritization round: a settlement metric, the content items, and a fixed player roster.</p>`
    + `<form id='setup-form' data-action='create-round' class='form'>`
    + `<label>Round name<input name='name' required placeholder='Q4 Event Greenlight'></label>`
    + `<label>Settlement metric label<input name='metric' required placeholder='D7 units'></label>`
    + `<label>Content items <span class='muted small'>(one per line)</span>`
    + `<textarea name='items' rows='3' required placeholder='Neon Dragon Skin&#10;Retro Arcade Pack&#10;Mythic Pet Companion'></textarea></label>`
    + `<label>Player roster <span class='muted small'>(one name per line)</span>`
    + `<textarea name='roster' rows='3' required placeholder='Ava&#10;Ben&#10;Cara'></textarea></label>`
    + `<button class='btn primary' type='submit'>Create round</button>`
    + `</form></section>`
    + `<section class='card'>`
    + `<h2>Rounds</h2>`
    + `<ul class='round-list'>${list}</ul>`
    + `${rounds.some((x) => x.sample) ? `<button class='btn ghost' data-action='dismiss-sample'>Dismiss sample round</button>` : ''}`
    + `</section>`;
}

function viewAllocate(r) {
  if (!r) return emptyState('Create a round in Setup before allocating chips.');
  if (!r.roster.length) return emptyState('This round has no players — add a roster in Setup.');
  const sel = r.selectedParticipant && r.roster.indexOf(r.selectedParticipant) >= 0 ? r.selectedParticipant : r.roster[0];
  const submitted = new Set(Object.keys(r.allocations || {}));
  const chips = r.roster.map((n) => `<button class='roster-chip ${n === sel ? 'sel' : ''} ${submitted.has(n) ? 'done' : ''}' data-action='select-participant' data-name='${esc(n)}'>${esc(n)}${submitted.has(n) ? ` <span class='check'>✓</span>` : ''}</button>`).join('');
  const cur = (r.allocations || {})[sel] || {};
  const inputs = r.items.map((it, i) => `<div class='alloc-input-row'>`
    + `<span class='thumb'>${chipThumb(i, 36)}</span>`
    + `<label class='alloc-label' for='in-${esc(it.id)}'>${esc(it.name)}</label>`
    + `<input id='in-${esc(it.id)}' class='alloc-input' type='number' min='0' step='1' inputmode='numeric' name='${esc(it.id)}' value='${cur[it.id] != null ? cur[it.id] : ''}' placeholder='0'>`
    + `</div>`).join('');
  const total = allocationTotal(cur, r.items);
  return `${sampleBadge(r)}`
    + `<section class='card'>`
    + `<h2>${chipStack(24)} Allocate Chips</h2>`
    + `<p class='muted'>Pass the device around: pick a player, then spend any non-negative whole numbers. The ballot is normalized to a 100-chip budget on submit.</p>`
    + `<div class='roster-row'>${chips}</div>`
    + `<form id='alloc-form' data-action='submit-alloc' class='form'>`
    + `<input type='hidden' name='participant' value='${esc(sel)}'>`
    + `<div class='alloc-inputs'>${inputs}</div>`
    + `<div class='alloc-foot'>`
    + `<span class='live-total'>Total: <strong id='alloc-total'>${total}</strong> chips</span>`
    + `<button class='btn ghost small' type='button' data-action='normalize'>Normalize to 100</button>`
    + `</div>`
    + `<button class='btn primary' type='submit'>Submit ballot for ${esc(sel)}</button>`
    + `</form>`
    + `<p class='muted small'>${submitted.size} of ${r.roster.length} players have submitted.</p>`
    + `</section>`;
}

function viewSignal(r) {
  if (!r) return emptyState('No round yet — create one in Setup to see the popularity signal.');
  const shares = chipShares(r);
  const submitters = Object.keys(r.allocations || {});
  const totalChips = shares.reduce((a, s) => a + s.raw, 0);
  const bars = shares.map((s, i) => `<li class='bar-row'>`
    + `<div class='bar-head'>`
    + `<span class='thumb'>${chipThumb(i, 40)}</span>`
    + `<span class='bar-name'>${esc(s.item.name)}</span>`
    + `<span class='bar-pct'>${s.share}%</span>`
    + `</div>`
    + `<div class='bar-track'><div class='bar-fill' style='width:${s.share}%;background:${chipColor(i)}'></div></div>`
    + `</li>`).join('');
  return `${sampleBadge(r)}`
    + `<section class='card'>`
    + `<h2>${chipStack(24)} Popularity Signal</h2>`
    + `<p class='muted'>Normalized chip-share across <strong>${submitters.length}</strong> submitted ${submitters.length === 1 ? 'ballot' : 'ballots'} &mdash; bars sum to 100%.</p>`
    + `${totalChips > 0 ? `<ul class='bars'>${bars}</ul>` : `<p class='note'>No chips spent yet. Head to <a href='#/allocate'>Allocate</a> to cast the first ballot.</p>`}`
    + `</section>`;
}

function viewSettle(r) {
  if (!r) return emptyState('Create and run a round before settling it.');
  const a = r.actuals || {};
  const inputs = r.items.map((it, i) => `<div class='alloc-input-row'>`
    + `<span class='thumb'>${chipThumb(i, 36)}</span>`
    + `<label class='alloc-label' for='ac-${esc(it.id)}'>${esc(it.name)}</label>`
    + `<input id='ac-${esc(it.id)}' class='settle-input' type='number' min='0' step='1' inputmode='numeric' name='${esc(it.id)}' value='${a[it.id] != null ? round0(a[it.id]) : ''}' placeholder='0'>`
    + `</div>`).join('');
  let results = '';
  if (r.settled) {
    const submitters = Object.keys(r.allocations || {});
    const sumA = r.items.reduce((s, it) => s + Math.max(0, Number(a[it.id]) || 0), 0);
    if (!submitters.length) {
      results = `<p class='note'>No ballots were submitted, so there is no P&amp;L to compute.</p>`;
    } else if (sumA <= 0) {
      results = `<p class='note'>Actuals total zero &mdash; every player&#39;s P&amp;L is 0.0 until real ${esc(r.metricLabel)} are entered.</p>`;
    } else {
      const rows = submitters.map((n) => ({ n, v: participantPnl(r, n) }))
        .sort((x, y) => y.v - x.v)
        .map((o) => `<tr><td>${esc(o.n)}</td><td class='num ${o.v >= 0 ? 'gain' : 'loss'}'>${o.v >= 0 ? '+' : ''}${pts(o.v)}</td></tr>`).join('');
      results = `<table class='pnl-table'><thead><tr><th>Player</th><th class='num'>Round P&amp;L (pts)</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
  }
  return `${sampleBadge(r)}`
    + `<section class='card'>`
    + `<h2>Settle Round</h2>`
    + `<p class='muted'>Admin enters the actual <strong>${esc(r.metricLabel)}</strong> each item earned. Scales cancel — actuals are normalized within the round.</p>`
    + `<form id='settle-form' data-action='settle' class='form'>`
    + `<div class='alloc-inputs'>${inputs}</div>`
    + `<button class='btn primary' type='submit'>${r.settled ? 'Update actuals &amp; re-settle' : 'Settle round'}</button>`
    + `</form></section>`
    + `${r.settled ? `<section class='card'><h2>Round Result</h2>${results}<p class='muted small'>Equal-split ballots score exactly 0.0 &mdash; beating the field means over-weighting the eventual winners.</p></section>` : ''}`;
}

function viewLeaderboard() {
  const board = cumulativeLeaderboard(state);
  const settledRounds = state.rounds.filter((x) => x.settled).length;
  if (!board.length || !settledRounds) {
    return `<section class='card'><h2>${trophy(26)} Leaderboard</h2><p class='note'>No settled rounds yet. Settle a round to rank players by cumulative P&amp;L.</p></section>`;
  }
  const rows = board.map((o, i) => `<tr class='${i === 0 ? 'leader' : ''}'>`
    + `<td class='rank'>${i === 0 ? trophy(24) : `<span class='rank-num'>${i + 1}</span>`}</td>`
    + `<td>${esc(o.name)}</td>`
    + `<td class='num muted small'>${o.rounds}</td>`
    + `<td class='num ${o.pnl >= 0 ? 'gain' : 'loss'}'>${o.pnl >= 0 ? '+' : ''}${pts(o.pnl)}</td>`
    + `</tr>`).join('');
  return `${sampleBadge(currentRound())}`
    + `<section class='card'>`
    + `<h2>${trophy(26)} Leaderboard</h2>`
    + `<p class='muted'>Cumulative normalized P&amp;L across ${settledRounds} settled ${settledRounds === 1 ? 'round' : 'rounds'}. Higher is sharper.</p>`
    + `<table class='lb-table'>`
    + `<thead><tr><th>#</th><th>Player</th><th class='num'>Rds</th><th class='num'>P&amp;L (pts)</th></tr></thead>`
    + `<tbody>${rows}</tbody>`
    + `</table></section>`;
}

/* ---------- render ---------- */
function render() {
  const route = currentRoute();
  const r = currentRound();
  document.querySelectorAll('[data-metric-slot]').forEach((el) => { el.textContent = r ? r.metricLabel : ''; });
  let html = '';
  try {
    if (route === 'setup') html = viewSetup(r);
    else if (route === 'allocate') html = viewAllocate(r);
    else if (route === 'signal') html = viewSignal(r);
    else if (route === 'settle') html = viewSettle(r);
    else html = viewLeaderboard(r);
  } catch (e) {
    html = `<section class='card'><h2>Something went wrong</h2><p class='note'>${esc(e && e.message)}</p><a class='btn primary' href='#/signal'>Back to Signal</a></section>`;
  }
  app.innerHTML = html;
  setActiveNav(route);
}

/* ---------- event delegation (bound once) ---------- */
function updateLiveTotal() {
  const el = document.getElementById('alloc-total');
  if (!el) return;
  let t = 0;
  document.querySelectorAll('.alloc-input').forEach((i) => { t += clampInt(i.value); });
  el.textContent = t;
}
function doNormalize() {
  const inputs = Array.prototype.slice.call(document.querySelectorAll('.alloc-input'));
  const vals = inputs.map((i) => clampInt(i.value));
  const norm = normalizeTo100(vals);
  inputs.forEach((i, k) => { i.value = norm[k]; });
  updateLiveTotal();
}
function handleCreateRound(form) {
  const fd = new FormData(form);
  const name = String(fd.get('name') || '').trim();
  const metric = String(fd.get('metric') || '').trim();
  const items = String(fd.get('items') || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const roster = String(fd.get('roster') || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (!items.length || !roster.length) return;
  createRound(name, metric, items, roster);
  location.hash = '#/allocate';
}
function handleSubmitAlloc(form) {
  const fd = new FormData(form);
  const name = String(fd.get('participant') || '').trim();
  const r = currentRound();
  if (!r || !name) return;
  const map = {};
  r.items.forEach((it) => { map[it.id] = clampInt(fd.get(it.id)); });
  submitAllocation(name, map);
}
function handleSettle(form) {
  const fd = new FormData(form);
  const r = currentRound();
  if (!r) return;
  const map = {};
  r.items.forEach((it) => { map[it.id] = round0(fd.get(it.id)); });
  settleRound(map);
}

app.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const action = t.getAttribute('data-action');
  if (action === 'select-participant') { selectParticipant(t.getAttribute('data-name')); }
  else if (action === 'make-current') { state.currentRoundId = t.getAttribute('data-id'); commit(); }
  else if (action === 'dismiss-sample') { dismissSample(); }
  else if (action === 'normalize') { e.preventDefault(); doNormalize(); }
});
app.addEventListener('input', (e) => {
  if (e.target && e.target.classList && e.target.classList.contains('alloc-input')) updateLiveTotal();
});
app.addEventListener('submit', (e) => {
  const form = e.target;
  const action = form.getAttribute && form.getAttribute('data-action');
  if (!action) return;
  e.preventDefault();
  if (action === 'create-round') handleCreateRound(form);
  else if (action === 'submit-alloc') handleSubmitAlloc(form);
  else if (action === 'settle') handleSettle(form);
});

/* ---------- boot the loop ---------- */
window.addEventListener('hashchange', render);
render();
