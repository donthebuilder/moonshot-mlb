// THE GOAL POSTER -- LAMP's twin of the homer poster (1200 x 675), redrawn 2026-10-12 as a landscape variant of the baseball-card look
// (lib/cards/posterKit.js on lib/cards/cardKit.js): the thin accent frame, the foil strip on a CALLED goal only, the letter-spaced
// status word, the face over a faded club-logo watermark, the slanted display-caps name, the club logo and matchup, the closing status
// banner, and the goal's facts (his Nth this season, period + clock, strength, the score after it, the assists) as a ruled table.
//
// Everything comes off the lamp_goal_feed row (lib/nhl/goalFeed.js rowFrom). Not on the row, so not on the poster: the opposing
// goalie -- the feed does not record who was in net, and a poster never guesses. The accent is LAMP's (lib/sportAccent.js), the status
// words are lib/callStatus.js STATUS_WORD.
//
// TEXT FIT (2026-10-12): every box is measured (lib/cards/fit.js through posterKit): the name steps down and wraps, the facts table
// gives each value the width its label leaves, the banner steps its line down. The kicker, the banner and the plate all read the one
// status. A field the row lacks (or holds as NaN / undefined) is not drawn.
import { STATUS_WORD } from '../callStatus'   // the one set of words
import { SPORT_ACCENT } from '../sportAccent'
import {
  PORTRAIT_W, Poster, Portrait, NameLine, MatchLine, KVTable, kvPlan, Banner, assets, renderPoster, clubOf, faceOf, prettyDay, bodyH, bodyW, vlog, POSTER,
} from '../cards/posterKit'
import { nhlMug } from './format'
import { nhlNickname } from './teams'
import { strengthWord, periodWord } from './goalFeed'

const ACCENT = SPORT_ACCENT.nhl
const txt = (v) => { const t = String(v ?? '').trim(); return t && t !== 'undefined' && t !== 'null' && t !== 'NaN' ? t : '' }
const posInt = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null)
const COL_W = bodyW - PORTRAIT_W
const INNER = COL_W - 24 - POSTER.pad            // text stays 48px or more from the poster's right edge

/** The poster for one lamp_goal_feed row. Returns an ImageResponse (PNG body). */
export async function goalCard(row, { site = 'dashnetwork.vercel.app' } = {}) {
  const team = txt(row?.team).toUpperCase()
  const [{ grain }, club, face] = await Promise.all([assets(), clubOf('nhl', team), faceOf(nhlMug(row?.season, row?.team, row?.player_id))])
  const status = row?.status || null
  const called = status === 'called'
  const name = txt(row?.name) || 'Unknown'
  const opp = txt(row?.opp).toUpperCase()
  const nth = posInt(row?.season_goals)
  const facts = []
  if (nth) facts.push({ label: 'This season', value: `goal #${nth}`, hot: nth % 10 === 0 })
  const when = `${txt(periodWord(row, { long: true }))}${txt(row?.time_in_period) ? ` · ${txt(row.time_in_period)}` : ''}`
  if (when) facts.push({ label: 'When', value: when, hot: false })
  const strength = txt(strengthWord(row))
  if (strength) facts.push({ label: 'Strength', value: strength, hot: /PP|SH/.test(strength) })
  if (txt(row?.score_after)) facts.push({ label: 'Score after', value: txt(row.score_after), hot: false })
  const assists = (Array.isArray(row?.assists) ? row.assists : []).map((a) => txt(a?.name)).filter(Boolean)
  facts.push({ label: 'Assists', value: assists.length ? assists.join(', ') : 'unassisted', hot: false })

  const m = { ...club, name, face, tone: null }
  const rk = posInt(row?.rank_in_game)
  const rank = rk ? [`#${rk} IN HIS GAME`, `#${rk} IN GAME`] : ''
  const score = row?.lamp_score != null && Number.isFinite(Number(row.lamp_score)) ? Math.round(Number(row.lamp_score)) : null
  // the call line, from the one set of words (STATUS_WORD) and the feed's own facts; a game that never had a board says so
  const line = called ? [`${STATUS_WORD.called} · the top skater on his team on the LAMP board`, `${STATUS_WORD.called} · top skater on the LAMP board`, STATUS_WORD.called]
    : status === 'board' ? [`${STATUS_WORD.board}${rk ? ` · #${rk} in his game` : ''}`, STATUS_WORD.board]
      : status === 'off' ? STATUS_WORD.off : 'No LAMP board for this game'
  const NAME_H = 84; const BANNER_H = 60; const GAP = 8
  const table = kvPlan(facts, INNER, { pad: 2 })
  vlog('goal-column', 14 + 14 + NAME_H + 48 + BANNER_H + table.h + 3 * GAP, bodyH())
  const el = (
    <Poster accent={ACCENT} grain={grain} called={called} word={STATUS_WORD[status] || 'GOAL'} chips={nth ? [`GOAL #${nth}`] : []} right={['GOAL · TONIGHT', 'GOAL']} brand="LAMP" footRight={[`${prettyDay(txt(row?.day))} · every goal, graded in public`, prettyDay(txt(row?.day))]}>
      <Portrait m={m} w={PORTRAIT_W} h={bodyH()} accent={ACCENT} tag={score != null ? '' : rank} plate={score != null ? { word: ['LAMP SCORE', 'SCORE'], value: String(score), caption: rank } : null} />
      <div style={{ display: 'flex', flexDirection: 'column', width: COL_W, padding: `14px ${POSTER.pad}px 14px 24px`, gap: GAP }}>
        <NameLine name={name} size={96} maxW={INNER} h={NAME_H} />
        <MatchLine m={m} text={[team, opp ? `vs ${nhlNickname(opp)}` : ''].filter(Boolean).join(' ')} maxW={INNER} />
        <Banner accent={ACCENT} called={called} line={line} h={BANNER_H} w={INNER} />
        <KVTable title="THE GOAL" plan={table} accent={ACCENT} />
      </div>
    </Poster>
  )
  return renderPoster(el, { poster: 'goal' })
}
