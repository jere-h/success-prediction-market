// icons.js — Chip Market
// Self-contained inline-SVG imagery. No data-URIs, no external/CDN requests.
// Every export is a pure function returning an SVG markup string, so screens
// are visually alive on first paint with zero network dependency.
//
// Usage (from app.js views):
//   el.innerHTML = chipThumb('Neon Ronin Skin');
//   el.innerHTML = navIcon('signal');
//   el.innerHTML = trophy(1); // gold / silver / bronze by rank

'use strict';

/* ------------------------------------------------------------------ *
 * Deterministic palette helpers
 * ------------------------------------------------------------------ */

// A small, casino-flavored palette of chip face colors. Picking by a
// stable hash of the label means the same item always gets the same chip.
const CHIP_FACES = [
  { base: '#d7263d', edge: '#a11226', ring: '#ffe7ea' }, // red
  { base: '#1b6ca8', edge: '#0d4870', ring: '#e3f1fb' }, // blue
  { base: '#2a9d3f', edge: '#1c6e2c', ring: '#e4f7e7' }, // green
  { base: '#f0a202', edge: '#b87600', ring: '#fff4dc' }, // gold
  { base: '#7b2cbf', edge: '#561a8a', ring: '#f1e6fb' }, // purple
  { base: '#e8590c', edge: '#ad3f08', ring: '#ffeada' }, // orange
  { base: '#0c8599', edge: '#076170', ring: '#dff6f9' }, // teal
  { base: '#c2255c', edge: '#911644', ring: '#ffe3ee' }, // magenta
];

