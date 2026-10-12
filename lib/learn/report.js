// ONE SPORT-MARKET REPORT, THREE OUTPUTS (2026-10-12, accuracy loop). Pure.
//   buildReport(rows, meta)   the full structure (private)
//   renderMarkdown(report)    the private weekly .md  (.claude-notes/learn/<sport>-<week>.md, gitignored)
//   publicEntry(report)       the small, claim-gated subset the Record page may show (lib/learn/published.json)
// The private report keeps everything (including features that do NOT clear the floors, labelled 'tracking').
// The public entry carries counts, rates with n and ranges, and at most THREE description lines, only for features
// that separate under every test in lib/learn/separators.js. Nothing is a prediction and nothing says what to do.
import { sanitizeRows } from './features'
import { groupRows, countsOf, MIN_GROUP_N, unitsOf } from './groups'
import { analyzeGotAway } from './gotAway'
import { analyzeBoardNoCall } from './boardNoCall'
import { proposeCandidates, shadowDesign } from './candidates'
import { GROUP_WORDS, describeLine, featureLabel, PUBLIC_DENY } from './labels'

const ymd = (r) => r.date

export function buildReport(rawRows, { sport, market, label = market, unitWord = 'night', windowDays = 7, producedWord = 'cleared', reps = 300, candidates = true, liveVersion = null } = {}) {
  const { rows, lateExcluded } = sanitizeRows(rawRows)
  const dates = rows.map(ymd).filter(Boolean).sort()
  const asOf = dates.at(-1) || null
  const units = unitsOf(rows)
  // the window the Record page's counts use: the last `windowDays` of game dates (a week unit: the last unit)
  const recent = unitWord === 'week'
    ? rows.filter((r) => r.unit === units.at(-1))
    : rows.filter((r) => asOf && Date.parse(`${r.date}T12:00:00Z`) > Date.parse(`${asOf}T12:00:00Z`) - windowDays * 864e5)
  const g = groupRows(rows)
  const rep = {
    sport, market, label, unitWord, producedWord, asOf, units: units.length, from: dates[0] || null, lateExcluded,
    rows: { total: rows.length, graded: g.all.length },
    counts: countsOf(rows),
    recent: { from: recent.map(ymd).sort()[0] || null, units: unitsOf(recent).length, counts: countsOf(recent) },
    gotAway: analyzeGotAway(rows, { reps }),
    boardNoCall: analyzeBoardNoCall(rows, { reps }),
    candidates: candidates ? proposeCandidates(rows) : null,
  }
  if (rep.candidates) {
    rep.candidates.shadow = rep.candidates.proposals.filter((p) => p.status === 'ready').map((p) => shadowDesign({ sport, market, liveVersion: liveVersion || `${sport}-${market}-live`, proposal: p }))
  }
  return rep
}

// ── PUBLIC ENTRY ────────────────────────────────────────────────────────────
const SIDES = [
  // c2 first: inside the same score band, so it says something the stored score does not. c1 reads the call rule back, so
  // it is only used where the got-away rows were HIGHER than the called set (a feature the called set does not even lead on).
  { key: 'c2', a: GROUP_WORDS.gotAway, b: GROUP_WORDS.notCalledMiss, lead: 'At the same model score, ', onlyDirection: null },
  { key: 'c1', a: GROUP_WORDS.gotAway, b: GROUP_WORDS.called, lead: '', onlyDirection: 'higher' },
]
export const PUBLIC_MIN_EDGE = 0.05   // |AUC - 0.5| a public line needs (0.55 or 0.45)
const baseName = (f) => String(f).replace(/^(legs|pct|context|components)\./, '')
/** At most `max` description lines, only features that separate. Each carries its n's. */
export function publicLines(rep, max = 3) {
  const out = []
  for (const s of SIDES) {
    for (const f of rep.gotAway?.[s.key]?.features || []) {
      // a flag (0/1) has no median to describe, a drought/streak word reads as "due", and a sliver of separation is not worth a line
      if (f.claim !== 'separates' || f.binary || PUBLIC_DENY.test(f.feature) || Math.abs(f.auc - 0.5) < PUBLIC_MIN_EDGE) continue
      if (s.onlyDirection && f.direction !== s.onlyDirection) continue
      if (f.feature.startsWith('pct.') && (rep.gotAway?.[s.key]?.features || []).some((g) => g.feature === `legs.${f.feature.slice(4)}` && g.claim === 'separates')) continue   // the raw twin says it
      const text = describeLine({ a: s.a, b: s.b, feature: f.feature, direction: f.direction, nA: f.nA, nB: f.nB })
      out.push({ strength: Math.abs(f.auc - 0.5) + (s.key === 'c2' ? 1 : 0), feature: f.feature, text: s.lead ? s.lead + text.charAt(0).toLowerCase() + text.slice(1) : text, nA: f.nA, nB: f.nB })
    }
  }
  out.sort((x, y) => y.strength - x.strength)
  const seen = new Set(), picked = []
  for (const l of out) { const b = baseName(l.feature); if (seen.has(b)) continue; seen.add(b); picked.push({ text: l.text, nA: l.nA, nB: l.nB, feature: l.feature }); if (picked.length >= max) break }
  return picked
}

