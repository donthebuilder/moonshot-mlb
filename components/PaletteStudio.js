'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import {
  RAMPS, getKnobs, setKnobs, resetKnobs, setRamp, usePalette, hydrateRamp, inkOn,
} from '../lib/palette'
import { auditRamp, solveScale } from '../lib/rampSolver'

// 🎛️ PALETTE STUDIO — build your own heat scale, live.
//
// 2026-08-10, Donovan: "is there any way to get closer to the green and red
// from PropFinder... or is there a way to make it so I can just customise on
// the site?"
//
// The second half of that sentence is the better ask and this is the answer to
// it. Seven times now he has described a colour, I have guessed at it, and he
// has told me it is not it. That loop does not converge, because what is being
// communicated is a visual impression and the channel is words. He moves a
// slider, the board recolours under his hand, he stops when it looks right.
//
// WHAT THE KNOBS ARE. Not nine hex fields — the four parameters the shipped
// ramps were solved against. lib/rampSolver.js still enforces underneath:
// rising luminance, no stop in the unreadable 0.170–0.189 gap, 4.5:1 with an
// ink, and a perceptible step between neighbours. A slider position that would
// break one of those simply does not take, and the row below the preview says
// so out loud rather than silently ignoring the drag.
//
// The live readout is deliberate. Every other palette decision this week was
// made from a screenshot and a guess; this one shows its measurements while
// you make it.

const SHAPES = [
  ['arch', 'Arch', 'Loudest in the middle. A sweep you can rank — this is Signal’s shape.'],
  ['rise', 'Rise', 'Gets louder as it gets better. Reads as more of one thing — Ember’s shape.'],
  ['dip', 'Collapse', 'Loud at both ends, grey in the middle. Extremes only — Verdict’s shape.'],
]

function Slider({ label, value, min, max, step, onChange, fmt, note }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        fontSize: 9.5, fontWeight: 800, color: C.text2, letterSpacing: '.04em',
        textTransform: 'uppercase', marginBottom: 2,
      }}>
        {label}
        <span style={{ fontFamily: NUM_FONT, fontSize: 10, color: C.text3, textTransform: 'none', letterSpacing: 0 }}>
          {fmt ? fmt(value) : value}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: C.orange, height: 18, cursor: 'pointer' }}
      />
      {note && (
        <span style={{ display: 'block', fontSize: 8.5, color: C.text3, lineHeight: 1.4, marginTop: -1 }}>
          {note}
        </span>
      )}
    </label>
  )
}

