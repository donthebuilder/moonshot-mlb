// THE PLAYER MODEL, SHARED (2026-10-08, Donovan: one player model for all four sports; MLB first).
//
// Top to bottom on a phone: VERDICT (VerdictBlock), the one-row STAT STRIP (StatRow), the pills, then the
// EVIDENCE: a props heat grid (heat.js: glow at 60%+, a flame on a streak of 3+), its long captions folded
// to one line each plus a (?) (Brief), and its situation pills folded behind ONE Filters button (FiltersSheet).
// Wide tables scroll inside their own box with a sticky first column and a visible hint (ScrollHint).
//
// THE ADAPTER INTERFACE. A sport hands these components words, an accent and already-derived data; none of
// them reads a sport's rows, so MLB's adapter (components/player/mlbAdapter.js) is the only MLB-specific file.
// NFL / NHL / NBA adopted the model (2026-10-09) through their own adapters with the same shapes
// (nflAdapter.js, nhlAdapter.js, nbaAdapter.js); <VerdictBlock sport="nfl"|"nhl"|"nba"> only changes the product name
// in the heading (BRAND in lib/routes.js), <StatRow noun="..."> the word in the rank tip:
//
//   theme / accent     read from <SportTheme> (components/SportTheme.js): { C, NUM_FONT, accent }. Never typed.
//   VerdictBlock       { status: 'called'|'board'|'off'|null   -- from the sport's call-status module, never
//                                                                 re-derived (lib/callStatus.js, lib/nhl/goalModel.js scoreNight)
//                        score: number|null, scoreLabel: 'TOP'|'HR'|...    the market the score is for
//                        why: string[], watch: string|null, explain: {label,text}|null   (components/WhyLines.js)
//                        signals: [{ t, warn? }]               small chips (flags the model asserts)
//                        offSlate: string|null                  ONE short line when he is not on tonight's slate
//                        offSlateHelp: string|null              the rest of the caveat, behind a (?)
//                        recordLine: string|null                his clean pregame record, one line
//                        lastLine: string|null                  'Last week: 5 of 5 cleared' (omitted when nothing to say)
//                        help: string|null }                    the long sentence behind a (?) on the status
//   StatRow            { stats: [{ id, label, text, title, rank?: { rank, of, side: 'top'|'bottom' } }] }
//                      ranks come from rankInPool (lib/mlb/slateRank.js): only top/bottom 10% of a pool of 30+,
//                      from rows the site already holds. Never invented; omitted when the pool is thin.
//   FiltersSheet       { groups: [{ key, label, value, defaultValue, onChange, options: [{ value, label, title?, n? (a count shown beside the label in the sheet) }], hint? }],
//                        note?: string }   the active non-default options show as small removable chips.
//   heatCell / flame   heatCell(pct, n, { accent, C }) -> style; STREAK_AT = 3, GLOW_AT = 60.
//   Brief              { text, help, label }  one short line + a tap-friendly (?) holding the rest.
//   ScrollHint         wraps a wide table: a right-edge fade and a 'swipe' hint while it overflows.
export { default as VerdictBlock } from './VerdictBlock'
export { default as StatRow } from './StatRow'
export { default as FiltersSheet } from './FiltersSheet'
export { default as Brief } from './Brief'
export { default as ScrollHint } from './ScrollHint'
export { default as PropsMatrix, HeatCells, StreakTd, MatrixEmpty } from './PropsMatrix'
export { heatCell, GLOW_AT, STREAK_AT } from './heat'
export { default as CardFlip, cardImageUrl } from './CardFlip'
