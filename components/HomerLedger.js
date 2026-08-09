'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { dataUrl } from '../lib/dataSource'
import { nameOf, teamOf, n } from '../lib/player'

// 🧾 THE HOMER LEDGER (2026-08-09, Donovan: "somewhere showing what number
// home run people are hitting — like if you notice more people getting their
// 15th, or a certain batting order spot getting more HRs on the day. More of
// something that builds and runs for each slate.")
//
// WHAT THIS ANSWERS: as tonight's homers land, which ones they were in each
// hitter's season (his 15th, his 5th) and where in the batting order they're
// coming from — a picture that fills in through the evening instead of a
// verdict handed down at the end.
//
// SOURCES, both already published, nothing invented:
//   results_live.json   actual_hr per graded player, tonight only (date-gated
//                       the same way the storyline tracker is — the file
//                       holds the last graded slate until a new one starts)
//   the slate row       season_hr BEFORE tonight, and lineup_spot
//
// THE NUMBER: season_hr is the bot's pregame count, so his Nth homer tonight
// is season_hr + (his homers so far tonight). When the slate carries no
// season_hr for him the ledger says "—" rather than guessing a number; a
// wrong "his 30th" is worse than an honest blank.
//
// THE SPOT BARS: nine buckets, one per lineup slot, counting tonight's
// homers. Sample sizes are tiny by nature — a full slate is ~25 homers across
// nine spots — so the strip states the count and explicitly refuses to call
// three homers from the 2-hole a trend. It's a picture of tonight, not a
// finding about baseball.

const bust = (u) => `${u}${u.includes('?') ? '&' : '?'}t=${Date.now()}`
const ord = (v) => {
  const k = v % 10, h = v % 100
  return `${v}${k === 1 && h !== 11 ? 'st' : k === 2 && h !== 12 ? 'nd' : k === 3 && h !== 13 ? 'rd' : 'th'}`
}

