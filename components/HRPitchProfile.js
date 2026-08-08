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

  // Average HR distance, weighted by how often tonight's starter throws each
  // pitch. This is the "avg distance vs his mix" number — not a straight
  // average of his homers, but the one you'd expect given what he'll actually
  // see. A hitter whose long homers all came off curveballs and who's facing a
  // guy who throws none gets a lower number than his raw average, which is the
  // whole point.
  const mixWeighted = (() => {
    const w = overlap.filter((r) => r.avgDist > 0)
    const denom = w.reduce((a, r) => a + r.tonight, 0)
    if (!denom) return null
    return {
      dist: w.reduce((a, r) => a + r.avgDist * r.tonight, 0) / denom,
      hrs: w.reduce((a, r) => a + r.hrs, 0),
      cover: denom,
    }
  })()
  const rawAvg = (() => {
    const d = rows.filter((r) => r.avgDist > 0)
    const hrs = d.reduce((a, r) => a + r.hrs, 0)
    return hrs ? d.reduce((a, r) => a + r.avgDist * r.hrs, 0) / hrs : null
  })()

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

        {mixWeighted && (
          <div style={{
            display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline',
            marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`,
          }}>
            <div>
              <div style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Avg HR distance vs his mix
              </div>
              <span style={{ fontFamily: NUM_FONT, fontSize: 17, fontWeight: 800, color: C.orange }}>
                {mixWeighted.dist.toFixed(0)} ft
              </span>
            </div>
            {rawAvg && (
              <div>
                <div style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  All his homers
                </div>
                <span style={{ fontFamily: NUM_FONT, fontSize: 14, fontWeight: 700, color: C.text2 }}>
                  {rawAvg.toFixed(0)} ft
                </span>
              </div>
            )}
            <div style={{ fontSize: 9, color: C.text3, flex: 1, minWidth: 200, lineHeight: 1.5 }}>
              Weighted by how often {clean(player?.pitcher_name, 'he')} throws each pitch, over the{' '}
              {mixWeighted.hrs} homer{mixWeighted.hrs === 1 ? '' : 's'} that came off pitches in his
              arsenal — covering {mixWeighted.cover.toFixed(0)}% of tonight&apos;s mix. If it sits below
              his overall average, his longest balls came off pitches he won&apos;t see much of.
            </div>
          </div>
        )}
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

      {/* BAR CHART v2 (2026-08-08, "use a different type of chart"): the
          ten-column heat table buried the one comparison that matters —
          damage rate vs how much of it he'll SEE tonight. Two bars per
          pitch: ember = HR per batted ball, cyan = tonight's usage. When
          both bars run long on the same row, that's the pitch to watch. */}
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11, padding: '10px 14px' }}>
        {(() => {
          const maxRate = Math.max(...rows.map((r) => Number(r.rate) || 0), 1e-9)
          const maxTon = Math.max(...rows.map((r) => Number(r.tonight) || 0), 1e-9)
          return [...rows].sort((a, b) => (b.rate || 0) - (a.rate || 0)).map((r, i) => {
            const rateW = Math.max(2, (100 * (Number(r.rate) || 0)) / maxRate)
            const tonW = Math.max(2, (100 * (Number(r.tonight) || 0)) / maxTon)
            const both = (Number(r.rate) || 0) >= maxRate * 0.6 && (Number(r.tonight) || 0) >= maxTon * 0.6
            return (
              <div key={r.code || i} style={{ padding: '6px 0', borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, width: 86, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {both ? '🎯 ' : ''}{r.pitch}
                  </span>
                  <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0 }}>{r.code}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.hrs} HR / {r.seen} seen{r.avgDist ? ` · ${Number(r.avgDist).toFixed(0)}ft` : ''}{r.maxDist ? ` (max ${Number(r.maxDist).toFixed(0)})` : ''}{r.avgEV ? ` · ${Number(r.avgEV).toFixed(1)} EV` : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4 }}>
                  <span style={{ fontSize: 8, color: '#fca63a', fontFamily: NUM_FONT, width: 58, flexShrink: 0, fontWeight: 800 }}>DMG {Number(r.rate || 0).toFixed(1)}%</span>
                  <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,.05)', borderRadius: 3 }}>
                    <div style={{ width: `${rateW}%`, height: '100%', borderRadius: 3, background: 'linear-gradient(90deg, #7a5220, #fca63a)' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3 }}>
                  <span style={{ fontSize: 8, color: '#22d3ee', fontFamily: NUM_FONT, width: 58, flexShrink: 0, fontWeight: 800 }}>2NITE {Number(r.tonight || 0).toFixed(0)}%</span>
                  <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,.05)', borderRadius: 3 }}>
                    <div style={{ width: `${tonW}%`, height: '100%', borderRadius: 3, background: 'linear-gradient(90deg, rgba(34,211,238,.35), #22d3ee)', opacity: 0.85 }} />
                  </div>
                </div>
              </div>
            )
          })
        })()}
        <div style={{ fontSize: 9, color: C.text3, marginTop: 8, lineHeight: 1.5 }}>
          Ember bar = his HR rate per batted ball against that pitch · cyan bar = how much of tonight&apos;s
          starter&apos;s mix it is. 🎯 marks rows where BOTH run long — damage meeting supply. Bars are scaled
          within this card; the numbers beside them are the truth. Small sample by construction.
        </div>
      </div>
    </div>
  )
}
