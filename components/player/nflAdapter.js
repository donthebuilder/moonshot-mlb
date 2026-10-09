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
export function nflVerdict({ player, market, spec, score, statusWord, whyLines, watch, whyExplain }) {
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
    return { id: k, label, text: String(statFmt(k, v)), title: `${statLabel(k)}, per game this season.`, rank }
  })
  if (rate && rate.bar != null) {
    const bit = (id, label, pr, tip) => (pr[1] > 0 ? { id, label, text: `${pr[0]}/${pr[1]}`, title: tip } : null)
    const word = rate.key === 'TD' ? 'a TD' : `${rate.bar}+`
    out.push(bit('l10', 'L10', rate.l10, `${rate.label}: ${word} in ${rate.l10[0]} of his last ${rate.l10[1]} games.`))
    out.push(bit('szn', String(rate.seasonYear || 'SEASON'), rate.season, `${rate.label}: ${word} in ${rate.season[0]} of his ${rate.season[1]} games this season.`))
  }
  return out.filter(Boolean).slice(0, 6)
}
