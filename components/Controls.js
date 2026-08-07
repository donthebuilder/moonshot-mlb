'use client'
import { useEffect, useMemo, useRef } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { teamOf } from '../lib/player'

// SEARCH + TEAM FILTER, dressed up (2026-08-08, "make the dropdown and
// search bar cooler"). The search wears a 🔍, glows ember on focus (rules in
// MobileCSS — inline styles can't do :focus), clears with one ✕, and the
// "/" key focuses it from anywhere. The team dropdown loses the native-grey
// look: appearance none, custom ▾, and it lights orange while a team is
// actually filtering so an active filter can't hide.

export default function Controls({ query, setQuery, team, setTeam, players }) {
  const inputRef = useRef(null)

  const teams = useMemo(() => {
    const s = new Set()
    players.forEach((p) => {
      const t = teamOf(p)
      if (t) s.add(t)
    })
    return Array.from(s).sort()
  }, [players])

  // "/" focuses search from anywhere (ignored while typing in any field)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const filtering = !!team

  return (
    <div
      className="dash-controls"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 170px',
        gap: 8,
        margin: '14px 0 14px',
      }}
    >
      {/* search */}
      <div style={{ position: 'relative', minWidth: 0 }}>
        <span style={{
          position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
          fontSize: 13, opacity: 0.55, pointerEvents: 'none',
        }}>🔍</span>
        <input
          ref={inputRef}
          type="search"
          className="moon-search"
          placeholder="Search player, team, or pitcher…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            background: C.bg3,
            border: `1px solid ${query ? 'rgba(249,115,22,.45)' : C.border2}`,
            color: C.text,
            borderRadius: 999,
            padding: '9px 64px 9px 34px',
            fontSize: 12,
            outline: 'none',
            width: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
            transition: 'border-color .15s, box-shadow .15s',
          }}
        />
        {query ? (
          <button
            onClick={() => { setQuery(''); inputRef.current?.focus() }}
            title="Clear search"
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(249,115,22,.14)', border: '1px solid rgba(249,115,22,.4)',
              color: C.orange, borderRadius: 999, width: 20, height: 20, lineHeight: 1,
              fontSize: 11, fontWeight: 800, cursor: 'pointer', padding: 0,
            }}
          >✕</button>
        ) : (
          <span className="l5col" style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            fontSize: 9, fontFamily: NUM_FONT, color: C.text3,
            border: `1px solid ${C.border2}`, borderRadius: 5, padding: '1px 6px',
            pointerEvents: 'none',
          }}>/</span>
        )}
      </div>

      {/* team dropdown */}
      <div style={{ position: 'relative', minWidth: 0 }}>
        <select
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          className="moon-select"
          title={filtering ? `Showing ${team} only — pick "All teams" to release` : 'Filter every board to one team'}
          style={{
            appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
            background: filtering
              ? 'linear-gradient(135deg, rgba(249,115,22,.16), rgba(249,115,22,.05))'
              : C.bg3,
            border: `1px solid ${filtering ? 'rgba(249,115,22,.55)' : C.border2}`,
            color: filtering ? C.orange : C.text,
            fontWeight: filtering ? 800 : 500,
            borderRadius: 999,
            padding: '9px 30px 9px 14px',
            fontSize: 12,
            fontFamily: NUM_FONT,
            outline: 'none',
            width: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
            cursor: 'pointer',
            transition: 'border-color .15s, background .15s',
          }}
        >
          <option value="">⚾ All teams</option>
          {teams.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <span style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          fontSize: 10, color: filtering ? C.orange : C.text3, pointerEvents: 'none',
        }}>▾</span>
      </div>
    </div>
  )
}