const rate = (c) => ({ n: c.n, hits: c.hits, rate: c.rate, range: c.range ? [Math.round(c.range[0] * 10) / 10, Math.round(c.range[1] * 10) / 10] : null })

export function publicEntry(rep) {
  const c = rep.recent.counts
  return {
    market: rep.market, label: rep.label,
    window: { from: rep.recent.from, to: rep.asOf, units: rep.recent.units, unit: rep.unitWord },
    gotAway: c.gotAway,                       // { n, onBoard, notOnBoard } over the window
    season: { from: rep.from, units: rep.units, called: rate(rep.counts.called), boardNoCall: rate(rep.counts.board), notOnBoard: rate(rep.counts.off) },
    boardNoCallReadout: rep.boardNoCall.readout,
    floor: MIN_GROUP_N,
    lines: publicLines(rep),
  }
}

// ── PRIVATE MARKDOWN ────────────────────────────────────────────────────────
const f1 = (x) => (x == null ? '—' : (Math.round(x * 100) / 100).toFixed(2))
const pr = (c) => (c.n ? `${c.hits} of ${c.n} (${c.rate}%, 95% ${c.range ? `${c.range[0].toFixed(0)}-${c.range[1].toFixed(0)}` : '—'})` : 'none')

function table(cmp, wordA, wordB, top = 8) {
  const L = [`${wordA} (n=${cmp.nA}) vs ${wordB} (n=${cmp.nB}), ${cmp.units} ${'unit(s)'}; floor ${cmp.floor ? 'met' : 'NOT met'} (30 per group).`]
  if (!cmp.features.length) return L.concat(['(nothing to compare)']).join('\n')
  L.push('', '| feature | dir | AUC (95%) | effect (95%) | medA / medB | halves | claim | actionable? |', '|---|---|---|---|---|---|---|---|')
  for (const f of cmp.features.slice(0, top)) {
    const act = f.claim === 'separates' ? 'candidate input: test walk-forward below' : `no (${f.why})`
    L.push(`| ${featureLabel(f.feature)} (\`${f.feature}\`) | ${f.direction} | ${f1(f.auc)} (${f1(f.aucRange[0])}-${f1(f.aucRange[1])}) | ${f1(f.effect)} (${f.effectRange ? `${f1(f.effectRange[0])}..${f1(f.effectRange[1])}` : '—'}) | ${f1(f.medA)} / ${f1(f.medB)} | ${f.halves.map((h) => (h == null ? 'thin' : f1(h))).join(' / ')} | ${f.claim} | ${act} |`)
  }
  return L.join('\n')
}

