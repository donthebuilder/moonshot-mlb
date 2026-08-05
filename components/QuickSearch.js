'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, teamOf, oppOf, hrScore, playerId } from '../lib/player'

// ⌘K QUICK SEARCH — jump to any player from anywhere.
//
// The site is player-centric but reaching a specific hitter still meant
// finding whichever board he's on and scanning. Cmd/Ctrl-K (or just "/")
// opens this from any tab; three letters and Enter opens his modal.
// Arrow keys move, Escape closes, top 8 shown.

export default function QuickSearch({ players = [], onPick }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      const inField = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setOpen(true); setQ(''); setSel(0)
      } else if (e.key === '/' && !inField && !open) {
        e.preventDefault(); setOpen(true); setQ(''); setSel(0)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30) }, [open])

  const norm = (s) => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')

  const hits = useMemo(() => {
    const k = norm(q).trim()
    if (k.length < 2) return []
    return players
      .filter((p) => norm(nameOf(p)).includes(k) || norm(teamOf(p)) === k)
      .sort((a, b) => hrScore(b) - hrScore(a))
      .slice(0, 8)
  }, [q, players])

  const pick = (p) => { setOpen(false); onPick?.(p) }

  if (!open) return null

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(3px)',
        display: 'flex', justifyContent: 'center', paddingTop: '14vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(480px, 92vw)', height: 'fit-content',
          background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14,
          boxShadow: '0 18px 60px rgba(0,0,0,0.6)', overflow: 'hidden',
        }}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(hits.length - 1, s + 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
            if (e.key === 'Enter' && hits[sel]) pick(hits[sel])
          }}
          placeholder="Jump to any player… (Esc to close)"
          style={{
            width: '100%', background: 'transparent', border: 'none',
            borderBottom: hits.length ? `1px solid ${C.border}` : 'none',
            padding: '13px 16px', fontSize: 14, color: C.text, outline: 'none',
            fontFamily: NUM_FONT,
          }}
        />
        {hits.map((p, i) => (
          <div
            key={playerId(p)}
            onClick={() => pick(p)}
            onMouseEnter={() => setSel(i)}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 8, padding: '9px 16px',
              cursor: 'pointer',
              background: i === sel ? 'rgba(249,115,22,.12)' : 'transparent',
              borderLeft: `3px solid ${i === sel ? C.orange : 'transparent'}`,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700 }}>{nameOf(p)}</span>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
              {teamOf(p)} vs {oppOf(p)}
            </span>
            {String(p?.game_pick_role || '').trim() && (
              <span style={{ fontSize: 9, color: C.orange, fontFamily: NUM_FONT, fontWeight: 800 }}>
                🤖 {String(p.game_pick_role).split('/')[0]}
              </span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: NUM_FONT, fontWeight: 800, color: C.orange }}>
              {hrScore(p).toFixed(0)}
            </span>
          </div>
        ))}
        {q.trim().length >= 2 && !hits.length && (
          <div style={{ padding: '10px 16px', fontSize: 11, color: C.text3 }}>
            Nobody on tonight&apos;s slate matches.
          </div>
        )}
      </div>
    </div>
  )
}
