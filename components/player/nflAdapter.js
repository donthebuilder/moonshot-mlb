'use client'
// THE NFL ADAPTER for the shared player model (components/player/index.js has the interface). TUDDY's words for
// the verdict and its one-row stat strip. Pure: the card hands in what it already holds.
//   STATUS  only the TD market carries a status word (lib/callStatus tdCallStatus, through lib/nfl/tdStatus):
//           on any other market he gets the score and the why, no word, rather than a word about a market that
//           has none.
//   RANKS   a per-game number is ranked only against the SAME POSITION on this week's slate (a QB's carries
//           against every back would say nothing) and only through rankInPool: top or bottom 10% of 30+.
import { MARKETS, MARKET_SHORT, gradeFor } from '../../lib/nfl/theme'
import { statLabel, statFmt } from '../../lib/nfl/statLabels'
import { rankInPool } from '../../lib/mlb/slateRank'
import { STATUS_WORD } from '../../lib/callStatus'
import { useLiveFetch } from '../../lib/useLiveFetch'
import { fmtOdds } from '../../lib/nfl/oddsMatch'

// The per-game numbers that describe his job, in order; position decides which. [stat key, short label]. Labels are
// 6 characters at most: at 360px six columns clip anything longer (the full name rides the tap / hover text).
const KEY_BY_POS = {
  QB: [['PAYD', 'PA YD'], ['ATT', 'ATT'], ['RUYD', 'RU YD'], ['TD', 'TD']],
  RB: [['RUYD', 'RU YD'], ['CAR', 'CARR'], ['RECYD', 'REC YD'], ['TD', 'TD']],
  WR: [['RECYD', 'REC YD'], ['REC', 'REC'], ['TGT', 'TGT'], ['TD', 'TD']],
  TE: [['RECYD', 'REC YD'], ['REC', 'REC'], ['TGT', 'TGT'], ['TD', 'TD']],
  K: [['FGM', 'FG'], ['PAT', 'XP']],
}

/** The props for <VerdictBlock sport="nfl" />. `statusWord` is tdStatus.statusOf(player) (TD market only). */
export function nflVerdict({ player, market, spec, score, statusWord, whyLines, watch, whyExplain, two = null }) {
  if (!Number.isFinite(score)) {
    return {
      offSlate: 'Not rated this week.',
      offSlateHelp: `He has no ${spec?.label || market} score this week, so TUDDY has no word and no number for him in this market. His numbers below are real; nothing is guessed in their place.`,
    }
  }
  // his other markets, best score first, as small chips (the model's own numbers, colour left to the chip row)
  const others = MARKETS
    .filter(([k]) => k !== market && Number.isFinite(player?.scores?.[k]))
    .sort(([a], [b]) => player.scores[b] - player.scores[a])
    // the TD market's chip carries the TD word when he is not on the market on screen (the word is the TD board's, from lib/callStatus)
    .map(([k, label]) => ({ t: `${MARKET_SHORT[k] || label} ${Math.round(player.scores[k])}${k === 'TD' && statusWord ? ` · ${STATUS_WORD[statusWord]}` : ''}` }))
  const chips = [...others]
  // CAN SCORE TWO (lib/nfl/twoScore.js, td2_site_v1): a tag on our own ranking; the inputs behind it on a tap
  if (two?.can_two) chips.push({ t: '2+ TD · can score two', explain: `In the top third of our 2+ TD ranking (#${two.two_rank} of ${two.two_of}): ${(two.two?.parts || []).map((x) => `${x.label} ${Math.round(x.pct)}`).join(' · ')}. Two-score ranking: a new model, not part of the TD score. A ranking, not a forecast.` })
  if (player?.low_sample) chips.push({ t: 'Low sample', warn: true })
  return {
    status: market === 'TD' ? statusWord : null,
    score,
    scoreLabel: MARKET_SHORT[market] || spec?.label || market,
    why: whyLines,
    watch,
    explain: { label: `Why ${player.name}?`, text: whyExplain },
    signals: chips,
    help: `${gradeFor(score).label} on the ${spec?.label || market} board. The score is a ranking among this week’s players, not a probability.`,
  }
}