export function renderMarkdown(reps, { sport, week, generatedAt }) {
  const L = [`# Accuracy loop: ${sport.toUpperCase()}, ${week}`, '', `PRIVATE. Generated ${generatedAt}. Describes graded history; nothing here is a forecast, and nothing here changes a live model.`, '',
    'Method: pick-time features only (lock stamp before the start; outcome-named keys stripped). Groups: CALLED, ON THE BOARD (no call), NOT ON THE BOARD, and GOT AWAY = produced and not called (split on/off the board). Separation = Mann-Whitney AUC with a seeded bootstrap range, plus a robust effect (median difference over 1.4826 x MAD). A feature "separates" only with n >= 30 per group, a range that excludes no-difference, a pass of the Benjamini-Hochberg check across every feature compared, and the same direction in BOTH halves of the units. Rows in one game/night are not independent, so ranges are somewhat optimistic: read them as descriptions.', '']
  for (const rep of reps) {
    const c = rep.counts
    L.push(`## ${rep.label} (${rep.market})`, '',
      `Rows: ${rep.rows.graded} graded over ${rep.units} ${rep.unitWord}(s), ${rep.from} to ${rep.asOf}. Excluded for a late/missing lock stamp: ${rep.lateExcluded}.`,
      `- CALLED: ${pr(c.called)}`, `- ON THE BOARD, NO CALL: ${pr(c.board)}`, `- NOT ON THE BOARD: ${pr(c.off)}`, `- Everyone graded: ${pr(c.all)}`,
      `- GOT AWAY (produced, not called): ${c.gotAway.n} (${c.gotAway.onBoard} were ON THE BOARD, ${c.gotAway.notOnBoard} NOT ON THE BOARD)`,
      `- Board-no-call vs called: **${rep.boardNoCall.readout}**${rep.boardNoCall.floor ? '' : ' (a group is under 30 rows: tracking)'}`, '',
      `This window (${rep.recent.units} ${rep.unitWord}(s) from ${rep.recent.from}): ${rep.recent.counts.gotAway.n} got away, ${rep.recent.counts.gotAway.onBoard} on the board, ${rep.recent.counts.gotAway.notOnBoard} not on the board.`, '',
      '### Weekly', '', '| week of | graded | got away (board/off) | called hit/n | board-no-call hit/n |', '|---|---|---|---|---|')
    for (const w of rep.gotAway.weekly) L.push(`| ${w.week} | ${w.graded} | ${w.gotAway.n} (${w.gotAway.onBoard}/${w.gotAway.notOnBoard}) | ${w.called.hits}/${w.called.n} | ${w.boardNoCall.hits}/${w.boardNoCall.n} |`)
    L.push('', '### C1. Got away vs the called set', '', table(rep.gotAway.c1, 'got away', 'called'),
      '', '### C2. Got away vs the other players not called (what the model left on the table)', '', table(rep.gotAway.c2, 'got away', 'not called, did not produce'),
      '', '### C3. Called, cleared vs called, did not', '', table(rep.gotAway.c3, 'called + cleared', 'called + missed'),
      '', '### C4. Inside ON THE BOARD, NO CALL: cleared vs did not', '', table(rep.boardNoCall.within, 'board cleared', 'board did not'))
    if (rep.candidates) {
      L.push('', '### Model-upgrade queue (walk-forward, held-out units only)', '', `Tried ${rep.candidates.tried} features over ${rep.candidates.units} ${rep.unitWord}(s). Needs >= 14 held-out units, mean AUC lift >= 0.005, Bonferroni p < 0.05, positive in both halves, same weight sign in >= 80% of folds.`, '',
        '| feature | proposal | held-out units | mean AUC lift (95%) | Bonferroni p | halves | top-K lift | status |', '|---|---|---|---|---|---|---|---|')
      for (const p of rep.candidates.proposals.slice(0, 8)) L.push(`| ${featureLabel(p.feature)} (\`${p.feature}\`) | weight ${p.direction} | ${p.testUnits} | ${f1(p.meanLift)} (${p.liftRange ? `${f1(p.liftRange[0])}..${f1(p.liftRange[1])}` : '—'}) | ${f1(p.pBonferroni)} | ${p.halves.map(f1).join(' / ')} | ${f1(p.topKLift)} | **${p.status}** |`)
      if (rep.candidates.shadow?.length) for (const s of rep.candidates.shadow) L.push('', `**Shadow design: ${s.newVersion}** (${s.rule})`, ...s.how.map((h) => `- ${h}`))
      else L.push('', 'No proposal is ready. Nothing to shadow.')
    }
    L.push('')
  }
  return `${L.join('\n')}\n`
}
