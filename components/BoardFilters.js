'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, nameOf, teamOf, oppOf, clean } from '../lib/player'
import { isAligned } from '../lib/scoring'

// Shared filter bar for the ranked boards.
//
// The boards were a fixed top-N of one score and nothing else, so they showed
// the same faces every night — which is the complaint. Everything here narrows
// the pool BEFORE the ranking, so a filtered board surfaces hitters the
// unfiltered one buries rather than just hiding rows off the bottom.
//
// Every field used is verified on the live slate:
//   hrw_score            143/143      recent_ev            143/143
//   weak_spot_flag       present      pitch_type_match_score present
//   recent_ideal_hr_contact 143/143   pitcher_hr9          143/143
//   bats                 143/143      season_pa            143/143

export const CATEGORIES = [
  { key: 'weak',    label: '★ Weak spot',   test: (p) => p?.weak_spot_flag === true },
  { key: 'edge',    label: '🎯 Pitch edge',  test: (p) => n(p?.pitch_type_match_score, 0) > 0 },
  { key: 'aligned', label: '◆ Aligned',     test: (p) => isAligned(p) },
  { key: 'hot',     label: '🔥 L5 HR',       test: (p) => n(p?.last5_hr, 0) > 0 },
  { key: 'due',     label: '⏳ Due tag',     test: (p) => /due/i.test(clean(p?.hr_due_tag, '')) },
  { key: 'softarm', label: '💣 Arm ≥1.4',    test: (p) => n(p?.pitcher_hr9, 0) >= 1.4 },
  { key: 'confirmed', label: '✓ Lineup set', test: (p) => p?.lineup_confirmed === true },
]

const HAND = [
  { key: 'all', label: 'All bats' },
  { key: 'L',   label: 'LHB' },
  { key: 'R',   label: 'RHB' },
]

export function useBoardFilter(players) {
  const [hrwMin, setHrwMin] = useState(0)
  const [hrwMax, setHrwMax] = useState(100)
  const [cats, setCats] = useState([])
  const [catMode, setCatMode] = useState('any')   // any | all
  const [hand, setHand] = useState('all')
  const [minEV, setMinEV] = useState(0)
  const [minPA, setMinPA] = useState(0)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    return players.filter((p) => {
      const hrw = n(p?.hrw_score, 0)
      if (hrw < hrwMin || hrw > hrwMax) return false
      if (hand !== 'all' && clean(p?.bats, '').toUpperCase().slice(0, 1) !== hand) return false
      if (minEV > 0 && n(p?.recent_ev, 0) < minEV) return false
      if (minPA > 0 && n(p?.season_pa, 0) < minPA) return false
      if (cats.length) {
        const tests = CATEGORIES.filter((c) => cats.includes(c.key))
        const hits = tests.filter((c) => c.test(p)).length
        // "any" is a union — widen the net. "all" is an intersection — the
        // hitters that clear every box, usually a very short list.
        if (catMode === 'all' ? hits < tests.length : hits === 0) return false
      }
      if (q && !`${nameOf(p)} ${teamOf(p)} ${oppOf(p)} ${clean(p?.pitcher_name, '')}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [players, hrwMin, hrwMax, cats, catMode, hand, minEV, minPA, query])

  const active = hrwMin > 0 || hrwMax < 100 || cats.length > 0 || hand !== 'all' || minEV > 0 || minPA > 0 || query
  const reset = () => {
    setHrwMin(0); setHrwMax(100); setCats([]); setCatMode('any')
    setHand('all'); setMinEV(0); setMinPA(0); setQuery('')
  }

  const state = {
    hrwMin, setHrwMin, hrwMax, setHrwMax, cats, setCats, catMode, setCatMode,
    hand, setHand, minEV, setMinEV, minPA, setMinPA, query, setQuery, active, reset,
  }
  return { filtered, state }
}

const lbl = { fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }
const chip = (on, col = C.orange) => ({
  padding: '3px 9px', fontSize: 10, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
  fontFamily: NUM_FONT,
  border: `1px solid ${on ? col : C.border}`,
  background: on ? `${col}20` : 'transparent',
  color: on ? col : C.text3,
})

export default function BoardFilters({ state, total, shown }) {
  const {
    hrwMin, setHrwMin, hrwMax, setHrwMax, cats, setCats, catMode, setCatMode,
    hand, setHand, minEV, setMinEV, minPA, setMinPA, query, setQuery, active, reset,
  } = state

  const toggleCat = (k) => setCats((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]))

  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: '10px 13px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ minWidth: 190 }}>
          <div style={lbl}>HRW band {hrwMin}–{hrwMax}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}>
            <input type="range" min={0} max={100} step={1} value={hrwMin}
              onChange={(e) => setHrwMin(Math.min(Number(e.target.value), hrwMax))}
              style={{ flex: 1, accentColor: C.orange }} />
            <input type="range" min={0} max={100} step={1} value={hrwMax}
              onChange={(e) => setHrwMax(Math.max(Number(e.target.value), hrwMin))}
              style={{ flex: 1, accentColor: C.orange }} />
          </div>
        </div>

        <div>
          <div style={lbl}>Bats</div>
          <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
            {HAND.map((h) => (
              <button key={h.key} onClick={() => setHand(h.key)} style={chip(hand === h.key)}>{h.label}</button>
            ))}
          </div>
        </div>

        <div style={{ minWidth: 130 }}>
          <div style={lbl}>Min recent EV {minEV || '—'}</div>
          <input type="range" min={0} max={100} step={1} value={minEV}
            onChange={(e) => setMinEV(Number(e.target.value))}
            style={{ width: '100%', accentColor: C.orange }} />
        </div>

        <div style={{ minWidth: 120 }}>
          <div style={lbl}>Min season PA {minPA || '—'}</div>
          <input type="range" min={0} max={600} step={10} value={minPA}
            onChange={(e) => setMinPA(Number(e.target.value))}
            style={{ width: '100%', accentColor: C.orange }} />
        </div>

        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={lbl}>Search</div>
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="name, team, pitcher…"
            style={{
              width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7,
              padding: '5px 10px', fontSize: 11, color: C.text, outline: 'none', fontFamily: NUM_FONT,
              marginTop: 3,
            }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginTop: 9 }}>
        <span style={lbl}>Categories</span>
        {CATEGORIES.map((c) => (
          <button key={c.key} onClick={() => toggleCat(c.key)} style={chip(cats.includes(c.key))}>{c.label}</button>
        ))}
        {cats.length > 1 && (
          <button onClick={() => setCatMode((m) => (m === 'any' ? 'all' : 'any'))}
            title="Any = a hitter clearing at least one box. All = clearing every box."
            style={chip(true, catMode === 'all' ? '#FCD34D' : C.orange)}>
            match {catMode === 'all' ? 'ALL' : 'ANY'}
          </button>
        )}
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginLeft: 'auto' }}>
          {shown} of {total}
        </span>
        {active && (
          <button onClick={reset} style={{ ...chip(false), border: `1px dashed ${C.border2}` }}>Reset</button>
        )}
      </div>

      {shown === 0 && (
        <div style={{ fontSize: 10, color: C.orange, marginTop: 7 }}>
          Nothing clears this filter. With <b>match ALL</b> that happens fast — the categories are
          rarer than they look, and requiring three at once usually leaves nobody.
        </div>
      )}
    </div>
  )
}