export default function HomerLedger({ players = [], slateDate = '', onPlayerClick }) {
  const dateKey = slateDate || new Date().toLocaleDateString('en-CA')
  const isTmrw = slateDate && slateDate > new Date().toLocaleDateString('en-CA')
  const [rows, setRows] = useState(null)

  useEffect(() => {
    if (isTmrw) { setRows(null); return undefined }
    let alive = true
    const pull = () => {
      fetch(bust(dataUrl('current/results_live.json')))
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!alive || !j) return
          // date gate — the live file keeps the last graded slate until the
          // next one starts grading, so an ungated read shows a stale night
          if (String(j.date || '') !== String(dateKey)) { setRows(null); return }
          // DEDUPE BY PLAYER (2026-08-09). A hitter designated in two
          // categories (TOP *and* HR, say) gets a graded slot per category,
          // each carrying the same actual_hr — walking the slots naively
          // counted his homer twice and inflated the night's total. One
          // entry per player, keeping the max.
          const byPid = new Map()
          ;(j.graded_slots || j.results || []).forEach((s) => {
            const hr = n(s?.actual_hr, 0)
            const pid = Number(s?.player_id)
            if (hr > 0 && pid) byPid.set(pid, Math.max(byPid.get(pid) || 0, hr))
          })
          setRows([...byPid.entries()].map(([pid, hr]) => ({ pid, hr })))
        })
        .catch(() => {})
    }
    pull()
    const t = setInterval(pull, 3 * 60 * 1000)
    return () => { alive = false; clearInterval(t) }
  }, [isTmrw, dateKey])

  const model = useMemo(() => {
    if (!rows?.length) return null
    // THE BUG THAT BLANKED EVERY NUMBER (2026-08-09): this keyed the map with
    // playerId(), which returns a COMPOSITE "id-gamePk" string — Number() of
    // that is NaN, so every lookup missed, every season count fell back to
    // "—" and every lineup spot vanished. The graded rows publish the plain
    // numeric player_id; the slate rows carry the same one. Join on it.
    const byId = new Map(players.map((p) => [Number(p?.player_id ?? p?.id), p]))
    const spots = Array(10).fill(0)          // index 1..9
    const cards = []
    let total = 0
    rows.forEach(({ pid, hr }) => {
      const p = byId.get(pid)
      total += hr
      const spot = Number(p?.lineup_spot)
      if (spot >= 1 && spot <= 9) spots[spot] += hr
      const pre = p?.season_hr == null ? null : n(p.season_hr, 0)
      cards.push({
        pid, p, hr,
        name: p ? nameOf(p) : `#${pid}`,
        team: p ? teamOf(p) : '',
        spot: spot >= 1 && spot <= 9 ? spot : null,
        // his Nth of the season, counting tonight
        nth: pre == null ? null : pre + hr,
        milestone: pre != null && [5, 10, 15, 20, 25, 30, 35, 40, 45, 50].includes(pre + hr),
      })
    })
    cards.sort((a, b) => (b.nth ?? -1) - (a.nth ?? -1))
    const spotMax = Math.max(...spots.slice(1), 1)
    const placed = spots.slice(1).reduce((a, b) => a + b, 0)
    const topSpot = spots.indexOf(Math.max(...spots.slice(1)))

    // ── THE REPEATS (2026-08-09, Donovan: "if 8 people hit their 17th, does
    // that make sense") — the whole point of the ledger. Two lenses:
    //
    //   SAME NUMBER  three hitters all notching their 17th tonight is the
    //                pattern he's watching for, stated plainly with the names.
    //   DIGIT ROOT   standard numerology: sum the digits until one remains
    //                (17 → 1+7 = 8). The bot already speaks this language —
    //                numerology_score ships on every slate row — so the
    //                ledger reads the night the same way.
    //
    // Both are PATTERN SPOTTING, not evidence, and the strip says so. A
    // slate is ~25 homers over numbers 1–50; clusters happen by arithmetic
    // alone. It's here because it's fun to watch and Donovan wanted the
    // trend visible, not because it predicts anything.
    const numbered = cards.filter((c) => c.nth != null)
    const byNumber = new Map()
    const byRoot = new Map()
    const digitRoot = (v) => (v > 0 ? 1 + ((v - 1) % 9) : 0)
    numbered.forEach((c) => {
      if (!byNumber.has(c.nth)) byNumber.set(c.nth, [])
      byNumber.get(c.nth).push(c)
      const r = digitRoot(c.nth)
      if (!byRoot.has(r)) byRoot.set(r, [])
      byRoot.get(r).push(c)
    })
    const repeats = [...byNumber.entries()]
      .filter(([, list]) => list.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([num, list]) => ({ num, list }))
    const roots = [...byRoot.entries()]
      .map(([root, list]) => ({ root, list }))
      .sort((a, b) => b.list.length - a.list.length)
    const topRoot = roots[0] && roots[0].list.length >= 3 ? roots[0] : null

    return { cards, spots, spotMax, total, placed, topSpot, repeats, roots, topRoot, numbered }
  }, [rows, players])

  if (isTmrw || !model || !model.total) return null
  const { cards, spots, spotMax, total, placed, topSpot, repeats, roots, topRoot, numbered } = model
  const milestones = cards.filter((c) => c.milestone)

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.04))`,
      border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>🧾 Homer ledger</span>
        <span style={{ fontSize: 10, color: C.orange, fontFamily: NUM_FONT, fontWeight: 800 }}>
          {total} tonight
        </span>
        <span style={{ fontSize: 9, color: C.text3 }}>builds as the slate plays</span>
      </div>
      <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.55, marginBottom: 8, maxWidth: 640 }}>
        <b style={{ color: C.text2 }}>What this answers:</b> which homer of the season each one was, and
        where in the order tonight&apos;s power is coming from.
      </div>

      {milestones.length > 0 && (
        <div style={{ fontSize: 10.5, color: C.text2, marginBottom: 8, lineHeight: 1.6 }}>
          🎯 <b style={{ color: C.orange }}>Round number tonight:</b>{' '}
          {milestones.map((c, i) => (
            <span key={c.pid}>
              {i > 0 ? ' · ' : ''}
              <b onClick={() => c.p && onPlayerClick?.(c.p)} style={{ color: C.text, cursor: c.p ? 'pointer' : 'default' }}>
                {c.name}
              </b>{' '}<span style={{ fontFamily: NUM_FONT }}>{ord(c.nth)}</span>
            </span>
          ))}
        </div>
      )}

      {/* 🔢 THE REPEATS — the number pattern, which is the whole reason this
          panel exists. Same-number clusters first, then the digit root. */}
      {(repeats.length > 0 || topRoot) && (
        <div style={{
          background: 'rgba(167,139,250,.07)', border: '1px solid rgba(167,139,250,.3)',
          borderRadius: 10, padding: '7px 11px', marginBottom: 9,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 900, color: '#a78bfa', marginBottom: 3 }}>
            🔢 The number pattern
          </div>
          {repeats.map(({ num, list }) => (
            <div key={num} style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.6 }}>
              <b style={{ color: '#a78bfa', fontFamily: NUM_FONT }}>{list.length} hitters</b> notched their{' '}
              <b style={{ color: C.text, fontFamily: NUM_FONT }}>{ord(num)}</b> tonight —{' '}
              {list.map((c, i) => (
                <span key={c.pid}>
                  {i > 0 ? ', ' : ''}
                  <span onClick={() => c.p && onPlayerClick?.(c.p)} style={{ cursor: c.p ? 'pointer' : 'default', color: C.text }}>{c.name}</span>
                </span>
              ))}
            </div>
          ))}
          {topRoot && (
            <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.6, marginTop: repeats.length ? 3 : 0 }}
              title={`Digit root: add the digits of the homer number until one digit is left (17 → 1+7 = 8). ${topRoot.list.length} of tonight's ${numbered.length} numbered homers land on ${topRoot.root}.`}>
              <b style={{ color: '#a78bfa', fontFamily: NUM_FONT }}>{topRoot.list.length}</b> of tonight&apos;s{' '}
              {numbered.length} numbered homers reduce to{' '}
              <b style={{ color: C.text, fontFamily: NUM_FONT }}>{topRoot.root}</b>{' '}
              <span style={{ color: C.text3 }}>
                ({topRoot.list.slice(0, 5).map((c) => c.nth).join(', ')}{topRoot.list.length > 5 ? '…' : ''})
              </span>
            </div>
          )}
          <div style={{ fontSize: 8.5, color: C.text3, marginTop: 4, lineHeight: 1.5 }}>
            Pattern watching, not evidence — ~25 homers spread over numbers 1–50 cluster by arithmetic
            alone. Digit root = add the digits until one is left (17 → 8). Fun to track, never a reason to bet.
          </div>
        </div>
      )}

      {/* every homer tonight, numbered */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {cards.map((c) => (
          <button key={c.pid} onClick={() => c.p && onPlayerClick?.(c.p)}
            title={`${c.name}${c.team ? ` (${c.team})` : ''}${c.spot ? ` · batting ${ord(c.spot)}` : ''}${c.nth != null ? ` — his ${ord(c.nth)} homer of the season, counting tonight's ${c.hr}` : ' — the slate carries no season HR count for him, so the number is left blank rather than guessed'}`}
            style={{
              display: 'flex', gap: 6, alignItems: 'baseline', cursor: c.p ? 'pointer' : 'default',
              border: `1px solid ${c.milestone ? 'rgba(249,115,22,.6)' : C.border}`,
              background: c.milestone ? 'rgba(249,115,22,.10)' : C.bg2,
              borderRadius: 8, padding: '4px 10px',
            }}>
            <span style={{ fontSize: 10 }}>💥</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: C.text }}>{c.name}</span>
            {c.hr > 1 && <span style={{ fontSize: 9, fontFamily: NUM_FONT, color: C.orange, fontWeight: 900 }}>×{c.hr}</span>}
            <span style={{ fontSize: 9.5, fontFamily: NUM_FONT, color: c.milestone ? C.orange : C.text3, fontWeight: c.milestone ? 900 : 600 }}>
              {c.nth != null ? ord(c.nth) : '—'}
            </span>
            {c.spot && <span style={{ fontSize: 8.5, fontFamily: NUM_FONT, color: C.text3 }}>#{c.spot}</span>}
          </button>
        ))}
      </div>

      {/* where in the order tonight's power came from */}
      {placed > 0 && (
        <>
          <div style={{ fontSize: 9.5, color: C.text3, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: NUM_FONT, marginBottom: 4 }}>
            Homers by lineup spot
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 46 }}>
            {spots.slice(1).map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
                title={`${v} homer${v === 1 ? '' : 's'} tonight from the ${ord(i + 1)} spot, out of ${placed} placed`}>
                <span style={{ fontSize: 8.5, fontFamily: NUM_FONT, color: v ? C.text2 : C.text3, fontWeight: 800 }}>{v || ''}</span>
                <div style={{
                  width: '100%', height: `${Math.max(3, (26 * v) / spotMax)}px`, borderRadius: 3,
                  background: v === spotMax && v > 0 ? C.orange : v ? 'rgba(249,115,22,.45)' : 'rgba(255,255,255,.06)',
                }} />
                <span style={{ fontSize: 8, fontFamily: NUM_FONT, color: C.text3 }}>{i + 1}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 9, color: C.text3, marginTop: 7, lineHeight: 1.55 }}>
            {placed} of {total} homers have a known lineup spot.
            {spots[topSpot] >= 3 && <> The <b style={{ color: C.text2 }}>{ord(topSpot)} spot</b> leads tonight with {spots[topSpot]}.</>}
            {' '}A full slate is ~25 homers across nine spots, so a tall bar is a picture of tonight,
            not a finding about baseball — read it as texture, never as a signal to chase.
          </div>
        </>
      )}
    </div>
  )
}
