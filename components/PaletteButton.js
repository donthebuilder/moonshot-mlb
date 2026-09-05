'use client'
import { useEffect, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { hydrateRamp, setRamp } from '../lib/palette'

// One colour language, available from every page. The old control exposed four
// competing heat-map experiments plus a full custom-ramp studio in the sticky
// header. On a phone that became a nearly full-screen settings sheet, and the
// names (Ember / Signal / Verdict) did not help somebody read the board.
//
// The Rundown already has the clearest colour system on the site, so this is a
// key for that system instead: four pick jobs, four stable hues. Heat maps stay
// on the original amber magnitude ramp, where dark means less and bright means
// more. No page can silently retain one of the retired red/green experiments.
const JOBS = [
  { key: 'HR', label: 'Home run', color: '#f97316' },
  { key: 'HIT', label: 'Base hit', color: '#a78bfa' },
  { key: 'HRR', label: 'Runs + RBI', color: '#22d3ee' },
  { key: 'CONTACT', label: 'Total bases', color: '#4ade80' },
]

export default function PaletteButton({ jobs = JOBS, accent = C.orange }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef(null)

  useEffect(() => {
    hydrateRamp()
    setRamp('ember')
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <button
        type="button"
        className="palette-key-button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="site-colour-key"
        title="Open the site colour key"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 8px', borderRadius: 8, cursor: 'pointer',
          background: open ? C.bg3 : 'transparent',
          border: `1px solid ${open ? accent : C.border}`,
        }}
      >
        <span aria-hidden="true" style={{ display: 'flex', width: 30, height: 12, borderRadius: 3, overflow: 'hidden' }}>
          {jobs.map((job) => <span key={job.key} style={{ flex: 1, background: job.color }} />)}
        </span>
        <span style={{ fontSize: 10, fontWeight: 800, color: C.text3, fontFamily: NUM_FONT }}>Key</span>
      </button>

      {open && (
        <div
          id="site-colour-key"
          className="palette-pop"
          role="dialog"
          aria-label="Site colour key"
          style={{
            position: 'fixed', zIndex: 90,
            // Sit below the measured sticky header so the sheet never covers
            // its own trigger (at 321px the old fixed 104px top did exactly
            // that, leaving outside-click/Escape as the only way to close it).
            top: 'calc(var(--hdr-h, 150px) + 6px)',
            left: 8, right: 8, width: 'auto',
            background: 'rgba(17,17,19,0.98)', backdropFilter: 'blur(14px)',
            border: `1px solid ${C.border2}`, borderRadius: 12,
            boxShadow: '0 18px 44px rgba(0,0,0,0.55)', padding: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
            <span style={{ fontSize: 11.5, fontWeight: 900, color: C.text }}>Colour key</span>
            <span style={{ marginLeft: 'auto', fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>same on every page</span>
          </div>
          <div className="site-colour-key-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {jobs.map((job) => (
              <div key={job.key} style={{
                display: 'flex', alignItems: 'center', gap: 7, minWidth: 0,
                padding: '7px 8px', borderRadius: 8,
                background: `${job.color}12`, border: `1px solid ${job.color}36`,
              }}>
                <span aria-hidden="true" style={{ width: 8, height: 24, borderRadius: 4, background: job.color, flexShrink: 0 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 9.5, fontWeight: 900, color: job.color, fontFamily: NUM_FONT }}>{job.key}</span>
                  <span style={{ display: 'block', fontSize: 10, color: C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.label}</span>
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.text3, lineHeight: 1.45 }}>
            Heat maps use Moonshot amber: <b style={{ color: C.text2 }}>darker = less</b>, <b style={{ color: C.orange }}>brighter = more</b>.
          </div>
        </div>
      )}
    </div>
  )
}
