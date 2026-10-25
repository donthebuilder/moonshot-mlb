// 📋 THE CALLED LIST, AS TEXT (2026-10-25, Donovan: "export all the names ... of all the players that are called for each
// game ... do the text first"). One sport's day: every CALLED man, grouped by game in start order, each with the lanes he is
// CALLED in (the 0c rule: CALLED in any public market = CALLED). The statuses come from each board as the site shows them;
// nothing here re-derives a label. Pure: the fetching lives in components/CalledExport.js.

/** entries: [{ gameKey, title, start (ISO|null), name, team, lane }] -> games in start order, each man once with his lanes. */
export function groupCalled(entries) {
  const games = new Map()
  for (const e of entries || []) {
    if (!e?.name) continue
    const g = games.get(e.gameKey) || { title: e.title, start: e.start || null, men: new Map() }
    const k = `${e.name}|${e.team || ''}`
    const m = g.men.get(k) || { name: e.name, team: e.team || '', lanes: [] }
    if (e.lane && !m.lanes.includes(e.lane)) m.lanes.push(e.lane)
    g.men.set(k, m)
    games.set(e.gameKey, g)
  }
  return [...games.values()]
    .sort((a, b) => String(a.start || '~').localeCompare(String(b.start || '~')) || a.title.localeCompare(b.title))
    .map((g) => ({ title: g.title, start: g.start, men: [...g.men.values()] }))
}

const etTime = (iso, weekday) => {
  try { return `${new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', ...(weekday ? { weekday: 'short' } : {}), hour: 'numeric', minute: '2-digit' })} ET` } catch { return '' }
}

/** The text: a head line, then each game and its men. `weekday` adds the day to each game (a week of NFL games). */
export function calledText({ head, games, weekday = false }) {
  if (!games?.length) return ''
  const out = [head]
  for (const g of games) {
    out.push('', `${g.title}${g.start ? ` · ${etTime(g.start, weekday)}` : ''}`)
    for (const m of g.men) out.push(`- ${m.name}${m.team ? ` (${m.team})` : ''}${m.lanes.length ? `: ${m.lanes.join(', ')}` : ''}`)
  }
  return out.join('\n')
}
