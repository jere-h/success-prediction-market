// sample-data.js
//
// Bundled, clearly-labeled default state for Chip Market.
//
// This module exports a single self-demonstrating AppState containing a
// "(Sample)" prioritization round (plus one prior settled sample round so the
// Leaderboard shows a CUMULATIVE ranking on first paint). It is imported by
// persistence.js and used to seed localStorage ONLY when storage is truly empty
// — never on every load. Everything here is example data: the sample is
// dismissable, and the moment the user creates their own round the seed is
// replaced.
//
// AppState shape (kept deliberately simple — plain JSON, no classes — so it
// round-trips cleanly through JSON.stringify in persistence.js):
//
//   {
//     schemaVersion: number,         // bumped only on breaking shape changes
//     seededFrom: 'sample' | 'user',
//     sampleDismissed: boolean,      // user hid the sample banner / cleared it
//     currentRoundId: string|null,   // round shown by Signal / Settle
//     selectedParticipant: string|null, // who is allocating on the Allocate tab
//     rounds: Round[]
//   }
//
//   Round {
//     id: string,
//     name: string,                  // sample rounds are prefixed "(Sample)"
//     metricLabel: string,           // e.g. 'D7 units' — the settlement metric
//     isSample: boolean,
//     settled: boolean,              // actuals entered & locked in
//     createdAt: string,             // fixed ISO string (no Date.now in a static seed)
//     items: Item[],                 // content under consideration
//     roster: string[],              // named participants (each has a 100-chip budget)
//     allocations: { [name]: { [itemId]: chips } }, // each row should sum ~100
//     actuals: { [itemId]: number } // measured metric per item (settle step)
//   }
//
//   Item { id, title, subtitle, accent }  // accent drives the CSS/SVG chip thumbnail
//
// Intra-round normalization (see domain.js) makes the two sample rounds
// comparable on the leaderboard even though one settles in 'D7 units' and the
// other in 'Revenue ($)' — the within-round actual shares cancel the scale.

// ---------------------------------------------------------------------------
// The canonical sample blob. Never exported by reference for mutation — callers
// should use createSampleState() (or the frozen SAMPLE_STATE) to get a fresh,
// independent copy they can safely hand to the store.
// ---------------------------------------------------------------------------
const BASE_SAMPLE_STATE = {
  schemaVersion: 1,
  seededFrom: 'sample',
  sampleDismissed: false,
  currentRoundId: 'sample-q3',
  selectedParticipant: null,
  rounds: [
    // ----- Prior, already-settled round (gives the Leaderboard history) -----
    {
      id: 'sample-summer',
      name: '(Sample) Summer Event Greenlight',
      metricLabel: 'Revenue ($)',
      isSample: true,
      settled: true,
      createdAt: '2026-04-12T09:30:00.000Z',
      items: [
        {
          id: 'e1',
          title: 'Beach Bash Battle Pass',
          subtitle: '60-tier seasonal pass',
          accent: '#e4572e'
        },
        {
          id: 'e2',
          title: 'Tropical Map Remix',
          subtitle: 'Reworked summer arena',
          accent: '#3a8d6f'
        },
        {
          id: 'e3',
          title: 'Limited Surfboard Set',
          subtitle: 'Cosmetic traversal skins',
          accent: '#2b6cb0'
        }
      ],
      roster: ['Maya (PM)', 'Devin (Design)', 'Priya (Data)', 'Theo (Marketing)'],
      allocations: {
        'Maya (PM)': { e1: 40, e2: 30, e3: 30 },
        'Devin (Design)': { e1: 30, e2: 50, e3: 20 },
        'Priya (Data)': { e1: 20, e2: 40, e3: 40 },
        'Theo (Marketing)': { e1: 50, e2: 30, e3: 20 }
      },
      actuals: { e1: 124000, e2: 98000, e3: 61000 }
    },

    // ----- Current, settled round (named in the brief) -----
    {
      id: 'sample-q3',
      name: '(Sample) Q3 Skin Greenlight',
      metricLabel: 'D7 units',
      isSample: true,
      settled: true,
      createdAt: '2026-06-20T16:00:00.000Z',
      items: [
        {
          id: 's1',
          title: 'Neon Dynasty Bundle',
          subtitle: 'Synthwave hero + weapon set',
          accent: '#d4af37'
        },
        {
          id: 's2',
          title: 'Frostforged Warden',
          subtitle: 'Ice-tier legendary armor',
          accent: '#3aa0d4'
        },
        {
          id: 's3',
          title: 'Retro Arcade Pack',
          subtitle: '8-bit emotes & sprays',
          accent: '#9b5de5'
        }
      ],
      roster: ['Maya (PM)', 'Devin (Design)', 'Priya (Data)', 'Theo (Marketing)'],
      allocations: {
        'Maya (PM)': { s1: 50, s2: 30, s3: 20 },
        'Devin (Design)': { s1: 40, s2: 40, s3: 20 },
        'Priya (Data)': { s1: 60, s2: 25, s3: 15 },
        'Theo (Marketing)': { s1: 35, s2: 25, s3: 40 }
      },
      actuals: { s1: 8200, s2: 5400, s3: 6100 }
    }
  ]
};

// Deep clone so each consumer gets an independent, mutable copy. structuredClone
// is available in every browser that supports ES modules; fall back to the JSON
// round-trip just in case (the blob is pure JSON, so this is lossless).
function deepClone(value) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (_err) {
      /* fall through to JSON clone */
    }
  }
  return JSON.parse(JSON.stringify(value));
}

/**
 * Build a fresh, independent copy of the bundled sample AppState.
 * Use this when seeding the store so later mutations don't touch the template.
 * @returns {object} a deep copy of the sample AppState
 */
export function createSampleState() {
  return deepClone(BASE_SAMPLE_STATE);
}

// A ready-made (frozen) copy for callers that just want to read the template.
// Frozen so accidental mutation throws in strict mode instead of corrupting the
// shared seed; mutate createSampleState() instead.
export const SAMPLE_STATE = Object.freeze(deepClone(BASE_SAMPLE_STATE));

// Convenience aliases so persistence.js can import under whichever name it uses.
export const sampleData = SAMPLE_STATE;
export const sampleState = SAMPLE_STATE;

// Default export is the factory — `import seed from './sample-data.js'` then
// `seed()` yields a fresh state; this is the safest pattern for seeding.
export default createSampleState;
