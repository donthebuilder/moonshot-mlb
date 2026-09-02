'use client'
import { C, NUM_FONT } from '../lib/theme'
import { freshness, windowLabel } from '../lib/freshness'

// ONE STAMP, EVERY SEASON-LONG SURFACE (2026-09-02, findings #35 and #37).
//
// Every archive page already printed its own range in small type. None said
// whether it was behind. This says both, in the same words and the same place
// on every page, so two of these surfaces can be compared honestly -- which
// was the actual complaint: they cover different stretches of the season and
// nothing told the reader that.
//
// It goes quiet when the page IS current: a chip that shouts on a healthy day
// is a chip people stop reading.
export default function FreshnessStamp({ from, to, count, unit = 'nights', generated = '', label = 'Archive' }) {
  const f = freshness(to)
  const win = windowLabel({ from, to, count, unit })
  const tone = !f.ok || f.tone === 'fresh' ? C.text3
    : f.tone === 'aging' ? C.yellow
      : f.tone === 'stale' ? C.orange : C.red

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
      border: `1px solid ${f.ok && f.tone !== 'fresh' ? `${tone}55` : C.border}`,
      background: f.ok && f.tone !== 'fresh' ? `${tone}12` : C.bg3,
      borderRadius: 999, padding: '4px 11px', margin: '0 0 10px',
    }}>
      <span style={{ font: `800 8.5px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: C.text3, textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ font: `700 9.5px/1 ${NUM_FONT}`, color: C.text2 }}>{win}</span>
      {f.ok && f.tone !== 'fresh' && (
        <span style={{ font: `900 9.5px/1 ${NUM_FONT}`, color: tone }}>
          ⚠ {f.phrase}
        </span>
      )}
      {generated ? (
        <span style={{ font: `700 8.5px/1 ${NUM_FONT}`, color: C.text3 }}>built {String(generated).slice(5)}</span>
      ) : null}
    </div>
  )
}
