// 🔁 THE 2+ CLUB, WEEKLY (2026-09-27, BATCH-MULTI-PLAN step 4): "who does it
// most" -- the top of each sport's 2+ Club season table (lib/multi/read.js,
// the Ledger's own numbers), each with how many of those games we CALLED.
// Text only, no link on X. Nothing is posted for a season that hasn't
// started (NHL shows last season on the page until the opener; the post
// waits) or with fewer than three names.
//   MLB  'multi_club'      Monday, from 10am ET (homers tick)
//   NFL  'nfl_multi_club'  Tuesday, from noon ET, after the week is final (NFL tick)
//   NHL  'nhl_multi_club'  Monday, from noon ET (LAMP tick)
import { readMulti } from '../multi/read'
import { postOnce } from './longshotsPost'
import { HARD_LIMIT } from './postLimit'

const WORD = { HR: ['HOME RUNS', 'multi-HR'], TD: ['TOUCHDOWNS', 'multi-TD'], G: ['GOALS', 'multi-goal'] }
const MIN = 3

/** The post, or '' when there is nothing honest to say. Pure. */
export function multiClubText(m) {
  if (!m || m.stale) return ''
  const [head, word] = WORD[m.kind] || []
  const top = (m.players || []).slice(0, 5)
  if (!head || top.length < MIN) return ''
  const build = (rows) => [
    `\u{1F501} THE 2+ CLUB · ${head} (${m.seasonLabel})`,
    `Most ${word} games this season:`,
    '',
    ...rows.map((p) => `${p.name} (${p.team}) ${p.multi}${p.recorded ? ` · ${p.called} called` : ''}`),
    '',
    'From the box scores. Full table in the Ledger.',
  ].join('\n')
  for (let n = top.length; n >= MIN; n -= 1) {
    const t = build(top.slice(0, n))
    if ([...t].length + 4 <= HARD_LIMIT) return t
  }
  return ''
}

export function postMultiClubOnce(db, { sport, day, kind }) {
  return postOnce(db, {
    day, kind,
    build: async () => {
      const m = await readMulti(db, sport)
      const text = multiClubText(m)
      return text ? { text, payload: { season: m.season, players: m.players.slice(0, 5).map((p) => ({ id: p.player_id, name: p.name, multi: p.multi, called: p.called })) } } : null
    },
  })
}
