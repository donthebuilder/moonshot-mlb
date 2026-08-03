'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean, obj, arr } from '../lib/player'
import { detailUrl } from '../lib/dataSource'
import { rampColor, inkFor } from './Heatmap'
import DenseTable from './DenseTable'

// What this hitter homers off — and whether tonight's starter throws it.
//
// The detail file carries every tracked batted ball with its pitch_type and an
// is_hr flag, so his home runs can be grouped by the pitch that was thrown.
// On its own that's trivia. Sat next to the starter's usage mix it becomes the
// question worth asking: he has four homers off sliders, does this guy throw
// sliders?
//
// The honest caveat, stated on the panel rather than buried here: this is a
// small sample by construction. A hitter has a handful of homers in the tracked
// window, so "3 off the slider" is three swings. It's a reason to look closer,
// never a reason on its own.

const PITCH_NAMES = {
  FF: '4-seam', SI: 'Sinker', FC: 'Cutter', SL: 'Slider', ST: 'Sweeper',
  CU: 'Curve', KC: 'Knuckle curve', CH: 'Changeup', FS: 'Splitter',
  FA: 'Fastball', SV: 'Slurve', KN: 'Knuckleball', EP: 'Eephus',
}
const pitchName = (k) => PITCH_NAMES[k] || k

