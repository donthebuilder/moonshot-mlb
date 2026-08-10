'use client'
import { useEffect } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { RAMPS, RAMP_IDS, usePalette, setRamp, hydrateRamp, inkOn } from '../lib/palette'

// 🎨 PALETTE TOGGLE — pick the heat scale, see it before you commit.
//
// 2026-08-09, Donovan: "make a toggle with my original heat map colour... then
// give me an option for a PropFinder-esque green to red colour scheme — but I
// want to add a yellow for like okay stats."
//
// THE SWATCH IS THE CONTROL. Three buttons labelled with words would make you
// switch, look, switch back, look again. Each button IS its ramp, rendered at
// nine stops, so the choice is made by eye in one glance and the labels are
// only there to name what you already picked.
//
// The whole site re-colours the instant one is pressed — every table, zone
// map and matchup grid reads the active ramp through lib/palette rather than
// holding its own copy.
export default function PaletteToggle({ compact = false }) {
  const active = usePalette()

  // Read the saved choice AFTER mount, never during render. The server has no
  // localStorage, so a render-time read makes the server and first client
  // render disagree and React throws away the hydrated tree. Same rule as
  // every other per-device flag here.
  useEffect(() => { hydrateRamp() }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{
        display: 'flex', gap: compact ? 5 : 7, flexWrap: 'wrap', alignItems: 'stretch',
      }}>
        {RAMP_IDS.map((id) => {
          const r = RAMPS[id]
          const on = active === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setRamp(id)}
              aria-pressed={on}
              title={`${r.blurb} ${r.hint}`}
              style={{
                flex: compact ? '1 1 96px' : '1 1 150px', minWidth: 0,
                background: on ? C.bg3 : 'transparent',
                border: `1px solid ${on ? C.orange : C.border}`,
                boxShadow: on ? `0 0 12px ${C.orange}22` : 'none',
                borderRadius: 10, padding: compact ? '5px 6px 6px' : '7px 9px 8px',
                cursor: 'pointer', textAlign: 'left',
                transition: 'border-color .12s, background .12s',
              }}
            >
              {/* the ramp itself, at every stop — no gaps, so it reads as one
                  scale rather than nine chips */}
              <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', marginBottom: 5 }}>
                {r.stops.map((c, i) => {
                  const mid = Math.floor(r.stops.length / 2)
                  // A ramp that ships its own inks is previewed with them.
                  // inkOn() answers for the ACTIVE ramp, so asking it about a
                  // ramp you are only looking at gives the wrong ink.
                  const ink = r.inks ? r.inks[i] : inkOn(c)
                  return (
                    <span key={c} style={{
                      flex: 1, height: compact ? 12 : 16, background: c,
                      // The middle stop carries a sample glyph so you can see
                      // that text survives on the fill, which is the whole
                      // reason the earlier ramps were unusable.
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, fontWeight: 800, fontFamily: NUM_FONT,
                      color: i === mid ? ink : 'transparent',
                    }}>{i === mid ? '50' : ''}</span>
                  )
                })}
              </div>
              <div style={{
                fontSize: compact ? 9.5 : 10.5, fontWeight: 800,
                color: on ? C.text : C.text2,
              }}>{r.label}</div>
              {!compact && (
                <div style={{ fontSize: 9, color: C.text3, lineHeight: 1.4, marginTop: 1 }}>
                  {r.blurb}
                </div>
              )}
            </button>
          )
        })}
      </div>
      {!compact && (
        <div style={{ fontSize: 9, color: C.text3, lineHeight: 1.5 }}>
          Applies everywhere on the site and sticks on this device. All three are
          built so every cell stays readable — the low end used to be a dark smear you
          could see but not read.{' '}
          <span style={{ color: C.text2 }}>{RAMPS[active]?.hint}</span>
        </div>
      )}
    </div>
  )
}
