'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { RAMP_CHIPS } from './Heatmap'

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

// 2026-08-16 — FOUR GRADIENT TILES BECAME FOUR SENTENCES.
//
// This used to be a flex row of four coloured, gradient-filled cards. It was
// the last tile row left on the site after the quiet-style pass, and it broke
// the house rule twice over: tiles lose to sentences, and a panel whose whole
// job is to say "here is how to read this site" should not itself be the
// loudest thing on the page. Same four steps, same four destinations, same
// words — one flowing paragraph per step, the tab name is the link, and the
// colour is spent on the step name only.
//
// Destinations updated for the nine-tab merge at the same time: Track record
// is a Results view now, not its own tab, so the copy says so.
const STEPS = [
  // 2026-09-03: this said "is The Four, immediately below". The Four came off
  // this page in the same pass — it is the whole of the Picks tab and was
  // being rendered here a second time — so the sentence was pointing at
  // nothing. Copy that names a section has to move when the section does.
  { n: 1, title: 'Tonight’s picks', color: '#f97316', link: 'bot', linkWord: 'Picks',
    body: 'is The Four — the bot’s best bat per category, three deep. If you only have a minute, that is the whole site.' },
  { n: 2, title: 'Rank the slate', color: '#FCD34D', link: 'board', linkWord: 'Boards',
    body: 'ranks every hitter tonight, one board per bet type, with Power and Patterns alongside them. A brighter cell is stronger for the hitter, scaled to tonight and nothing else. Click any name for his full breakdown.' },
  { n: 3, title: 'Check the matchup', color: '#22d3ee', link: 'games', linkWord: 'Games',
    body: 'opens each game in place — its read, its lineups, the head-to-head and its picks — and Pitchers ranks every starter by how attackable he is.' },
  { n: 4, title: 'See what worked', color: '#4ade80', link: 'results', linkWord: 'Results',
    body: 'grades every pick against its own job, night by night, and its Track record view shows who actually delivers when the bot names him.' },
]

const LEGEND = [
  { sym: '★', label: 'weak lineup spot vs tonight’s arm' },
  { sym: '🤖', label: 'a designated bot pick' },
  { sym: '🧩', label: 'aligned signals' },
  { sym: 'AVOID', label: 'model expects no HR (score capped)' },
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
      background: C.bg2,
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

      {/* One line per step. The step number is a small dot of its colour, the
          destination is a real link inside the sentence, and nothing is
          boxed — read it top to bottom and it is the site's workflow. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {STEPS.map((s) => (
          <div key={s.title} style={{ display: 'flex', gap: 9, alignItems: 'baseline' }}>
            <span style={{
              width: 16, height: 16, borderRadius: '50%', background: `${s.color}22`,
              border: `1px solid ${s.color}66`, color: s.color,
              fontSize: 9.5, fontWeight: 900, fontFamily: NUM_FONT,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transform: 'translateY(2px)',
            }}>{s.n}</span>
            <div style={{ fontSize: 11.5, color: C.text2, lineHeight: 1.65, minWidth: 0 }}>
              <b style={{ color: s.color, fontWeight: 800 }}>{s.title}</b>{' — '}
              {s.link ? (
                <button
                  onClick={() => onNavigate?.(s.link)}
                  style={{
                    background: 'none', border: 'none', padding: 0, font: 'inherit',
                    color: C.text, fontWeight: 800, cursor: 'pointer',
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >{s.linkWord}</button>
              ) : null}
              {s.link ? ' ' : ''}{s.body}
            </div>
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
            {RAMP_CHIPS.map((c) => (
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
          Hover any number for what it means · full glossary lives in <b style={{ color: C.text2 }}>How this works</b>
        </span>
      </div>
    </div>
  )
}
