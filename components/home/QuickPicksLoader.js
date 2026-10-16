// Fetches the quick picks' data AFTER the front page has started to render (the page wraps this in <Suspense>), so the sign-up form, the hero and the tiles
// never wait on the lock ledger, the NFL week card or the hockey log (2026-10-16 audit: they were awaited in front of the whole page).
// Also the freshness guards: a list is shown only when it is TODAY's. The baseball ledger carries its own date and is compared with the slate's; the football
// board only while the week still has a game to play; hockey rows exist only for locked games of the night.
import QuickPicks from './QuickPicks'
import { mlbTodayCalls, nflWeekBoard, nhlTonightCalls } from '../../lib/phone/todayCalls'
import { isMember } from '../../lib/members/access'

export default async function QuickPicksLoader({ styles, mlbDate, mlbOff, nflLive, nhlDate, recordLine, user }) {
  const [mlbCalls, nflBoard, nhlCalls, member] = await Promise.all([
    mlbOff ? null : mlbTodayCalls(),
    nflLive ? nflWeekBoard() : null,
    nhlTonightCalls(nhlDate),
    isMember(user),
  ])
  // the ledger is dated; yesterday's picks are not "tonight's"
  const mlb = mlbCalls && (!mlbDate || !mlbCalls.date || mlbCalls.date === mlbDate) ? mlbCalls : null
  return <QuickPicks styles={styles} calls={mlb} recordLine={recordLine} signedIn={Boolean(user)} nfl={nflBoard} nhl={nhlCalls} member={member} />
}
