'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { teamOf } from '../lib/player'
import { useSpotlight, SPOT_FIELDS, spotText } from '../lib/spotlight'

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
      <SpotlightControl />
        <span style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          fontSize: 10, color: filtering ? C.orange : C.text3, pointerEvents: 'none',
        }}>▾</span>
      </div>
    </div>
  )
}

// ✨ THE SPOTLIGHT BUILDER (2026-08-15). Lives in the control row so it is on
// every tab — "spot him site wide" only works if the switch is site-wide too.
// A FILTER hides what fails; this leaves every page whole and makes matches
// glow, because the non-matches are the context that makes a match readable.
export function SpotlightControl() {
  const { conf, update } = useSpotlight()
  const [open, setOpen] = useState(false)
  const [field, setField] = useState(SPOT_FIELDS[0].key)
  const [op, setOp] = useState('>=')
  const [val, setVal] = useState('')

  const add = () => {
    const num = Number(val)
    if (!Number.isFinite(num)) return
    update({ on: true, rules: [...conf.rules, { field, op, val: num }] })
    setVal('')
  }

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((v) => !v)} title={conf.on && conf.rules.length
        ? `Spotlighting: ${spotText(conf)} — matches glow on every board`
        : 'Set a rule (e.g. HR score ≥ 80) and every player who meets it glows, site-wide'}
        style={{
          fontFamily: NUM_FONT, fontSize: 10, fontWeight: 800, cursor: 'pointer',
          padding: '6px 12px', borderRadius: 999, whiteSpace: 'nowrap',
          border: `1px solid ${conf.on && conf.rules.length ? '#FCD34D' : C.border}`,
          background: conf.on && conf.rules.length ? 'rgba(252,211,77,.12)' : 'transparent',
          color: conf.on && conf.rules.length ? '#FCD34D' : C.text3,
        }}>
        ✨ Spotlight{conf.on && conf.rules.length ? ` (${conf.rules.length})` : ''}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, zIndex: 70, marginTop: 5,
          background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11,
          padding: '10px 12px', minWidth: 280, boxShadow: '0 12px 30px rgba(0,0,0,.5)',
        }}>
          <div style={{ fontSize: 9.5, color: C.text2, lineHeight: 1.5, marginBottom: 7 }}>
            Everyone who meets <b>every</b> rule glows on every board. Saved on this device.
          </div>
          {conf.rules.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontFamily: NUM_FONT, fontSize: 10, color: '#FCD34D', flex: 1 }}>
                {(SPOT_FIELDS.find((f) => f.key === r.field)?.label) || r.field} {r.op} {r.val}
              </span>
              <button onClick={() => update({ ...conf, rules: conf.rules.filter((_, j) => j !== i) })}
                style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', fontSize: 11 }}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 6 }}>
            <select value={field} onChange={(e) => setField(e.target.value)} style={{
              background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 7,
              fontSize: 10, padding: '4px 5px', maxWidth: 118,
            }}>
              {SPOT_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
            <select value={op} onChange={(e) => setOp(e.target.value)} style={{
              background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 7,
              fontSize: 10, padding: '4px 4px',
            }}>
              <option value=">=">≥</option>
              <option value="<=">≤</option>
            </select>
            <input value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="80" inputMode="decimal" style={{
                width: 54, background: C.bg, color: C.text, border: `1px solid ${C.border}`,
                borderRadius: 7, fontSize: 10.5, padding: '4px 7px', fontFamily: NUM_FONT, outline: 'none',
              }} />
            <button onClick={add} style={{
              fontFamily: NUM_FONT, fontSize: 10, fontWeight: 800, cursor: 'pointer',
              border: '1px solid #FCD34D66', background: 'rgba(252,211,77,.12)', color: '#FCD34D',
              borderRadius: 7, padding: '4px 10px',
            }}>add</button>
          </div>
          {conf.rules.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <button onClick={() => update({ ...conf, on: !conf.on })} style={{
                fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 800, cursor: 'pointer',
                border: `1px solid ${conf.on ? '#FCD34D' : C.border}`, borderRadius: 999, padding: '3px 10px',
                background: conf.on ? 'rgba(252,211,77,.12)' : 'transparent',
                color: conf.on ? '#FCD34D' : C.text3,
              }}>{conf.on ? 'on' : 'off'}</button>
              <button onClick={() => update({ on: false, rules: [] })} style={{
                background: 'none', border: 'none', color: C.text3, cursor: 'pointer', fontSize: 9.5,
                textDecoration: 'underline', textDecorationStyle: 'dotted',
              }}>clear all</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

