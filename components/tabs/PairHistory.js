'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { arr, obj, n, clean } from '../../lib/player'
import { PanelTitle, Empty, inputStyle, selectStyle, Chip } from '../ui'

// Pair History — which two hitters have gone deep on the same day, all season.
//
// This board didn't exist in the Next.js build; it came in on the Streamlit
// side. The payload is pair_history_summary.json (top 350 pairs), and the two
// numbers that matter are repeat_count (how many separate days they both
// homered) and same_game_hr_count (how many of those were the SAME game --
// far rarer, and the only version of this that's actually a correlated bet).

const BUCKETS = ['All', 'Last 7', 'Last 14', 'Last 30', 'Older']

function heat(v, lo, hi) {
  // Same one-hue ramp as everywhere else: brightness reads as magnitude, so
  // you don't have to decode a rainbow to find the live rows.
  const RAMP = ['#06251a', '#0b4b30', '#12783f', '#2f9e52', '#4cb96a', '#b7f7c9']
  const span = hi - lo
  const pos = span <= 0 ? 0 : Math.max(0, Math.min(1, (v - lo) / span))
  return RAMP[Math.min(RAMP.length - 1, Math.floor(pos * RAMP.length))]
}

const inkFor = (bg) => (bg === '#b7f7c9' || bg === '#4cb96a' ? '#06281a' : '#e8ecef')

function Cell({ value, lo, hi, width = 58 }) {
  const bg = heat(n(value, 0), lo, hi)
  return (
    <td style={{
      background: bg, color: inkFor(bg), fontFamily: NUM_FONT, fontSize: 11,
      fontWeight: 700, textAlign: 'center', padding: '6px 4px', width,
      borderRight: `1px solid ${C.bg}`,
    }}>{n(value, 0)}</td>
  )
}

export default function PairHistory({ summary, onPlayerClick }) {
  const [query, setQuery] = useState('')
  const [bucket, setBucket] = useState('All')
  const [sameGameOnly, setSameGameOnly] = useState(false)
  const [limit, setLimit] = useState(50)

  const meta = obj(summary)
  const pairs = arr(meta.top_pairs)

  const rows = useMemo(() => {
    const q = query.toLowerCase().trim()
    return pairs
      .filter((p) => {
        const names = `${clean(p?.player_1, '')} ${clean(p?.player_2, '')}`.toLowerCase()
        if (q && !names.includes(q)) return false
        if (bucket !== 'All' && clean(p?.last_hit_bucket, '') !== bucket) return false
        if (sameGameOnly && !p?.same_game_flag) return false
        return true
      })
      .sort((a, b) => n(b?.pair_score, 0) - n(a?.pair_score, 0))
      .slice(0, limit)
  }, [pairs, query, bucket, sameGameOnly, limit])

  if (!pairs.length) {
    return <Empty text="No pair history published yet — pair_history_summary.json hasn't been written." />
  }

  const maxRepeat = Math.max(...pairs.map((p) => n(p?.repeat_count, 0)), 1)
  const maxSameGame = Math.max(...pairs.map((p) => n(p?.same_game_hr_count, 0)), 1)
  const maxBoost = Math.max(...pairs.map((p) => n(p?.history_boost, 0)), 1)

  return (
    <div>
      <PanelTitle
        title="Pair History"
        sub={`${meta.pair_count ?? pairs.length} pairs · ${meta.hr_event_count ?? '—'} HR events · ${clean(meta.start_date, '')} → ${clean(meta.end_date, '')}`}
        right={<span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{rows.length} shown</span>}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0 12px' }}>
        <input
          style={{ ...inputStyle(), flex: '1 1 220px' }}
          placeholder="Search either hitter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select style={selectStyle()} value={bucket} onChange={(e) => setBucket(e.target.value)}>
          {BUCKETS.map((b) => <option key={b} value={b}>{b === 'All' ? 'Any recency' : b}</option>)}
        </select>
        <select style={selectStyle()} value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
          {[25, 50, 100, 350].map((v) => <option key={v} value={v}>Top {v}</option>)}
        </select>
        <button
          onClick={() => setSameGameOnly((v) => !v)}
          style={{
            ...selectStyle(),
            cursor: 'pointer',
            color: sameGameOnly ? '#06281a' : C.text2,
            background: sameGameOnly ? C.green : C.bg2,
            borderColor: sameGameOnly ? C.green : C.border,
            fontWeight: 700,
          }}
        >Same game only</button>
      </div>

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: C.bg2 }}>
              {['Pair', 'Days', 'Same game', 'Boost', 'Score', 'Last', 'Recency'].map((h, i) => (
                <th key={h} style={{
                  fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase',
                  color: C.text3, fontWeight: 700, padding: '8px 8px',
                  textAlign: i === 0 ? 'left' : 'center',
                  borderBottom: `1px solid ${C.border}`,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const players = arr(p?.players)
              return (
                <tr key={clean(p?.pair_key, Math.random())} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '7px 8px' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>
                      {players.map((pl, i) => (
                        <span key={i}>
                          {i > 0 && <span style={{ color: C.text3, fontWeight: 400 }}>  +  </span>}
                          <span
                            onClick={() => onPlayerClick?.(pl)}
                            style={{ cursor: onPlayerClick ? 'pointer' : 'default' }}
                          >{clean(pl?.name, '')}</span>
                          <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}> {clean(pl?.team, '')}</span>
                        </span>
                      ))}
                    </div>
                  </td>
                  <Cell value={p?.repeat_count} lo={0} hi={maxRepeat} />
                  <Cell value={p?.same_game_hr_count} lo={0} hi={maxSameGame} />
                  <Cell value={p?.history_boost} lo={0} hi={maxBoost} />
                  <td style={{
                    fontFamily: NUM_FONT, fontSize: 12, fontWeight: 800,
                    textAlign: 'center', color: C.text, padding: '6px 4px',
                  }}>{n(p?.pair_score, 0)}</td>
                  <td style={{
                    fontFamily: NUM_FONT, fontSize: 10.5, textAlign: 'center',
                    color: C.text2, padding: '6px 6px', whiteSpace: 'nowrap',
                  }}>{clean(p?.last_same_day_hr, '—')}</td>
                  <td style={{ textAlign: 'center', padding: '6px 6px' }}>
                    <Chip color={p?.recent_pair_hit ? C.green : C.text3}>
                      {clean(p?.last_hit_bucket, '—')}
                    </Chip>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 10.5, color: C.text3, marginTop: 10, lineHeight: 1.6 }}>
        <strong style={{ color: C.text2 }}>Days</strong> is how many separate dates both hitters homered.{' '}
        <strong style={{ color: C.text2 }}>Same game</strong> counts only the ones in the same ballpark on
        the same night — much rarer, and the only version of this that's a genuinely correlated bet.
        Everything else is two independent events that happened to land on one date, so treat a big Days
        number with a zero next to it as coincidence, not signal.
      </div>
    </div>
  )
}