export default function PaletteStudio({ compact = false }) {
  const active = usePalette()
  const [knobs, setLocal] = useState(getKnobs)
  const [rejected, setRejected] = useState(false)

  useEffect(() => { hydrateRamp(); setLocal(getKnobs()) }, [])

  // The preview is solved from the LOCAL knobs, not from the store, so the
  // swatch under the sliders is always what the sliders currently say — even
  // in the one case where the store refused the value.
  const { stops: preview, inks: previewInks } = solveScale(knobs)
  const audit = auditRamp(preview, previewInks || undefined)

  const set = (patch) => {
    const next = { ...knobs, ...patch }
    setLocal(next)
    const took = setKnobs(patch)
    setRejected(!took)
    // Editing the knobs means you want to SEE them. Switching for him is the
    // difference between a control panel and a control.
    if (took && active !== 'custom') setRamp('custom')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden' }}>
        {preview.map((c, i) => (
          <span key={c + i} style={{
            flex: 1, height: compact ? 22 : 28, background: c,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: NUM_FONT, fontSize: 9, fontWeight: 800,
            // The preview reads its own solve, not the store — so it is right
            // even in the one case where the store refused the value.
            color: previewInks ? previewInks[i] : inkOn(c),
          }}>{Math.round((i / (preview.length - 1)) * 99)}</span>
        ))}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: compact ? '1fr' : '1fr 1fr',
        gap: compact ? 8 : '9px 14px',
      }}>
        <Slider
          label="Bad end" value={knobs.hueFrom} min={0} max={359} step={1}
          fmt={(v) => `${v}°`} onChange={(v) => set({ hueFrom: v })}
          note="0° red · 30° amber · 200° blue"
        />
        <Slider
          label="Good end" value={knobs.hueTo} min={0} max={359} step={1}
          fmt={(v) => `${v}°`} onChange={(v) => set({ hueTo: v })}
          note="120–150° green · 190° teal"
        />
        <Slider
          label="Intensity" value={knobs.sat} min={0.15} max={1} step={0.01}
          fmt={(v) => v.toFixed(2)} onChange={(v) => set({ sat: v })}
          note="Lower is calmer on the eyes over a long night."
        />
        <Slider
          label="Brightness" value={knobs.brightness} min={0.2} max={1} step={0.01}
          fmt={(v) => v.toFixed(2)} onChange={(v) => set({ brightness: v })}
          note={knobs.litNumbers
            ? 'How lit the numbers get. The cells stay dark — that is the style.'
            : 'How far up the good end reaches.'}
        />
        <Slider
          label="Steps" value={Math.min(knobs.stops, knobs.litNumbers ? 9 : 11)}
          min={6} max={knobs.litNumbers ? 9 : 11} step={1}
          onChange={(v) => set({ stops: v })}
          note={knobs.litNumbers
            ? 'Lit mode tops out at nine — past that the dark cells stop separating.'
            : 'Fewer steps = blunter, easier to read at a glance.'}
        />
        {/* The grey floor is an Ember idea and needs a bright cell to read as
            grey rather than as black. In lit mode it took the plateau check
            down almost every time it was used, so the knob is not offered
            rather than offered and refused. */}
        {!knobs.litNumbers && (
          <Slider
            label="Grey floor" value={knobs.greyBottom} min={0} max={4} step={1}
            onChange={(v) => set({ greyBottom: v })}
            note="Bottom cells go near-grey — says none rather than bad."
          />
        )}
      </div>

      <div>
        <div style={{
          fontSize: 9.5, fontWeight: 800, color: C.text2, letterSpacing: '.04em',
          textTransform: 'uppercase', marginBottom: 4,
        }}>Numbers</div>
        <div style={{ display: 'flex', gap: 5, marginBottom: 9 }}>
          {[
            [false, 'On the cell', 'Bright cell, black or white number. The cell carries the signal — Ember and Verdict.'],
            [true, 'Lit', 'Deep tinted cell, coloured number. The number carries the signal — Signal, and the props sheet it came from.'],
          ].map(([v, label, why]) => {
            const on = !!knobs.litNumbers === v
            return (
              <button
                key={label}
                type="button"
                title={why}
                onClick={() => set({ litNumbers: v })}
                style={{
                  flex: 1, padding: '5px 4px', borderRadius: 7, cursor: 'pointer',
                  fontSize: 9.5, fontWeight: 800,
                  background: on ? C.bg3 : 'transparent',
                  border: `1px solid ${on ? C.orange : C.border}`,
                  color: on ? C.text : C.text3,
                }}
              >{label}</button>
            )
          })}
        </div>
        <div style={{
          fontSize: 9.5, fontWeight: 800, color: C.text2, letterSpacing: '.04em',
          textTransform: 'uppercase', marginBottom: 4,
        }}>Shape</div>
        <div style={{ display: 'flex', gap: 5 }}>
          {SHAPES.map(([id, label, why]) => {
            const on = knobs.satShape === id
            return (
              <button
                key={id}
                type="button"
                title={why}
                onClick={() => set({ satShape: id })}
                style={{
                  flex: 1, padding: '5px 4px', borderRadius: 7, cursor: 'pointer',
                  fontSize: 9.5, fontWeight: 800,
                  background: on ? C.bg3 : 'transparent',
                  border: `1px solid ${on ? C.orange : C.border}`,
                  color: on ? C.text : C.text3,
                }}
              >{label}</button>
            )
          })}
        </div>
      </div>

      {/* THE RECEIPTS. Same four numbers the build-time guard checks, shown
          while you drag rather than after you ship. */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '2px 10px',
        fontSize: 9, fontFamily: NUM_FONT,
        color: audit.ok ? C.text3 : '#f87171',
      }}>
        <span>text contrast {audit.worstText.toFixed(2)}:1</span>
        <span>step Δ{audit.closest.toFixed(0)}</span>
        <span>{audit.monotonic ? 'greyscale-safe' : 'greyscale BROKEN'}</span>
        <span>{audit.inDeadZone ? `${audit.inDeadZone} unreadable` : 'no dead stops'}</span>
        {previewInks && <span>lit numbers</span>}
      </div>

      {rejected && (
        <div style={{ fontSize: 9, color: '#fbbf24', lineHeight: 1.5 }}>
          That position would have made a cell unreadable, so the board kept the
          last legal ramp. Move it back a little.
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => { resetKnobs(); setLocal(getKnobs()); setRejected(false) }}
          style={{
            padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
            background: 'transparent', border: `1px solid ${C.border}`,
            color: C.text3, fontSize: 9.5, fontWeight: 700,
          }}
        >Reset</button>
        {['ember', 'traffic', 'verdict'].map((id) => (
          <button
            key={id}
            type="button"
            title={`Load ${RAMPS[id].label}'s numbers into the sliders as a starting point.`}
            onClick={() => {
              // Start from one of ours rather than from nothing. The knob sets
              // below are the parameters each shipped ramp was solved against
              // — near enough that the first drag is an adjustment.
              const seed = {
                ember: { hueFrom: 240, hueTo: 33, sat: 0.62, brightness: 0.62, satShape: 'rise', stops: 8, greyBottom: 3, litNumbers: false },
                traffic: { hueFrom: 0, hueTo: 142, sat: 0.62, brightness: 0.80, satShape: 'arch', stops: 8, greyBottom: 0, litNumbers: true },
                verdict: { hueFrom: 354, hueTo: 141, sat: 0.62, brightness: 0.38, satShape: 'dip', stops: 9, greyBottom: 0, litNumbers: false },
              }[id]
              const took = setKnobs(seed)
              setRejected(!took)
              if (took) { setLocal(getKnobs()); setRamp('custom') }
            }}
            style={{
              padding: '4px 9px', borderRadius: 7, cursor: 'pointer',
              background: 'transparent', border: `1px solid ${C.border}`,
              color: C.text3, fontSize: 9.5, fontWeight: 700,
            }}
          >from {RAMPS[id].label}</button>
        ))}
      </div>

      <div style={{ fontSize: 9, color: C.text3, lineHeight: 1.5 }}>
        Saves on this device. Every position keeps the four rules the built-in
        ramps follow — rising brightness, nothing in the unreadable band, real
        contrast on the numbers, and a visible gap between steps — so there is
        no way to build a board you cannot read.
      </div>
    </div>
  )
}
