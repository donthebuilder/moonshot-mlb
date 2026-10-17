// THE NHL ADAPTER for the shared player model (components/player/index.js has the interface). LAMP's words for
// the verdict (the word and score are the goal board's own, from lib/nhl/goalModel.js scoreNight: nothing is
// re-derived here) and its one-row stat strip. Pure: the page hands in what it already holds.
import { fmtSec, fmtPct3, fmt2 } from '../../lib/nhl/format'
import { rankInPool } from '../../lib/mlb/slateRank'
import { SIGNALS } from '../../lib/nhl/goalSignals'

const clean = (v) => (v == null || v === '' ? null : v)

/** The props for <VerdictBlock sport="nhl" />. `w` is goalWhy(row, board); `whyLine` is the board row's own sentence. */
export function nhlVerdict({ goalie, board, spot, row, w, whyLine, extraSignals = [], recordLine = null }) {
  if (goalie) return { offSlate: 'Goalies are not on the goal board.' }
  if (!board) return { offSlate: 'Reading tonight’s board…' }
  if (!spot) {
    return {
      offSlate: 'No game tonight, so he is not on the goal board.',
      offSlateHelp: 'The goal board ranks the skaters in tonight’s games. A club with no game has no board, so there is no LAMP word and no score for him until it plays.',
    }
  }
  const g = spot.g
  const chips = []
  if (row) {
    chips.push({ t: g.graded ? 'GRADED' : g.locked ? 'LOCKED' : 'PREVIEW' })
    if (clean(row.nightRank) != null && clean(row.nightOf) != null) chips.push({ t: `#${row.nightRank} of ${row.nightOf} tonight` })
  }
  return {
    status: row ? row.status : 'off',
    score: row?.score ?? null,
    scoreLabel: 'GOAL',
    why: [w?.why, whyLine].filter(Boolean),
    watch: w?.watch || null,
    explain: w?.explain || null,
    signals: [...chips, ...extraSignals],
    recordLine,
    help: 'The word and the score are LAMP’s goal board for tonight. The score is a 0-100 rank among tonight’s skaters, not a probability.',
  }
}

/** The one-row stat strip: a skater's per-game rates (ranked against tonight's board only when 30+ skaters are on it) and his recent goals; a goalie's record. */
export function nhlStatRow({ goalie, fr, board, row, l10, l10n = null, drought, seasonLabel, stale }) {
  if (!fr) return []
  const sz = `${seasonLabel || ''} regular season${stale ? ' (last season)' : ''}`
  if (goalie) {
    return [
      { id: 'gp', label: 'GP', text: Number.isFinite(fr.gp) ? String(fr.gp) : null, title: `Games played, ${sz}.` },
      { id: 'w', label: 'W', text: Number.isFinite(fr.w) ? String(fr.w) : null, title: `Wins, ${sz}.` },
      { id: 'sv', label: 'SV%', text: fr.svPct == null ? null : fmtPct3(fr.svPct), title: `Save percentage, ${sz}.` },
      { id: 'gaa', label: 'GAA', text: fr.gaa == null ? null : fmt2(fr.gaa), title: `Goals against average, ${sz}.` },
      { id: 'so', label: 'SO', text: Number.isFinite(fr.so) ? String(fr.so) : null, title: `Shutouts, ${sz}.` },
    ].filter((s) => s.text != null)
  }
  const pool = (board?.games || []).flatMap((g) => g.rows || [])
  const legRank = (key, v) => (row?.legs && Number.isFinite(Number(v)) ? rankInPool(pool.map((x) => x?.legs?.[key]), v, { better: 'high' }) : null)
  const gpg = row?.legs?.goalsPg ?? (fr.gp > 0 && Number.isFinite(fr.g) ? fr.g / fr.gp : null)
  const spg = row?.legs?.shotsPg ?? (fr.gp > 0 && Number.isFinite(fr.shots) ? fr.shots / fr.gp : null)
  const toi = row?.legs?.toi ?? (Number.isFinite(fr.toi) && fr.toi > 0 ? fr.toi : null)
  const items = [
    { id: 'gpg', label: 'G/GP', text: gpg == null ? null : Number(gpg).toFixed(2), title: `Goals a game, ${sz}.`, rank: legRank('goalsPg', gpg) },
    { id: 'spg', label: 'S/GP', text: spg == null ? null : Number(spg).toFixed(1), title: `Shots on goal a game, ${sz}.`, rank: legRank('shotsPg', spg) },
    { id: 'toi', label: 'TOI', text: toi == null ? null : fmtSec(toi), title: `Average time on ice, ${sz}.`, rank: legRank('toi', toi) },
    { id: 'shp', label: 'S%', text: Number.isFinite(fr.shPct) ? (Number(fr.shPct) * 100).toFixed(1) : null, title: `Shooting percentage, ${sz}.`, rank: null },
    { id: 'l10', label: 'L10 G', text: l10 == null ? null : String(l10), title: l10n != null && l10n < 10 ? `Goals in his last ${l10n} ${l10n === 1 ? 'game' : 'games'} (all he has played this season).` : 'Goals in his last 10 games.', rank: null },
    { id: 'drt', label: 'DRT', text: drought == null ? null : String(drought), title: 'Games since his last goal.', rank: null },
  ]
  return items.filter((s) => s.text != null)
}

// ── the record on him (the card's "Record on him" line and its LAMP ON HIM table) ──
// Read from /api/lamp/record?player= (lamp_goal_log, graded dressed games, the goal board's own calls, counts only).
const g = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

/** 'Record on him: 9 games, 2 called, 1 scored.' -- null when the record has no game of his (or is not there yet). */
export function nhlRecordLine(rec) {
  const P = rec?.player
  if (!P || !P.games) return null
  const c = P.byStatus.called
  return `Record on him: ${g(P.games, 'game')}, ${c.g} called${c.g ? `, ${c.scored} scored` : ''}.`
}

/** The board's own facts as small chips (lib/nhl/goalSignals.js: Shooter / Finisher / Big minutes, top fifth of tonight), plus what the card already holds: a back-to-back, a goal drought, a hot last five. */
export function nhlSignals({ row, drought = null, l5 = null }) {
  const out = []
  if (row) {
    for (const [, label, why, test] of SIGNALS) if (label !== 'Called' && test(row)) out.push({ t: label, explain: `${label}: ${why}.` })
    if (row.context?.b2b) out.push({ t: 'Back-to-back', warn: true, explain: 'His club played last night.' })
  }
  if (Number.isFinite(drought) && drought >= 5) out.push({ t: `${drought} games no goal`, warn: true, explain: `He has gone ${drought} games without a goal.` })
  if (Number.isFinite(l5) && l5 >= 3) out.push({ t: `${l5} goals in L5`, explain: `${l5} goals in his last five games.` })
  return out
}
