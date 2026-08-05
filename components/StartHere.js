'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { ORANGE_RAMP } from './Heatmap'

// START HERE — the visual answer to "what am I looking at".
//
// The request behind this: someone suggested the Guide should be the first
// page. The instinct is right (new visitors are lost) and the cure is wrong —
// the Guide is a wall of text, and nobody's first click should be a glossary.
// So the landing tab gets this instead: four clickable steps that ARE the
// site's actual workflow, a legend for the symbols that appear everywhere,
// and one line about tooltips. Show, don't lecture.
//
// Dismissible, and the dismissal persists per device (same localStorage the
// watchlist already uses). A "?" chip stays behind so it can be reopened —
// hiding help permanently behind nothing is how help dies.

const KEY = 'moonshot_start_here_v1'

const STEPS = [
  { icon: '🎯', title: 'Tonight’s picks', color: '#f97316',
    body: 'The Four, right below — the bot’s best bat per category, three deep. Start here if you only have a minute.',
    tab: null },
  { icon: '📊', title: 'Rank the slate', color: '#FCD34D',
    body: 'HR Board ranks every hitter. Brighter cell = stronger for the hitter, every column scaled to tonight. Click any name for his full breakdown.',
    tab: 'board' },
  { icon: '⚾', title: 'Check the matchup', color: '#22d3ee',
    body: 'Games shows each game’s five designated picks. Pitchers ranks every starter by how attackable he is.',
    tab: 'games' },
  { icon: '✅', title: 'See what worked', color: '#4ade80',
    body: 'Results grades every pick against its own job nightly, and Track record shows who actually delivers when picked.',
    tab: 'results' },
]

const LEGEND = [
  { sym: '★', label: 'weak lineup spot vs tonight’s arm' },
  { sym: '🤖', label: 'a designated bot pick' },
  { sym: '🧩', label: 'aligned signals' },
  { sym: '⛔', label: 'model expects no HR (score capped)' },
  { sym: '·', label: 'no data — not a zero' },
]

export default function StartHere({ onNavigate }) {
  const [open, setOpen] = useState(null) // null until we read storage — no flash

  useEffect(() => {
    try { setOpen(localStorage.getItem(KEY) !== 'dismissed') } catch { setOpen(true) }
  }, [])

  const dismiss = () => {
    setOpen(false)
    try { localStorage.setItem(KEY, 'dismissed') } catch { /* private mode */ }
  }
  const reopen = () => {
    setOpen(true)
    try { localStorage.removeItem(KEY) } catch { /* private mode */ }
  }

  if (open === null) return null

  if (!open) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <button
          onClick={reopen}
          title="Show the quick-start guide again"
          style={{
            fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 7,
            border: `1px solid ${C.border}`, background: 'transparent',
            color: C.text3, cursor: 'pointer', fontFamily: NUM_FONT,
          }}
        >? how to read this site</button>
      </div>
    )
  }

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.04))`,
      border: `1px solid ${C.border}`, borderRadius: 14,
      padding: '13px 15px', marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 900 }}>How to read this site</span>
        <span style={{ fontSize: 10, color: C.text3 }}>four steps, in the order that works</span>
        <button
          onClick={dismiss}
          style={{
            marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '3px 10px',
            borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent',
            color: C.text3, cursor: 'pointer',
          }}
        >Got it — hide this</button>
      </div>

      {/* Flex-grow so the four cards always fill the row, same trick as the
          Games pick cards. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {STEPS.map((s, i) => (
          <div
            key={s.title}
            onClick={() => s.tab && onNavigate?.(s.tab)}
            style={{
              flex: '1 1 210px', minWidth: 0,
              background: `linear-gradient(155deg, ${s.color}14, ${s.color}05)`,
              border: `1px solid ${s.color}3d`, borderRadius: 11,
              padding: '9px 12px',
              cursor: s.tab ? 'pointer' : 'default',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <span style={{
                width: 17, height: 17, borderRadius: '50%', background: s.color,
                color: '#1a0d02', fontSize: 10, fontWeight: 900, fontFamily: NUM_FONT,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>{i + 1}</span>
              <span style={{ fontSize: 12 }}>{s.icon}</span>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: s.color }}>{s.title}</span>
              {s.tab && <span style={{ marginLeft: 'auto', fontSize: 10, color: C.text3 }}>→</span>}
            </div>
            <div style={{ fontSize: 10, color: C.text2, lineHeight: 1.5 }}>{s.body}</div>
          </div>
        ))}
      </div>

      {/* The legend — the five marks that appear on every board, and the
          color rule that governs every heated cell on the site. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        marginTop: 10, paddingTop: 9, borderTop: `1px solid ${C.border}`,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'flex', borderRadius: 3, overflow: 'hidden' }}>
            {ORANGE_RAMP.map((c) => (
              <span key={c} style={{ width: 9, height: 11, background: c }} />
            ))}
          </span>
          <span style={{ fontSize: 9.5, color: C.text3 }}>
            brighter = stronger <b style={{ color: C.text2 }}>for the hitter</b>, scaled to tonight
          </span>
        </span>
        {LEGEND.map((l) => (
          <span key={l.sym} style={{ fontSize: 9.5, color: C.text3, whiteSpace: 'nowrap' }}>
            <b style={{ color: C.text2, fontFamily: NUM_FONT }}>{l.sym}</b> {l.label}
          </span>
        ))}
        <span style={{ fontSize: 9.5, color: C.text3 }}>
          Hover any number for what it means · full glossary lives in <b style={{ color: C.text2 }}>Guide</b>
        </span>
      </div>
    </div>
  )
}
