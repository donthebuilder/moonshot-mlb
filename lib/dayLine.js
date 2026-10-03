// THE DAY, IN ONE LINE (2026-09-28, DAY-AWARE-OPENERS-PLAN). Donovan, on
// TUDDY's "Good morning. Football is on the board. / 6 POINTS ONE TUDDY":
// "these on each page should know the day and what games are on." MOONSHOT's
// "15 games tonight. Grading as they land." is the model: THE DAY + WHAT'S ON
// + STATE, from the schedule the page already loaded. Never a greeting, never
// a fixed slogan. Pure -- every product's hero and PageHeader's today line
// read it.
//
// games: [{ away, home, start (ms | ISO), state: 'pre' | 'live' | 'final' | 'postponed' }]
// opts:  { sport, date (YYYY-MM-DD, the page's own date), now (ms),
//          label (e.g. 'Week 4', 'Wild Card'), next ({ date, games: [...] } | null),
//          tz (IANA zone; default the viewer's) }
// ->     { eyebrow, lead, accent, line, count: { label, value, ms? } }

const NOUN = { mlb: ['game', 'games'], nfl: ['game', 'games'], nhl: ['game', 'games'], nba: ['game', 'games'] }
const SPORT_WORD = { mlb: 'baseball', nfl: 'football', nhl: 'hockey', nba: 'basketball' }
const START_WORD = { mlb: 'first pitch', nfl: 'kickoff', nhl: 'puck drop', nba: 'tip-off' }

const ms = (v) => (typeof v === 'number' ? v : Date.parse(v || ''))
const dayOf = (iso) => new Date(`${iso}T12:00:00Z`)
export const weekdayOf = (iso) => dayOf(iso).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
const shortDay = (iso) => dayOf(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

export function clock(t, tz) {
  if (!Number.isFinite(t)) return ''
  const o = { hour: 'numeric', minute: '2-digit', ...(tz ? { timeZone: tz } : {}) }
  return new Date(t).toLocaleTimeString('en-US', o)
}
export function zoneName(t, tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short', ...(tz ? { timeZone: tz } : {}) }).formatToParts(new Date(Number.isFinite(t) ? t : Date.now()))
    return parts.find((p) => p.type === 'timeZoneName')?.value || ''
  } catch { return '' }
}
const plural = (n, sport) => (n === 1 ? NOUN[sport]?.[0] || 'game' : NOUN[sport]?.[1] || 'games')
const matchup = (g) => [g?.away, g?.home].filter(Boolean).join(' at ')

/** The count by state. */
export function tally(games) {
  // 'started': the start time has passed but the feed says no more (MOONSHOT's
  // grouped slate carries times, not states) -- said as "under way or final",
  // never guessed as one or the other.
  const t = { total: 0, live: 0, final: 0, pre: 0, postponed: 0, started: 0 }
  for (const g of games || []) {
    t.total++
    const s = g?.state
    if (s === 'live') t.live++
    else if (s === 'final') t.final++
    else if (s === 'postponed') t.postponed++
    else if (s === 'started') t.started++
    else t.pre++
  }
  return t
}

