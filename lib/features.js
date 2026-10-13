// THE FEATURE REGISTRY (2026-10-12, Donovan: "give me something to give early access to people I want for BUCKETS or any feature I want to add like that").
// ONE list of the features that are held back from the public. Adding a feature is ONE line in FEATURES; the access rule, the invite flow, the admin
// hub card and the grant table all read this list and nothing else.
//
//   key           the stable name stored in early_access_grants.feature / early_access_invites.feature (lowercase, a-z 0-9 _)
//   label         what the admin hub shows
//   publicSwitch  () => boolean   true once the feature is public for everyone. Grants are then no-ops (the rows are kept).
//                 For BUCKETS this is lib/openSwitch.js bucketsOpen(): the SAME function every poster asks.
//   landing       where a holder lands after redeeming an invite (a relative path; checked by lib/safeNext)
//   surfaces      what the feature guards, in words (documentation for the admin card; the guards themselves are in code, see lib/nba/gate.js)
//   earlyTag      the quiet line a holder sees on the feature's pages
//
// WHAT EARLY ACCESS IS NOT: it never opens admin tools, and it NEVER loosens posting. Nothing is posted, pushed, sent to X, Discord or #members for a
// holder: those paths ask the PUBLIC switch only (lib/openSwitch.js mayPost), which no grant can turn on. scripts/check-buckets-no-leak.mjs holds that.
// Pure: no I/O. Server and client safe (the client only ever reads label / earlyTag through the access route, never the list of holders).
import { bucketsOpen } from './openSwitch.js'

export const FEATURES = Object.freeze([
  Object.freeze({
    key: 'buckets',
    label: 'BUCKETS (NBA)',
    publicSwitch: () => bucketsOpen(),
    landing: '/app#sport=nba',
    sport: 'nba',
    surfaces: 'the BUCKETS product in the app, every /api/buckets route, and the NBA views of the shared record APIs',
    earlyTag: 'EARLY ACCESS · preview: records show as tracking until 30 graded nights',
  }),
  // A future feature is one more line, e.g.
  // Object.freeze({ key: 'binder_beta', label: 'Binder (beta)', publicSwitch: () => false, landing: '/binder', surfaces: '/binder', earlyTag: 'EARLY ACCESS' }),
])

export const FEATURE_KEYS = Object.freeze(FEATURES.map((f) => f.key))
export const featureByKey = (key) => FEATURES.find((f) => f.key === String(key)) || null
export const isFeatureKey = (key) => FEATURE_KEYS.includes(String(key))
/** True when the feature is public for everyone (its switch is on). An unknown key is never public. */
export const featureIsPublic = (key) => { const f = featureByKey(key); return Boolean(f && f.publicSwitch()) }
/** The feature whose product is this sport key (BUCKETS for 'nba'), or null. */
export const featureOfSport = (sport) => FEATURES.find((f) => f.sport && f.sport === String(sport)) || null
