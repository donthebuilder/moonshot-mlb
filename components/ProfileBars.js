'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { verdictInk } from '../lib/scales'

// 📊 WHAT SEPARATES THE TOP FIFTEEN — the panel that replaced the profile
// heatmap.
//
// 2026-08-31, Donovan, on the ten-column heat grid that used to sit here:
// "i just dont like them any more how that style is ypu can just get rid of it
// or eopl with something more usful."
//
// He is right, and the grid told on itself. Its own caption read: "Each column
// is scaled on its own, so a strong cell means high for this slate on that
// input — not comparable across columns." That is a chart admitting that its
// only visual variable does not mean one thing. Ten columns of colour where
// the colour changes meaning every column is not a picture, it is ten pictures
// overlaid, and the eye cannot un-overlay them.
//
// It also had to LIE ABOUT NUMBERS to hold its shape: ISO was multiplied by
// 100 and pitcher HR/9 by 30, purely so they would land in the same range as
// the 0-100 scores. A grid where .231 prints as 23 and 1.22 prints as 37 has
// stopped showing you your data.
//
// WHAT THIS DOES INSTEAD, from exactly the same inputs:
//
//   · ONE SCALE. A single bar per hitter, on the board's own score, 0-100,
//     shared by every row. Bar length is finally comparable — which is the one
//     thing the grid could never do and the first thing anyone tries to do
//     with a ranked list.
//   · ONLY THE OUTLIERS SPEAK. The other nine inputs are not drawn; they are
//     TESTED, against tonight's own slate, and a hitter's row names only the
//     inputs where he is genuinely away from the middle of it. A column that
//     says "this man is average here" carried no information in the grid and
//     carries none here, so it is not drawn at all.
//   · REAL NUMBERS. Every chip prints the published value in its own units —
//     .231 is .231, 1.22 is 1.22 — with its distance from the slate median
//     beside it. Nothing is rescaled to fit a picture.
//
// The comparison is against the MEDIAN and the median absolute deviation of
// the pool being ranked, not the mean and standard deviation. A slate has
// genuine outliers in it every night — that is the point of the board — and a
// mean would let the outliers move the very baseline they are being measured
// against.

