// BUCKETS' LIVE BOX (2026-10-30): the words for the night's one message in the room (lib/dash/liveBox.js does the posting). Pure.
// A 30-point game and a CALLED double-double / triple-double are lines in it; the status word is the board's own (lib/callStatus STATUS_WORD).
import { BRAND } from '../routes'
import { STATUS_WORD } from '../callStatus'
import { KIND, DD_KIND, TD_KIND } from './moments'

export const NBA_BOX = Object.freeze({
  title: `${BRAND.nba.icon} ${BRAND.nba.name} · live tonight`,
  sections: Object.freeze([{ name: '30+ points', noun: 'at 30+' }, { name: 'Doubles', noun: 'with a double-double or better' }]),
})

const etClock = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })

/** One buckets_feed row (momentRows / ddtdRows) as a box line. `now` = when the moment was seen, the time on the line. */
export function nbaBoxEvent(r, now = Date.now()) {
  const who = `**${r.name}**${r.team ? ` (${r.team})` : ''}`
  const word = r.status ? STATUS_WORD[r.status] || '' : ''
  const tail = [r.kind === KIND ? `${r.points} pts` : r.kind === TD_KIND ? 'triple-double' : r.kind === DD_KIND ? 'double-double' : '', word].filter(Boolean).join(' · ')
  return {
    key: `${r.game_id}|${r.player_id}|${r.kind}`, at: now, section: r.kind === KIND ? '30+ points' : 'Doubles',
    line: `${etClock(now)} · ${who}${tail ? ` · ${tail}` : ''}`,
  }
}