export default function HRPitchProfile({ player, slateMode }) {
  const [data, setData] = useState(null)
  const [state, setState] = useState('idle')

  const pid = player?.player_id || player?.id

  useEffect(() => {
    if (!pid) return
    let alive = true
    setState('loading'); setData(null)
    fetch(detailUrl(pid, slateMode))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setData(j); setState('done') } })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [pid, slateMode])

  // Tonight's starter's mix, straight off the slate row.
  const arsenal = useMemo(() => {
    const usage = obj(player?.pitcher_pitch_usage_pct)
    return Object.fromEntries(
      Object.entries(usage).map(([k, v]) => [k, Number(v)]).filter(([, v]) => Number.isFinite(v)),
    )
  }, [player])

  const rows = useMemo(() => {
    const bbe = arr(data?.spray_chart)
    const homers = bbe.filter((b) => b?.is_hr)
    if (!homers.length) return []

    const byPitch = new Map()
    homers.forEach((h) => {
      const k = clean(h?.pitch_type, '?')
      if (!byPitch.has(k)) byPitch.set(k, [])
      byPitch.get(k).push(h)
    })

    // Denominator: how often he SEES each pitch in the tracked window. Without
    // it, "4 homers off the fastball" just means he sees a lot of fastballs.
    const seen = new Map()
    bbe.forEach((b) => {
      const k = clean(b?.pitch_type, '?')
      seen.set(k, (seen.get(k) || 0) + 1)
    })

    return [...byPitch.entries()].map(([k, list]) => {
      const dists = list.map((h) => n(h?.distance, 0)).filter(Boolean)
      const evs = list.map((h) => n(h?.ev, 0)).filter(Boolean)
      const velos = list.map((h) => n(h?.pitch_velocity, 0)).filter(Boolean)
      const bbeSeen = seen.get(k) || list.length
      return {
        _key: k,
        code: k,
        pitch: pitchName(k),
        hrs: list.length,
        seen: bbeSeen,
        rate: (100 * list.length) / bbeSeen,
        avgDist: dists.length ? dists.reduce((a, b) => a + b, 0) / dists.length : 0,
        maxDist: dists.length ? Math.max(...dists) : 0,
        avgEV: evs.length ? evs.reduce((a, b) => a + b, 0) / evs.length : 0,
        avgVelo: velos.length ? velos.reduce((a, b) => a + b, 0) / velos.length : 0,
        tonight: n(arsenal[k], 0),
      }
    }).sort((a, b) => b.hrs - a.hrs)
  }, [data, arsenal])

  if (!pid) return null
  if (state === 'loading') {
    return <div style={{ fontSize: 11, color: C.text3, padding: '8px 0' }}>Loading home-run pitch data…</div>
  }
  if (state === 'error') {
    return <div style={{ fontSize: 11, color: C.text3, padding: '8px 0' }}>Couldn&apos;t load his batted-ball detail.</div>
  }
  if (!rows.length) {
    return (
      <div style={{ fontSize: 11, color: C.text3, padding: '8px 0' }}>
        No home runs in his tracked batted-ball window, so there&apos;s no pitch breakdown to show.
      </div>
    )
  }

  const overlap = rows.filter((r) => r.tonight > 0)
  const totalHR = rows.reduce((a, r) => a + r.hrs, 0)
  const covered = overlap.reduce((a, r) => a + r.hrs, 0)
  const maxHR = Math.max(...rows.map((r) => r.hrs), 1)

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>
        Home runs by pitch type
      </div>

      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`,
        borderLeft: `4px solid ${covered > 0 ? C.orange : C.border}`,
        borderRadius: 12, padding: '10px 14px', marginBottom: 10,
      }}>
        <div style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Does {clean(player?.pitcher_name, "tonight's starter")} throw what he hits?
        </div>
        <div style={{
          fontSize: 17, fontWeight: 800, margin: '3px 0 2px',
          color: covered > 0 ? C.orange : C.text2,
        }}>
          {covered} of {totalHR} homers came off pitches he&apos;ll see tonight
        </div>
        <div style={{ fontSize: 11, color: C.text2, fontFamily: NUM_FONT }}>
          {overlap.length
            ? overlap.map((r) => `${r.pitch} ${r.hrs}HR · ${r.tonight.toFixed(0)}% usage`).join('  ·  ')
            : 'No overlap — the pitches he goes deep on are not in this arsenal.'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {rows.map((r) => {
          const bg = rampColor(r.hrs, 0, maxHR)
          return (
            <div key={r.code} style={{
              border: `1px solid ${r.tonight > 0 ? C.orange : C.border}`,
              borderRadius: 10, padding: '6px 10px', minWidth: 92,
              background: C.bg2,
            }}>
              <div style={{ fontSize: 9.5, color: C.text3, fontWeight: 700 }}>
                {r.pitch}
                {r.tonight > 0 && (
                  <span style={{ color: C.orange, marginLeft: 4 }}>{r.tonight.toFixed(0)}%</span>
                )}
              </div>
              <div style={{
                display: 'inline-block', marginTop: 3, padding: '1px 8px', borderRadius: 5,
                background: bg, color: inkFor(bg), fontFamily: NUM_FONT,
                fontSize: 14, fontWeight: 800,
              }}>{r.hrs}</div>
              <div style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, marginTop: 2 }}>
                {r.avgDist ? `${r.avgDist.toFixed(0)} ft avg` : '—'}
              </div>
            </div>
          )
        })}
      </div>

      <DenseTable
        rows={rows}
        columns={[
          { key: 'pitch',   label: 'Pitch',   heat: false, w: 110, bold: true, sticky: true },
          { key: 'code',    label: 'Type',    heat: false, w: 40, mono: true, dim: true },
          { key: 'tonight', label: 'Tonight%', w: 56, dp: 0,
            title: "Share of tonight's starter's mix. Dark means he barely throws it." },
          { key: 'hrs',     label: 'HR',      w: 40 },
          { key: 'seen',    label: 'Seen',    w: 44,
            title: 'Tracked batted balls against this pitch — the denominator' },
          { key: 'rate',    label: 'HR/BBE%', w: 54, dp: 1 },
          { key: 'avgDist', label: 'Avg ft',  w: 50, dp: 0 },
          { key: 'maxDist', label: 'Max ft',  w: 50, dp: 0 },
          { key: 'avgEV',   label: 'Avg EV',  w: 50, dp: 1 },
          { key: 'avgVelo', label: 'Pitch mph', w: 58, dp: 1 },
        ]}
        initialSort="hrs"
        maxHeight={260}
        caption="Seen is the denominator on purpose — four homers off fastballs means little if fastballs are most of what he sees. This is a small sample by construction: a handful of homers in the tracked window is a reason to look closer, never a reason on its own."
      />
    </div>
  )
}