export function dayLine(games = [], { sport = 'mlb', date, now = Date.now(), label = '', next = null, tz = null } = {}) {
  const t = tally(games)
  const day = date ? weekdayOf(date) : ''
  const eyebrow = [day.toUpperCase(), label ? String(label).toUpperCase() : ''].filter(Boolean).join(' · ')
  const upcoming = (games || []).filter((g) => g?.state === 'pre' && Number.isFinite(ms(g?.start))).sort((a, b) => ms(a.start) - ms(b.start))
  const first = upcoming[0] || null
  const zone = zoneName(first ? ms(first.start) : now, tz)
  const at = (g) => `${clock(ms(g.start), tz)}${zone ? ` ${zone}` : ''}`

  // No games on this date.
  if (!t.total) {
    // `next` may carry its games, or only its date (LAMP's scores feed says
    // when the next night is, not what is on it): then just the day.
    const nx = next?.games?.length ? next : null
    const nxDateOnly = !nx && next?.date ? next.date : null
    const nxFirst = nx ? [...nx.games].sort((a, b) => ms(a.start) - ms(b.start))[0] : null
    const nextBit = nx
      ? nx.games.length === 1 && nxFirst
        ? `${weekdayOf(nx.date)}: ${matchup(nxFirst)}, ${clock(ms(nxFirst.start), tz)}${zoneName(ms(nxFirst.start), tz) ? ` ${zoneName(ms(nxFirst.start), tz)}` : ''}`
        : `${weekdayOf(nx.date)}, ${nx.games.length} ${plural(nx.games.length, sport)}`
      : ''
    return {
      eyebrow,
      lead: `No ${SPORT_WORD[sport] || 'games'} today.`,
      accent: nextBit ? `Next: ${nextBit}.` : nxDateOnly ? `Next: ${weekdayOf(nxDateOnly)}.` : '',
      line: nx || nxDateOnly ? `next ${START_WORD[sport] || 'start'} ${shortDay(nx ? nx.date : nxDateOnly)}` : 'nothing on the schedule yet',
      count: nxFirst ? { label: `NEXT ${String(START_WORD[sport] || 'start').toUpperCase()}`, value: null, ms: ms(nxFirst.start) - now } : { label: 'GAMES', value: 0 },
    }
  }

  // One game.
  if (t.total === 1) {
    const g = games[0]
    const state = g.state === 'live' ? 'Live now.' : g.state === 'final' ? 'Final.' : g.state === 'postponed' ? 'Postponed.' : ''
    return {
      eyebrow,
      lead: `${matchup(g)}${g.state === 'pre' && Number.isFinite(ms(g.start)) ? `, ${at(g)}` : ''}.`,
      accent: state,
      line: g.state === 'pre' ? `1 ${plural(1, sport)} today` : g.state === 'live' ? 'grading live' : 'final',
      count: g.state === 'pre' && Number.isFinite(ms(g.start)) ? { label: String(START_WORD[sport] || 'start').toUpperCase(), value: null, ms: ms(g.start) - now } : { label: 'GAMES', value: 1 },
    }
  }

  // Several: "13 games: 4 live, 6 final, 3 at 4:25 PM ET."
  const bits = []
  if (t.live) bits.push(`${t.live} live`)
  if (t.final) bits.push(`${t.final} final`)
  if (t.started) bits.push(`${t.started} under way or final`)
  if (t.pre) bits.push(first ? `${t.pre} still to start${t.pre > 1 ? `, next at ${at(first)}` : ` at ${at(first)}`}` : `${t.pre} still to start`)
  if (t.postponed) bits.push(`${t.postponed} postponed`)
  const allFinal = t.final + t.postponed === t.total
  return {
    eyebrow,
    lead: `${t.total} ${plural(t.total, sport)}${t.live || t.final || t.started ? `: ${bits.join(', ')}` : first ? `, ${/^first /.test(START_WORD[sport] || '') ? START_WORD[sport] : `first ${START_WORD[sport] || 'start'}`} ${at(first)}` : ''}.`,
    accent: allFinal ? 'Every one final.' : t.live ? 'Grading as they land.' : '',
    line: allFinal ? 'final' : t.live ? 'grading live' : `${t.total} ${plural(t.total, sport)} today`,
    count: first ? { label: `NEXT ${String(START_WORD[sport] || 'start').toUpperCase()}`, value: null, ms: ms(first.start) - now } : { label: 'GAMES', value: t.total },
  }
}

/** The small line under every page title: "MON SEP 28 · 1 game (KC at BAL 8:15 PM EDT)". */
export function todayLine(games = [], { sport = 'mlb', date, now = Date.now(), next = null, tz = null } = {}) {
  const head = date ? shortDay(date).toUpperCase() : ''
  const t = tally(games)
  if (!t.total) {
    const nx = next?.games?.length || next?.date ? next : null
    return [head, nx ? `no games · next ${weekdayOf(nx.date)}` : 'no games'].filter(Boolean).join(' · ')
  }
  if (t.total === 1) {
    const g = games[0]
    const s = ms(g.start)
    return [head, `1 ${plural(1, sport)} (${matchup(g)}${g.state === 'pre' && Number.isFinite(s) ? ` ${clock(s, tz)} ${zoneName(s, tz)}`.trimEnd() : g.state === 'live' ? ', live' : g.state === 'final' ? ', final' : ''})`].filter(Boolean).join(' · ')
  }
  const d = dayLine(games, { sport, date, now, tz })
  return [head, d.lead.replace(/\.$/, '')].filter(Boolean).join(' · ')
}
