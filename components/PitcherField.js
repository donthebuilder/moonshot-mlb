'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n } from '../lib/player'

// PITCHER DAMAGE FIELD — the spray-chart-shaped view of what this arm allows.
//
// SAY THE LIMITATION FIRST: the payload has no batted-ball coordinates for
// pitchers, so a true spray chart (dots where balls landed) cannot be built
// without inventing data. This is the honest version — the same field visual
// as the hitter spray, but shaded as a DIRECTIONAL PROFILE derived from four
// verified rates (all 268/268 or near on the slate):
//
//   xbh_vs_lhb / xbh_vs_rhb      which batter hand does his damage
//   pitcher_pullair_allowed_pct  how much of his damage is pulled air
//   pitcher_fb_rate              how much of his contact is in the air at all
//   pitcher_hardhit_allowed      how hard it comes off the bat
//
// Mapping: RHB pull to LEFT field, LHB pull to RIGHT. So left-field shading =
// RHB damage share × pull-air, right-field = LHB share × pull-air, and the
// unpulled remainder spreads to center. Intensity scales with hard-hit rate.
// The caption on the face says "profile from rates, not plotted balls" —
// nobody should read sectors as landing spots.
//
// If the bot ever publishes per-pitcher batted-ball events (a spray_allowed
// array in the pitcher detail file), replace this with real dots and delete
// the disclaimers. Noted in BOT-DATA-REQUESTS.md territory.

export default function PitcherField({ pitcher, height = 260 }) {
  const p = pitcher?.lineup?.[0]?.raw || pitcher || {}

  const model = useMemo(() => {
    const xbhL = n(p?.xbh_vs_lhb, 0)      // damage BY left-handed batters
    const xbhR = n(p?.xbh_vs_rhb, 0)      // damage BY right-handed batters
    const total = xbhL + xbhR
    if (!total) return null
    const pull = (() => {
      const v = n(p?.pitcher_pullair_allowed_pct, 0)
      return v > 1 ? v / 100 : v
    })()
    const hard = (() => {
      const v = n(p?.pitcher_hardhit_allowed, 0)
      return v > 1 ? v / 100 : v
    })()
    const fb = (() => {
      const v = n(p?.pitcher_fb_rate, 0)
      return v > 1 ? v / 100 : v
    })()
    // Share of damage pulled to each corner; remainder to center.
    const shareL = (xbhR / total) * pull          // RHB pull → LF
    const shareR = (xbhL / total) * pull          // LHB pull → RF
    const shareC = Math.max(0, 1 - shareL - shareR)
    // Intensity 0..1 for the whole field, driven by hard contact.
    const heat = Math.max(0.25, Math.min(1, hard / 0.45))
    return { xbhL, xbhR, shareL, shareC, shareR, pull, hard, fb, heat }
  }, [p])

  if (!model) return null

  const W = 340, H = 300
  const home = { x: W / 2, y: H - 26 }
  const R = 235
  // Three sectors: left (-45°..-15°), center (-15°..15°), right (15°..45°),
  // measured from straightaway center field.
  const sector = (a0, a1) => {
    const rad = (a) => ((a - 90) * Math.PI) / 180
    const x0 = home.x + R * Math.cos(rad(a0)), y0 = home.y + R * Math.sin(rad(a0))
    const x1 = home.x + R * Math.cos(rad(a1)), y1 = home.y + R * Math.sin(rad(a1))
    return `M ${home.x} ${home.y} L ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1} Z`
  }
  const alpha = (share) => Math.min(0.75, 0.08 + share * model.heat * 1.4)
  const sectors = [
    { d: sector(-45, -15), share: model.shareL, label: 'LF', lx: home.x - 96, ly: home.y - 132,
      note: `RHB pull side · ${model.xbhR} XBH by RHB` },
    { d: sector(-15, 15), share: model.shareC, label: 'CF', lx: home.x, ly: home.y - 168,
      note: 'unpulled air' },
    { d: sector(15, 45), share: model.shareR, label: 'RF', lx: home.x + 96, ly: home.y - 132,
      note: `LHB pull side · ${model.xbhL} XBH by LHB` },
  ]

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 4 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800 }}>Where the damage goes</span>
        <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>
          directional profile from published rates — not plotted batted balls
        </span>
      </div>
      <div style={{
        background: '#3d2612', border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '6px 4px 0', display: 'flex', justifyContent: 'center',
      }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 400, height }}>
          {/* outfield grass wedge */}
          <path d={sector(-45, 45)} fill="#2a1a0c" stroke="#f97316" strokeWidth="1.4" />
          {/* damage sectors */}
          {sectors.map((s) => (
            <path key={s.label} d={s.d} fill={`rgba(248,113,113,${alpha(s.share)})`} />
          ))}
          {/* foul lines */}
          {sectors.map((s) => <path key={`l${s.label}`} d={s.d} fill="none" stroke="#f9731633" strokeWidth="1" />)}
          {/* infield diamond */}
          <rect x={home.x - 26} y={home.y - 66} width={52} height={52}
            transform={`rotate(45 ${home.x} ${home.y - 40})`}
            fill="none" stroke="#f9731688" strokeWidth="1.2" />
          {/* labels */}
          {sectors.map((s) => (
            <g key={`t${s.label}`}>
              <text x={s.lx} y={s.ly} textAnchor="middle"
                fill="#f4f4f5" fontSize="13" fontWeight="800" fontFamily="ui-monospace, monospace">
                {(100 * s.share).toFixed(0)}%
              </text>
              <text x={s.lx} y={s.ly + 13} textAnchor="middle" fill="#a1a1aa" fontSize="8.5"
                fontFamily="ui-monospace, monospace">{s.label}</text>
            </g>
          ))}
        </svg>
      </div>
      <div style={{ fontSize: 9, color: C.text3, marginTop: 5, lineHeight: 1.55, fontFamily: NUM_FONT }}>
        Shading = share of his allowed damage headed to each third, from XBH by batter hand
        ({model.xbhR} by RHB → LF, {model.xbhL} by LHB → RF) × {(100 * model.pull).toFixed(0)}% pulled-air
        allowed; brightness scales with his {(100 * model.hard).toFixed(0)}% hard-hit rate.
        {' '}Fly-ball rate {(100 * model.fb).toFixed(0)}%. The payload publishes no landing coordinates
        for pitchers — if it ever does, this becomes a real spray chart.
      </div>
    </div>
  )
}