const med = (xs) => {
  const a = xs.filter((v) => Number.isFinite(v)).sort((x, y) => x - y)
  if (!a.length) return null
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

// Median absolute deviation, scaled to be comparable with a standard
// deviation on normal-ish data (the 1.4826 is the usual consistency constant).
// Falls back to null when the pool is degenerate, and a null MAD simply means
// no chip earns a place on that input rather than a divide-by-zero.
const mad = (xs, m) => {
  if (m == null) return null
  const d = med(xs.filter((v) => Number.isFinite(v)).map((v) => Math.abs(v - m)))
  return d && d > 0 ? d * 1.4826 : null
}

// How far from the middle a value has to sit before it is worth saying out
// loud. 0.9 robust deviations is deliberately not a significance test — it is
// a NOTICEABILITY threshold, and the footer says so. Two chips up, one down:
// enough to characterise a bat, not enough to become a second table.
const NOTABLE = 0.9
const MAX_UP = 2
const MAX_DOWN = 1

export default function ProfileBars({
  rows = [],
  inputs = [],
  scoreLabel = 'Score',
  title,
  caption,
  onRowClick,
  max = 15,
}) {
  const shown = useMemo(() => rows.filter((r) => r && Number.isFinite(r.score)).slice(0, max), [rows, max])

  // Baselines come from EVERY row handed in, not just the fifteen drawn. The
  // top fifteen of a board are by construction the wrong sample to ask "what
  // is normal tonight" — they are the tail.
  const base = useMemo(() => {
    const out = {}
    inputs.forEach((f) => {
      const xs = rows.map((r) => r.values?.[f.key]).filter((v) => Number.isFinite(v))
      const m = med(xs)
      out[f.key] = { m, s: mad(xs, m) }
    })
    return out
  }, [rows, inputs])

  const ref = useRef(null)
  const [w, setW] = useState(900)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const read = () => setW(Math.max(320, Math.round(el.clientWidth || 900)))
    read()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (shown.length < 2) return null

  const narrow = w < 720
  const nameW = narrow ? 108 : 150
  const barW = narrow ? Math.max(70, w - nameW - 150) : Math.max(120, Math.round(w * 0.26))
  const good = verdictInk(true).color
  const bad = verdictInk(false).color
  const top = shown[0].score || 100

  const chipsFor = (r) => {
    const scored = inputs.map((f) => {
      const v = r.values?.[f.key]
      const b = base[f.key]
      if (!Number.isFinite(v) || !b || b.m == null || !b.s) return null
      const z = ((v - b.m) / b.s) * (f.invert ? -1 : 1)
      return { f, v, z, m: b.m }
    }).filter(Boolean)
    const up = scored.filter((x) => x.z >= NOTABLE).sort((a, b) => b.z - a.z).slice(0, MAX_UP)
    const down = scored.filter((x) => x.z <= -NOTABLE).sort((a, b) => a.z - b.z).slice(0, MAX_DOWN)
    return [...up.map((x) => ({ ...x, dir: 1 })), ...down.map((x) => ({ ...x, dir: -1 }))]
  }

  return (
    <section ref={ref} style={{
      border: `1px solid ${C.border}`, borderRadius: 11, padding: '10px 12px 9px',
      background: C.bg2, marginBottom: 11,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <b style={{ fontSize: 11.5 }}>{title}</b>
        <span style={{ fontSize: 9, color: C.text3 }}>
          one shared 0–100 scale, so bar length is comparable · chips name only where he is away from tonight’s middle
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {shown.map((r, i) => {
          const chips = chipsFor(r)
          return (
            <div
              key={r.id ?? r.label ?? i}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '3px 4px', borderRadius: 6,
                cursor: onRowClick ? 'pointer' : 'default',
                background: i % 2 ? 'transparent' : `${C.border}22`,
              }}
            >
              <span style={{
                width: 16, textAlign: 'right', flexShrink: 0,
                fontFamily: NUM_FONT, fontSize: 9, color: C.text3,
              }}>{i + 1}</span>
              <span style={{
                width: nameW, flexShrink: 0, fontSize: 10.5, fontWeight: 700,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{r.label}</span>
              {/* THE BAR. One domain for every row — this is the whole reason
                  the panel exists, so it is drawn plainly and nothing else on
                  the row is allowed to be louder than it. */}
              <span style={{
                width: barW, flexShrink: 0, height: 13, borderRadius: 3,
                background: `${C.border}55`, position: 'relative', overflow: 'hidden',
              }}>
                <span style={{
                  position: 'absolute', inset: 0, width: `${Math.max(2, Math.min(100, (r.score / (top || 100)) * 100))}%`,
                  background: `linear-gradient(90deg, ${C.orange}cc, ${C.orange}66)`,
                  borderRadius: 3,
                }} />
              </span>
              <span style={{
                width: 34, flexShrink: 0, fontFamily: NUM_FONT, fontSize: 10,
                fontWeight: 800, color: C.orange,
              }}>{r.score.toFixed(1)}</span>
              <span style={{ display: 'flex', gap: 4, flexWrap: 'nowrap', overflow: 'hidden' }}>
                {chips.length === 0 && (
                  <span style={{ fontSize: 9, color: C.text3, fontStyle: 'italic' }}>
                    nothing away from the middle
                  </span>
                )}
                {chips.map((c) => {
                  const tone = c.dir > 0 ? good : bad
                  return (
                    <span key={c.f.key}
                      title={`${c.f.title || c.f.label}\n${c.f.label} ${c.f.fmt(c.v)} — tonight's slate median is ${c.f.fmt(c.m)}. ${Math.abs(c.z).toFixed(1)} robust deviations ${c.dir > 0 ? 'above' : 'below'} it${c.f.invert ? ' (this input is inverted: lower is better for the bat)' : ''}.`}
                      style={{
                        fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 800,
                        padding: '1.5px 6px', borderRadius: 5, whiteSpace: 'nowrap',
                        border: `1px solid ${tone}44`, background: `${tone}12`, color: tone,
                      }}>
                      {c.dir > 0 ? '▲' : '▼'} {c.f.label} {c.f.fmt(c.v)}
                    </span>
                  )
                })}
              </span>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 8, fontSize: 8.5, color: C.text3, lineHeight: 1.55 }}>
        The bar is {scoreLabel} on one 0–100 scale shared by every row, so a bar twice as long is twice
        the score — the grid this replaced scaled every column separately and said so in its own caption.
        The chips are the other {inputs.length} published inputs, not drawn but tested: a chip appears only
        where a hitter sits at least {NOTABLE} robust deviations from the median of the whole ranked pool
        tonight, at most {MAX_UP} above and {MAX_DOWN} below. Median and MAD rather than mean and standard
        deviation, because a slate has real outliers in it and a mean lets them move the baseline they are
        being measured against. Every chip prints the published value in its own units — nothing here is
        rescaled to fit the picture. It is a noticeability threshold, not a significance test.
        {caption ? ` ${caption}` : ''}
      </div>
    </section>
  )
}
