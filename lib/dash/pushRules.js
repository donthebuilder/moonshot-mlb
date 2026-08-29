// What counts as an event, and who has asked to hear about it.
//
// Split out of app/api/dash/push/tick so the two decisions that actually
// matter — "is this a thing worth waking someone for" and "did this person ask
// for it" — are pure functions over data, testable without a database, a cron
// secret, or a live league feed. The route keeps the I/O and nothing else.
//
// An EVENT is:
//   key        what makes it the same event across cron runs. MUST carry the
//              count: a second homer by the same man tonight is a different
//              event, and `hr:2` says so where `hr` alone would swallow it.
//   category   a key in lib/dash/alerts.js CATEGORIES — the switch the user
//              actually sees.
//   sport      namespaces the follow-list lookup, so an MLB id and an NFL id
//              that happen to look alike can never cross.
//   playerId / playerName
//              how it ties to a followed player. MLB has real ids; the ESPN
//              box score has no gsis id, so football matches on name.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** Home runs in tonight's live lines. */
export function mlbEventsFrom(snap, day) {
  if (!snap?.lines) return []
  const out = []
  for (const [id, line] of Object.entries(snap.lines)) {
    const hr = num(line?.hr)
    if (hr < 1) continue
    out.push({
      key: `mlb:${day}:${id}:hr:${hr}`,
      category: 'homer',
      sport: 'mlb',
      playerId: String(id),
      title: '💥 DASH · Moonshot',
      body: `${line?.name || 'Your guy'} goes yard${hr > 1 ? ` — that's ${hr}` : ''}`,
      url: '/app#sport=mlb&tab=home',
    })
  }
  return out
}

/** Touchdowns in the live box scores. */
export function nflEventsFrom(snap, day) {
  if (!snap?.lines?.size) return []
  const out = []
  for (const line of snap.lines.values()) {
    const tds = num(line?.receiving_tds) + num(line?.rushing_tds)
    if (tds < 1) continue
    out.push({
      key: `nfl:${day}:${line.name}:td:${tds}`,
      category: 'nfltd',
      sport: 'nfl',
      playerName: line.name,
      title: '🏈 DASH · Tuddy',
      body: `${line.name} SCORES${tds > 1 ? ` — that's ${tds}` : ''}`,
      url: '/app#sport=nfl&tab=watchlist',
    })
  }
  return out
}

// Only the two categories the sender can actually produce. A category the
// user has never touched falls back to its default here — anything not in
// this map is off, which is the safe direction for a message that arrives
// with no tab open.
const DEFAULTS = { homer: true, nfltd: true }

/**
 * Did this person ask for this event?
 *
 * Two independent gates, both required: the CATEGORY has to be on in their
 * alert settings, and the PLAYER has to be on their follow list. No follows
 * means no push, ever — there is deliberately no "everyone gets the big ones"
 * path, because a message that arrives on a locked phone should only ever be
 * about something the person named themselves.
 */
export function wants(state, event) {
  const prefs = state?.dash_alerts_v1?.events
  const on = prefs && typeof prefs === 'object' && event.category in prefs
    ? prefs[event.category]
    : DEFAULTS[event.category]
  if (!on) return false

  const follows = state?.dash_follow_v1
  if (!follows || typeof follows !== 'object') return false

  for (const [key, row] of Object.entries(follows)) {
    if (!row || row.removed) continue          // a tombstone is not a follow
    if (!key.startsWith(`${event.sport}:`)) continue
    if (event.playerId && String(row.id) === event.playerId) return true
    if (event.playerName && String(row.name || '').toLowerCase() === String(event.playerName).toLowerCase()) return true
  }
  return false
}