/** The one-row stat strip: his per-game numbers (ranked within his position), then how often he reached the card's bar over his last 10 and this season. */
export function nflStatRow({ player, slate, rate }) {
  const st = player?.stats || {}
  const pos = player?.position
  const pool = (slate?.players || []).filter((p) => p.position === pos && !p.roster_only)
  const picks = (KEY_BY_POS[pos] || []).filter(([k]) => Number.isFinite(Number(st[k])))
  const out = picks.map(([k, label]) => {
    const v = Number(st[k])
    const rank = rankInPool(pool.map((p) => p?.stats?.[k]), v, { better: 'high' })
    return { id: k, label, text: String(statFmt(k, v)), title: `${statLabel(k)}, per game${player?.carryover ? ' (last season\u2019s baseline: too few games this season)' : ' this season'}.`, rank }
  })
  if (rate && rate.bar != null) {
    const bit = (id, label, pr, tip) => (pr[1] > 0 ? { id, label, text: `${pr[0]}/${pr[1]}`, title: tip } : null)
    const word = rate.key === 'TD' ? 'a TD' : `${rate.bar}+`
    // the last ten INSIDE this season (components/nfl/NflPlayerModal.js ratesFor): fewer than ten games says so, "L4" not "L10"
    out.push(bit('l10', rate.l10[1] < 10 ? `L${rate.l10[1]}` : 'L10', rate.l10, `${rate.label}: ${word} in ${rate.l10[0]} of his last ${rate.l10[1]} games${rate.seasonYear ? ` of ${rate.seasonYear}` : ''}.`))
    out.push(bit('szn', String(rate.seasonYear || 'SEASON'), rate.season, `${rate.label}: ${word} in ${rate.season[0]} of his ${rate.season[1]} games this season.`))
  }
  return out.filter(Boolean).slice(0, 6)
}

// ── TUDDY ON HIM, THE RECORD (2026-10-17, player-portal mirror pass) ─────────────────────────────────────────────
// MOONSHOT reads "the bot on him" from /api/mlb/boton. TUDDY's twin is the SAME list /called and the Record page read:
// /api/record/calls?sport=nfl, every graded CALLED touchdown pick of the season (hit / miss / void), one row per call.
// Only graded games are in it (a call counts once its game is final and graded; nothing pregame is rewritten), and
// a void is out of both sides. The model is one version (TD), so no per-version split is drawn.

/** His graded calls (newest first) from the shared list, plus the list's current week. undefined while loading, null when it could not be read. */
export function useNflBot(id) {
  const { data, error } = useLiveFetch(id ? '/api/record/calls?sport=nfl' : null)
  if (!id) return null
  if (!data) return error ? null : undefined
  const mine = (data.calls || []).filter((c) => String(c.player_id) === String(id)).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  return { calls: mine, week: Number(data.meta?.nflWeek) || null }
}

const graded = (bot) => (bot?.calls || []).filter((c) => c.result === 'hit' || c.result === 'miss')

/** 'Record on him: 3 called, 2 cleared.' -- null while loading or when he has no graded call. */
export function nflRecordLine(bot) {
  const g = graded(bot)
  if (!g.length) return null
  return `Record on him: ${g.length} called, ${g.filter((c) => c.result === 'hit').length} cleared.`
}

/** 'Last week: 1 of 1 cleared' -- the week before the current one; null when he had no graded call then. */
export function nflLastLine(bot) {
  const wk = bot?.week
  if (!wk) return null
  const g = graded(bot).filter((c) => Number(c.week) === wk - 1)
  return g.length ? `Last week: ${g.filter((c) => c.result === 'hit').length} of ${g.length} cleared` : null
}

const ROLE_LABEL = { TD: 'Anytime TD' }
const JOB = { TD: 'scores a touchdown' }
const dayOf = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** The role table's rows, one per call role (TUDDY calls the TD market): games, cleared, missed, did the job, his last call, the price at lock. */
export function nflRoleRows(bot) {
  const by = {}
  for (const c of graded(bot)) (by[c.role || 'TD'] ||= []).push(c)
  return Object.entries(by).map(([role, list]) => {
    const hit = list.filter((c) => c.result === 'hit').length
    const last = list[0]
    return {
      _id: role, role: ROLE_LABEL[role] || role, job: JOB[role] || '',
      g: list.length, hit, miss: list.length - hit, did: `${hit}/${list.length}`,
      last: `${last.date ? dayOf(last.date) : `Wk ${last.week ?? '—'}`} · ${last.result === 'hit' ? 'cleared' : 'missed'}`,
      lastOpp: last.opp || '—',
      price: last.best != null ? fmtOdds(last.best) : '—',
    }
  })
}

/** The sample line: 'N graded calls, Sep 14–Oct 12'. */
export function nflSampleLine(bot) {
  const g = graded(bot)
  if (!g.length) return ''
  const days = g.map((c) => c.date).filter(Boolean).sort()
  return `${g.length} graded call${g.length === 1 ? '' : 's'} on the locked record${days.length ? `, ${dayOf(days[0])}–${dayOf(days[days.length - 1])}` : ''}`
}
