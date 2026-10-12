// THE GOAL POSTER -- LAMP's twin of the homer poster (1200 x 675), redrawn 2026-10-12 as a landscape variant of the baseball-card look
// (lib/cards/posterKit.js on lib/cards/cardKit.js): the thin accent frame, the foil strip on a CALLED goal only, the letter-spaced
// status word, the face over a faded club-logo watermark, the slanted display-caps name, the club logo and matchup, the closing status
// banner, and the goal's facts (his Nth this season, period + clock, strength, the score after it, the assists) as a ruled table.
//
// Everything comes off the lamp_goal_feed row (lib/nhl/goalFeed.js rowFrom). Not on the row, so not on the poster: the opposing
// goalie -- the feed does not record who was in net, and a poster never guesses. The accent is LAMP's (lib/sportAccent.js), the status
// words are lib/callStatus.js STATUS_WORD.
import { STATUS_WORD } from '../callStatus'   // the one set of words
import { SPORT_ACCENT } from '../sportAccent'
import {
  Poster, Portrait, NameLine, MatchLine, KVTable, Banner, assets, renderPoster, clubOf, faceOf, prettyDay, bodyH, bodyW,
} from '../cards/posterKit'
import { nhlMug } from './format'
import { nhlNickname } from './teams'
import { strengthWord, periodWord } from './goalFeed'

const ACCENT = SPORT_ACCENT.nhl
const txt = (v) => (v == null ? '' : String(v).trim())
const PORTRAIT_W = 236

/** The poster for one lamp_goal_feed row. Returns an ImageResponse (PNG body). */
export async function goalCard(row, { site = 'dashnetwork.vercel.app' } = {}) {
  const team = txt(row?.team).toUpperCase()
  const [{ grain }, club, face] = await Promise.all([assets(), clubOf('nhl', team), faceOf(nhlMug(row?.season, row?.team, row?.player_id))])
  const status = row?.status || null
  const called = status === 'called'
  const name = txt(row?.name) || 'Unknown'
  const opp = txt(row?.opp).toUpperCase()
  const nth = Number(row?.season_goals) > 0 ? Number(row.season_goals) : null
  const facts = []
  if (nth) facts.push({ label: 'This season', value: `goal #${nth}`, hot: nth % 10 === 0 })
  facts.push({ label: 'When', value: `${periodWord(row, { long: true })}${row?.time_in_period ? ` · ${row.time_in_period}` : ''}`, hot: false })
  facts.push({ label: 'Strength', value: strengthWord(row), hot: /PP|SH/.test(strengthWord(row)) })
  if (row?.score_after) facts.push({ label: 'Score after', value: String(row.score_after), hot: false })
  const assists = (Array.isArray(row?.assists) ? row.assists : []).map((a) => txt(a?.name)).filter(Boolean)
  facts.push({ label: 'Assists', value: assists.length ? assists.join(', ') : 'unassisted', hot: false })

  const m = { ...club, name, face, tone: null }
  const colW = bodyW - PORTRAIT_W
  const rank = row?.rank_in_game ? `#${row.rank_in_game} IN HIS GAME` : ''
  // the call line, in the feed's own words (goalFeed.labelLine); a game that never had a board says so
  const line = called ? 'CALLED · the top skater on his team on the LAMP board'
    : status === 'board' ? `On the LAMP board${row?.rank_in_game ? ` · #${row.rank_in_game} in his game` : ''}`
      : status === 'off' ? "Not on tonight's LAMP board" : 'No LAMP board for this game'
  const el = (
    <Poster accent={ACCENT} grain={grain} called={called} word={STATUS_WORD[status] || 'GOAL'} chips={nth ? [`GOAL #${nth}`] : []} right="GOAL · TONIGHT" brand="LAMP" footRight={`${prettyDay(txt(row?.day))} · every goal, graded in public`}>
      <Portrait m={m} w={PORTRAIT_W} h={bodyH()} accent={ACCENT} tag={row?.lamp_score != null ? '' : rank} plate={row?.lamp_score != null ? { word: 'LAMP SCORE', value: String(row.lamp_score), caption: rank } : null} />
      <div style={{ display: 'flex', flexDirection: 'column', width: colW, padding: '14px 24px 14px 24px', gap: 8 }}>
        <NameLine name={name} size={96} maxW={colW - 70} h={84} />
        <MatchLine m={m} text={[team, opp ? `vs ${nhlNickname(opp)}` : ''].filter(Boolean).join(' ')} />
        <Banner accent={ACCENT} called={called} line={line} h={60} maxW={colW - 140} />
        <KVTable title="THE GOAL" rows={facts} accent={ACCENT} />
      </div>
    </Poster>
  )
  return renderPoster(el, { poster: 'goal' })
}