// FNV-1a style string hash → non-negative 32-bit int. Stable across loads.
function hashString(str) {
  const s = String(str == null ? '' : str);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function faceFor(seed) {
  return CHIP_FACES[hashString(seed) % CHIP_FACES.length];
}

// Escape text destined for SVG attributes / text nodes.
function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Produce up to two uppercase initials from a label ("Neon Ronin" -> "NR").
function initials(label) {
  const words = String(label == null ? '' : label)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

// Unique id fragment so multiple inline gradients/clips don't collide.
let uidCounter = 0;
function uid(prefix) {
  uidCounter += 1;
  return `${prefix}-${uidCounter}`;
}

/* ------------------------------------------------------------------ *
 * Poker-chip thumbnail / avatar
 * ------------------------------------------------------------------ */

// Draw the classic dashed edge spots around a poker chip.
function chipEdgeSpots(cx, cy, r, color, count) {
  const spots = [];
  const n = count || 6;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    const sx = cx + Math.cos(a) * r;
    const sy = cy + Math.sin(a) * r;
    const w = r * 0.42;
    const h = r * 0.6;
    const deg = (a * 180) / Math.PI + 90;
    spots.push(
      `<rect x="${(sx - w / 2).toFixed(2)}" y="${(sy - h / 2).toFixed(2)}" ` +
        `width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${(w / 2).toFixed(2)}" ` +
        `fill="${color}" transform="rotate(${deg.toFixed(2)} ${sx.toFixed(2)} ${sy.toFixed(2)})" />`
    );
  }
  return spots.join('');
}

/**
 * A CSS/SVG-drawn poker chip representing a content item.
 * @param {string} label  item title (drives color + initials)
 * @param {object} [opts] { size, showLabel }
 * @returns {string} svg markup
 */
function chipThumb(label, opts) {
  const o = opts || {};
  const size = o.size || 96;
  const face = faceFor(label);
  const cx = size / 2;
  const cy = size / 2;
  const outer = size * 0.46;
  const inner = size * 0.3;
  const gid = uid('chipg');
  const text = esc(initials(label));

  return (
    `<svg class="icon icon-chip" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" ` +
    `role="img" aria-label="${esc(label)} chip" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><radialGradient id="${gid}" cx="38%" cy="32%" r="75%">` +
    `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.35"/>` +
    `<stop offset="55%" stop-color="${face.base}" stop-opacity="0"/>` +
    `</radialGradient></defs>` +
    // edge / rim
    `<circle cx="${cx}" cy="${cy}" r="${outer.toFixed(2)}" fill="${face.edge}"/>` +
    chipEdgeSpots(cx, cy, outer, face.ring, 6) +
    // face
    `<circle cx="${cx}" cy="${cy}" r="${(outer * 0.84).toFixed(2)}" fill="${face.base}"/>` +
    // inner ring + center
    `<circle cx="${cx}" cy="${cy}" r="${inner.toFixed(2)}" fill="none" ` +
    `stroke="${face.ring}" stroke-width="${(size * 0.03).toFixed(2)}" stroke-dasharray="3 4"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${(inner * 0.78).toFixed(2)}" fill="${face.edge}"/>` +
    // glossy highlight
    `<circle cx="${cx}" cy="${cy}" r="${outer.toFixed(2)}" fill="url(#${gid})"/>` +
    // initials
    `<text x="${cx}" y="${cy}" fill="${face.ring}" font-family="system-ui,Segoe UI,Roboto,sans-serif" ` +
    `font-size="${(inner * 0.95).toFixed(2)}" font-weight="700" text-anchor="middle" ` +
    `dominant-baseline="central">${text}</text>` +
    `</svg>`
  );
}

// Alias: a smaller chip used as a participant avatar.
function chipAvatar(name, opts) {
  return chipThumb(name, Object.assign({ size: 40 }, opts || {}));
}

/* ------------------------------------------------------------------ *
 * Trophy (leaderboard)
 * ------------------------------------------------------------------ */

/**
 * A trophy glyph. Rank 1/2/3 tints gold/silver/bronze; others = slate.
 * @param {number} [rank]
 * @param {object} [opts] { size }
 */
function trophy(rank, opts) {
  const o = opts || {};
  const size = o.size || 28;
  const tints = {
    1: { metal: '#f0c000', dark: '#b88a00' },
    2: { metal: '#c7ccd1', dark: '#8a9198' },
    3: { metal: '#cd7f32', dark: '#9a5d22' },
  };
  const t = tints[rank] || { metal: '#8aa0a8', dark: '#5d7077' };
  const gid = uid('trog');
  return (
    `<svg class="icon icon-trophy" viewBox="0 0 24 24" width="${size}" height="${size}" ` +
    `role="img" aria-label="${rank ? 'Rank ' + rank + ' trophy' : 'Trophy'}" ` +
    `xmlns="http://www.w3.org/2000/svg">` +
    `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="${t.metal}"/>` +
    `<stop offset="100%" stop-color="${t.dark}"/>` +
    `</linearGradient></defs>` +
    // handles
    `<path d="M5 4H3a3 3 0 0 0 3 4" fill="none" stroke="${t.dark}" stroke-width="1.6" stroke-linecap="round"/>` +
    `<path d="M19 4h2a3 3 0 0 1-3 4" fill="none" stroke="${t.dark}" stroke-width="1.6" stroke-linecap="round"/>` +
    // cup
    `<path d="M6 3h12v4a6 6 0 0 1-12 0V3Z" fill="url(#${gid})" stroke="${t.dark}" stroke-width="1"/>` +
    // stem + base
    `<rect x="11" y="13" width="2" height="4" fill="${t.dark}"/>` +
    `<path d="M8 20a4 4 0 0 1 8 0Z" fill="url(#${gid})" stroke="${t.dark}" stroke-width="1"/>` +
    `<rect x="7" y="20" width="10" height="2" rx="1" fill="${t.dark}"/>` +
    (rank
      ? `<text x="12" y="7.2" fill="#3a2a00" font-family="system-ui,sans-serif" font-size="5" ` +
        `font-weight="700" text-anchor="middle" dominant-baseline="central">${esc(rank)}</text>`
      : '') +
    `</svg>`
  );
}

/* ------------------------------------------------------------------ *
 * Chip-stack glyph
 * ------------------------------------------------------------------ */

/** A stack of poker chips — decorative budget/allocation glyph. */
function chipStack(opts) {
  const o = opts || {};
  const size = o.size || 28;
  const colors = ['#d7263d', '#1b6ca8', '#2a9d3f', '#f0a202'];
  const layers = [];
  for (let i = 0; i < 4; i++) {
    const y = 17 - i * 3.2;
    const c = colors[i % colors.length];
    layers.push(
      `<ellipse cx="12" cy="${(y + 2.6).toFixed(1)}" rx="8" ry="2.8" fill="#00000022"/>` +
        `<rect x="4" y="${y.toFixed(1)}" width="16" height="3.4" fill="${c}"/>` +
        `<ellipse cx="12" cy="${y.toFixed(1)}" rx="8" ry="2.8" fill="${c}"/>` +
        `<ellipse cx="12" cy="${y.toFixed(1)}" rx="8" ry="2.8" fill="none" stroke="#ffffff66" stroke-width="0.8"/>`
    );
  }
  return (
    `<svg class="icon icon-chipstack" viewBox="0 0 24 24" width="${size}" height="${size}" ` +
    `role="img" aria-label="Chip stack" xmlns="http://www.w3.org/2000/svg">${layers.join('')}</svg>`
  );
}

/* ------------------------------------------------------------------ *
 * Bar-chart glyph
 * ------------------------------------------------------------------ */

/** A simple bar-chart glyph — the popularity-signal motif. */
function barChart(opts) {
  const o = opts || {};
  const size = o.size || 28;
  const bars = [
    { x: 3, h: 8, c: '#d7263d' },
    { x: 9.5, h: 13, c: '#f0a202' },
    { x: 16, h: 18, c: '#2a9d3f' },
  ];
  const rects = bars
    .map(
      (b) =>
        `<rect x="${b.x}" y="${20 - b.h}" width="5" height="${b.h}" rx="1" fill="${b.c}"/>`
    )
    .join('');
  return (
    `<svg class="icon icon-barchart" viewBox="0 0 24 24" width="${size}" height="${size}" ` +
    `role="img" aria-label="Bar chart" xmlns="http://www.w3.org/2000/svg">` +
    rects +
    `<line x1="2" y1="21" x2="22" y2="21" stroke="#ffffff88" stroke-width="1.4" stroke-linecap="round"/>` +
    `</svg>`
  );
}

/* ------------------------------------------------------------------ *
 * Navigation icons
 * ------------------------------------------------------------------ */

// Stroke-based line icons; inherit currentColor so CSS controls the tint.
const NAV_PATHS = {
  // Setup — gear
  setup:
    '<circle cx="12" cy="12" r="3.2"/>' +
    '<path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5" stroke-linecap="round"/>' +
    '<path d="M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" stroke-linecap="round"/>',
  // Allocate — hand dropping a coin / target
  allocate:
    '<circle cx="12" cy="9" r="4"/>' +
    '<path d="M12 7v4M10 9h4" stroke-linecap="round"/>' +
    '<path d="M5 20c0-3 3.1-5 7-5s7 2 7 5" stroke-linecap="round"/>',
  // Signal — bars
  signal:
    '<path d="M5 20v-6M12 20V8M19 20v-9" stroke-linecap="round"/>',
  // Settle — checklist / ledger
  settle:
    '<rect x="4" y="3.5" width="16" height="17" rx="2"/>' +
    '<path d="M8 9l2 2 3-3.5M8 15h8" stroke-linecap="round" stroke-linejoin="round"/>',
  // Leaderboard — podium / ranked bars
  leaderboard:
    '<rect x="9" y="7" width="6" height="13" rx="1"/>' +
    '<rect x="3" y="12" width="6" height="8" rx="1"/>' +
    '<rect x="15" y="10" width="6" height="10" rx="1"/>',
};

/**
 * Hash-nav tab icon for a screen.
 * @param {string} name  one of setup|allocate|signal|settle|leaderboard
 * @param {object} [opts] { size }
 */
function navIcon(name, opts) {
  const o = opts || {};
  const size = o.size || 22;
  const body = NAV_PATHS[name] || NAV_PATHS.setup;
  return (
    `<svg class="icon icon-nav icon-nav-${esc(name)}" viewBox="0 0 24 24" width="${size}" height="${size}" ` +
    `role="img" aria-label="${esc(name)}" xmlns="http://www.w3.org/2000/svg" ` +
    `fill="none" stroke="currentColor" stroke-width="1.7">${body}</svg>`
  );
}

/* ------------------------------------------------------------------ *
 * Misc utility glyphs
 * ------------------------------------------------------------------ */

/** Small check-circle used for "already submitted" roster state. */
function checkBadge(opts) {
  const o = opts || {};
  const size = o.size || 18;
  return (
    `<svg class="icon icon-check" viewBox="0 0 24 24" width="${size}" height="${size}" ` +
    `role="img" aria-label="Submitted" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="12" cy="12" r="10" fill="#2a9d3f"/>` +
    `<path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#fff" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round"/></svg>`
  );
}

/** Small hollow circle used for "awaiting submission" roster state. */
function pendingBadge(opts) {
  const o = opts || {};
  const size = o.size || 18;
  return (
    `<svg class="icon icon-pending" viewBox="0 0 24 24" width="${size}" height="${size}" ` +
    `role="img" aria-label="Awaiting" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="12" cy="12" r="9" fill="none" stroke="#cbb27a" stroke-width="2" stroke-dasharray="3 3"/>` +
    `</svg>`
  );
}

/** Close "x" for the dismissable sample badge. */
function closeGlyph(opts) {
  const o = opts || {};
  const size = o.size || 16;
  return (
    `<svg class="icon icon-close" viewBox="0 0 24 24" width="${size}" height="${size}" ` +
    `role="img" aria-label="Dismiss" xmlns="http://www.w3.org/2000/svg" ` +
    `fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">` +
    `<path d="M6 6l12 12M18 6 6 18"/></svg>`
  );
}

/* ------------------------------------------------------------------ *
 * Exports
 * ------------------------------------------------------------------ */

export {
  chipThumb,
  chipAvatar,
  trophy,
  chipStack,
  barChart,
  navIcon,
  checkBadge,
  pendingBadge,
  closeGlyph,
  // low-level helpers, handy for views that want consistent color/initials
  faceFor,
  initials,
  hashString,
};
