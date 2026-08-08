// 😴 Rest & travel flags (audit #9, 2026-08-08).
//
// One schedule range call covers the whole slate: date-2 → date, every team,
// every game, with dayNight / doubleHeader / gameNumber per game — all three
// fields VERIFIED live on the range endpoint before this file was written
// (2026-08-08). Venue comparison is guarded: the travel flag only fires when
// both games actually carry venue ids, never inferred.
//
// Two-lane rule: these are CONTEXT chips. They never touch a score.

const SCHED = (start, end) =>
  `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${start}&endDate=${end}`

const shift = (dateStr, days) => {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// slateDate 'YYYY-MM-DD' → Map(teamId → [{icon,label,title}])
export async function fetchRestTravel(slateDate) {
  const out = new Map()
  if (!slateDate) return out
  let json
  try {
    const r = await fetch(SCHED(shift(slateDate, -2), slateDate))
    if (!r.ok) return out
    json = await r.json()
  } catch { return out }

  // teamId → date → [{dayNight, doubleHeader, gameNumber, venueId}]
  const byTeam = new Map()
  ;(json?.dates || []).forEach((d) => {
    (d?.games || []).forEach((g) => {
      [g?.teams?.home?.team?.id, g?.teams?.away?.team?.id].forEach((tid) => {
        if (!tid) return
        if (!byTeam.has(tid)) byTeam.set(tid, new Map())
        const m = byTeam.get(tid)
        if (!m.has(d.date)) m.set(d.date, [])
        m.get(d.date).push({
          dayNight: g?.dayNight, doubleHeader: g?.doubleHeader,
          gameNumber: g?.gameNumber, venueId: g?.venue?.id ?? null,
        })
      })
    })
  })

  const d1 = shift(slateDate, -1)
  const d2 = shift(slateDate, -2)
  byTeam.forEach((days, tid) => {
    const today = days.get(slateDate) || []
    if (!today.length) return
    const yest = days.get(d1) || []
    const flags = []

    // day game on the heels of a night game — the classic flat-bat spot
    if (today.some((g) => g.dayNight === 'day') && yest.some((g) => g.dayNight === 'night')) {
      flags.push({ icon: '😴', label: 'day-after-night',
        title: 'Day game today after a night game yesterday — short turnaround, lineups sometimes rest regulars. Context only; no score touched.' })
    }
    // doubleheader today (either game) — 18 innings of bodies
    if (today.length >= 2 || today.some((g) => g.doubleHeader && g.doubleHeader !== 'N')) {
      flags.push({ icon: '2️⃣', label: 'doubleheader',
        title: 'Doubleheader day — two games of at-bats and a taxed pitching staff by the nightcap. Context only.' })
    }
    // third game in three days AND a park change overnight (venue-guarded)
    const played3 = today.length && yest.length && (days.get(d2) || []).length
    const vT = today[0]?.venueId, vY = yest[yest.length - 1]?.venueId
    if (vT != null && vY != null && vT !== vY && yest.some((g) => g.dayNight === 'night')) {
      flags.push({ icon: '✈️', label: 'travel night',
        title: 'Different park than last night\'s game, which ended late — overnight travel into tonight. Venue ids compared directly, not guessed. Context only.' })
    } else if (played3) {
      flags.push({ icon: '🗓', label: '3-in-3',
        title: 'Third straight day with a game. Context only.' })
    }
    if (flags.length) out.set(tid, flags)
  })
  return out
}
