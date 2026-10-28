'use client'
import { useMemo, useState } from 'react'
import FindBar from '../FindBar'
import { useLiveFetch } from '../../lib/useLiveFetch'
import { rankNumerology } from '../../lib/numerology/ranking'

// 🔢 THE NUMEROLOGY RANKING (2026-10-28, Donovan: "a numerology ranking, ranking everybody by most aligned ... maybe we even make a numerology
// score"). One table for every product's Numerology page: every player on the slate (the all-sports rows, /api/numerology/all), most lanes
// lined up first, rarer numbers breaking ties (lib/numerology/ranking.js). ALIGNED = how many lanes he is on; NUMBERS = the numbers they
// landed on; SCORE = 0-100, the day's most aligned man = 100. The product's own slate shows first; ALL SPORTS opens every slate at once.
// FOR FUN: a rank, never a chance, never graded, never part of a pick or any other score. A man missing a field (no birth date, no jersey)
// sits out the lanes that need it.
const SPORT_WORD = { mlb: 'MOONSHOT', nfl: 'TUDDY', nhl: 'LAMP', nba: 'BUCKETS' }

export default function NumerologyRanking({ sport, Table, C, NUM_FONT, accent, onOpenPlayer = null, onOpenTeam = null }) {
  const [all, setAll] = useState(false)
  const [q, setQ] = useState('')
  const [two, setTwo] = useState(false)
  const { data, error } = useLiveFetch('/api/numerology/all')
  const ranked = useMemo(() => rankNumerology(data?.rows), [data])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return ranked.filter((r) => (all || r.sport === sport) && (!two || r.n >= 2) && (!needle || `${r.name} ${r.team || ''}`.toLowerCase().includes(needle)))
      .map((r, i) => ({ ...r, _id: `${r.sport}-${r.pid}`, place: i + 1, sp: SPORT_WORD[r.sport] || r.sport.toUpperCase() }))
  }, [ranked, all, sport, q, two])
  if (error && !data) return null
  if (data && !ranked.some((r) => r.sport === sport) && !all && !ranked.length) return null
  const cols = [
    { key: 'place', label: '#', group: 'Rank', w: 36, heat: false, mono: true },
    { key: 'name', label: 'Player', group: 'Rank', w: 150, heat: false, bold: true, sticky: true, numeric: false, link: (r) => (onOpenPlayer && r.sport === sport ? () => onOpenPlayer(r.pid, r) : null) },
    { key: 'team', label: 'Tm', group: 'Rank', w: 48, heat: false, mono: true, numeric: false, ...(all ? {} : { teamMark: sport }), link: (r) => (onOpenTeam && r.sport === sport && r.team ? () => onOpenTeam(r.team) : null) },
    ...(all ? [{ key: 'sp', label: 'Sport', group: 'Rank', w: 76, heat: false, mono: true, numeric: false, dim: true }] : []),
    { key: 'n', label: 'ALIGNED', group: 'Numbers', w: 62, dp: 0, title: 'How many of his lanes line up with the day: name values, jersey, birthday, next number' },
    { key: 'shown', label: 'NUMBERS', group: 'Numbers', w: 150, heat: false, numeric: false, mono: true, title: 'The numbers his lanes landed on (🎂 = his birthday week)' },
    { key: 'score', label: 'SCORE', group: 'Numbers', w: 60, primary: true, scale: 'seq', domain: [0, 100], dp: 0, title: 'How many lanes line up, with rarer numbers breaking ties. The day’s most aligned man is 100. A rank, not a chance.' },
  ]
  return (
    <section aria-label="Numerology ranking" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, margin: '14px 0 10px', minWidth: 0 }}>
      <div style={{ color: C.text2, font: `900 12px/1.2 ${NUM_FONT}`, letterSpacing: '.08em' }}>NUMEROLOGY RANKING · MOST ALIGNED FIRST</div>
      <div style={{ color: C.text3, font: `600 11px/1.45 ${NUM_FONT}` }}>For fun, not a pick. Everyone on the slate, most lanes lined up first; rarer numbers break ties.</div>
      <FindBar query={q} setQuery={setQ} placeholder="Search a player or team…" searchLabel="Search the ranking" accent={accent} C={C} NUM_FONT={NUM_FONT} style={{ margin: '2px 0 0' }}
        toggles={[
          { key: 'all', label: 'All sports', on: all, onChange: setAll, title: 'Every product’s slate at once' },
          { key: 'two', label: '2+ aligned', on: two, onChange: setTwo, title: 'Only men on two or more lanes' },
        ]} />
      {!data ? <div style={{ fontSize: 12, color: C.text3 }}>Reading the slate…</div>
        : rows.length ? <Table rows={rows} columns={cols} heatMode="primary" maxRows={10} maxHeight={9999}
            caption={`${rows.length} players${all ? ' across every slate' : ' on today’s slate'}, ranked by score. ALIGNED = lanes he is on; SCORE = lanes lined up, rarer numbers break ties. For fun.`} />
          : <div style={{ fontSize: 12, color: C.text3 }}>No one matches.</div>}
    </section>
  )
}
