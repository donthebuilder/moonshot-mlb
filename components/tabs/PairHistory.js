'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { arr, obj, n, clean, nameOf } from '../../lib/player'
import { PanelTitle, Empty, inputStyle, selectStyle } from '../ui'
import DenseTable from '../DenseTable'

// Pair History — which two hitters have gone deep on the same day, all season.
//
// This board didn't exist in the Next.js build; it came in on the Streamlit
// side. The payload is pair_history_summary.json (top 350 pairs), and the two
// numbers that matter are repeat_count (how many separate days they both
// homered) and same_game_hr_count (how many of those were the SAME game --
// far rarer, and the only version of this that's actually a correlated bet).

const BUCKETS = ['All', 'Last 7', 'Last 14', 'Last 30', 'Older']


export default function PairHistory({ summary, players = [], onPlayerClick }) {
  const [query, setQuery] = useState('')
  const [bucket, setBucket] = useState('All')
  const [sameGameOnly, setSameGameOnly] = useState(false)
  const [playableOnly, setPlayableOnly] = useState(false)
  const [limit, setLimit] = useState(50)

  const meta = obj(summary)
  const pairs = arr(meta.top_pairs)

  // Which of these hitters are actually on tonight's slate. A pair neither of
  // whom is playing is history trivia, not a bet.
  const onSlate = useMemo(() => new Set(
    players.map((p) => String(nameOf(p) || '').toLowerCase().replace(/[^a-z]/g, '')),
  ), [players])

  const rows = useMemo(() => {
    const q = query.toLowerCase().trim()
    return pairs
      .filter((p) => {
        const names = `${clean(p?.player_1, '')} ${clean(p?.player_2, '')}`.toLowerCase()
        if (q && !names.includes(q)) return false
        if (bucket !== 'All' && clean(p?.last_hit_bucket, '') !== bucket) return false
        if (sameGameOnly && !p?.same_game_flag) return false
        // Playable tonight: BOTH halves have to be on the slate. One-of-two is
        // not a pair you can actually place — the partner isn't playing.
        if (playableOnly) {
          const on = arr(p?.players).filter((pl) =>
            onSlate.has(String(pl?.name || '').toLowerCase().replace(/[^a-z]/g, ''))).length
          if (on < 2) return false
        }
        return true
      })
      .sort((a, b) => n(b?.pair_score, 0) - n(a?.pair_score, 0))
      .slice(0, limit)
  }, [pairs, query, bucket, sameGameOnly, playableOnly, onSlate, limit])

  if (!pairs.length) {
    return <Empty text="No pair history published yet — pair_history_summary.json hasn't been written." />
  }

  return (
    <div>
      <PanelTitle
        title="Pair History"
        sub={`${meta.pair_count ?? pairs.length} pairs · ${meta.hr_event_count ?? '—'} HR events · ${clean(meta.start_date, '')} → ${clean(meta.end_date, '')}`}
        right={<span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{rows.length} shown</span>}
      />

      <div style={{
        fontSize: 10.5, color: C.text3, lineHeight: 1.6, margin: '6px 0 12px',
        borderLeft: `2px solid ${C.orange}`, paddingLeft: 10, maxWidth: 720,
      }}>
        <b style={{ color: C.text2 }}>Read the same-game share before anything else on this page.</b>{' '}
        Two hitters homering on the same <i>date</i> in different ballparks is two independent
        events — the board counts it anyway, because that&apos;s how the pair score is built. Only the
        same-game subset is genuinely correlated, and it&apos;s a small fraction of the total. Use{' '}
        <b style={{ color: C.text2 }}>Same game only</b> to see just that subset, and{' '}
        <b style={{ color: C.text2 }}>Playable tonight</b> to drop the pairs where one half isn&apos;t
        even in a lineup.
      </div>

      {(() => {
        const sg = pairs.filter((p) => p?.same_game_flag).length
        const recent = pairs.filter((p) => p?.recent_pair_hit).length
        const repeats = pairs.map((p) => n(p?.repeat_count, 0))
        const maxRep = Math.max(...repeats, 0)
        const sgTotal = pairs.reduce((a, p) => a + n(p?.same_game_hr_count, 0), 0)
        const dayTotal = pairs.reduce((a, p) => a + n(p?.repeat_count, 0), 0)
        const sgShare = dayTotal ? (100 * sgTotal) / dayTotal : 0
        // Three tiles, not five. "Same-game pairs" and "Same-game share" were
        // the same fact counted two ways (how many pairs have ever done it vs
        // what fraction of co-HR days it represents) and reading both together
        // is how you talk yourself into the bigger one. Share is the honest
        // one, so it stays and the count goes. "Most repeats" was trivia about
        // a single pair.
        const cells = [
          ['Pairs tracked', pairs.length, `${meta.days_checked ?? '—'} days checked`],
          ['Same-game share', `${sgShare.toFixed(1)}%`, `${sgTotal} of ${dayTotal} co-HR days`],
          ['Hit in last 7', recent, 'at least one co-HR day'],
        ]
        return (
          <div style={{
            display: 'grid', gap: 8, margin: '10px 0 12px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          }}>
            {cells.map(([l, v, sub]) => (
              <div key={l} style={{
                background: C.bg2, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: '8px 11px',
              }}>
                <div style={{
                  fontSize: 9, textTransform: 'uppercase', letterSpacing: '.07em',
                  color: C.text3, fontWeight: 700, whiteSpace: 'nowrap',
                }}>{l}</div>
                <div style={{ fontFamily: NUM_FONT, fontSize: 18, fontWeight: 800, color: C.orange }}>{v}</div>
                <div style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>{sub}</div>
              </div>
            ))}
          </div>
        )
      })()}


      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0 12px' }}>
        <input
          style={{ ...inputStyle(), width: 'auto', flex: '1 1 200px', minWidth: 160 }}
          placeholder="Search either hitter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          style={{ ...selectStyle(), width: 'auto', flex: '0 0 auto' }}
          value={bucket}
          onChange={(e) => setBucket(e.target.value)}
        >
          {BUCKETS.map((b) => <option key={b} value={b}>{b === 'All' ? 'Any recency' : b}</option>)}
        </select>
        <select
          style={{ ...selectStyle(), width: 'auto', flex: '0 0 auto' }}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        >
          {[25, 50, 100, 350].map((v) => <option key={v} value={v}>Top {v}</option>)}
        </select>
        <button
          onClick={() => setSameGameOnly((v) => !v)}
          style={{
            ...selectStyle(),
            width: 'auto', flex: '0 0 auto',
            cursor: 'pointer',
            color: sameGameOnly ? '#06281a' : C.text2,
            background: sameGameOnly ? C.green : C.bg2,
            borderColor: sameGameOnly ? C.green : C.border,
            fontWeight: 700,
          }}
        >Same game only</button>
        <button
          onClick={() => setPlayableOnly((v) => !v)}
          title="Both hitters are on tonight's slate. One-of-two isn't a pair you can place."
          style={{
            ...selectStyle(),
            width: 'auto', flex: '0 0 auto',
            cursor: 'pointer',
            color: playableOnly ? '#1a0d02' : C.text2,
            background: playableOnly ? C.orange : C.bg2,
            borderColor: playableOnly ? C.orange : C.border,
            fontWeight: 700,
          }}
        >Playable tonight</button>
      </div>

      {/* The table below is the full list. This is the shape of the top of
          it -- whether a pair's score comes from raw repeat count or from the
          much rarer same-game hits, which are the only correlated ones. */}

      <DenseTable
        rows={rows.map((p) => {
          const ps = arr(p?.players)
          const playable = ps.filter((pl) => onSlate.has(
            String(pl?.name || '').toLowerCase().replace(/[^a-z]/g, ''),
          )).length
          return {
            _key: clean(p?.pair_key, ''),
            _raw: ps[0] || null,
            pair: `${clean(p?.player_1, '')} + ${clean(p?.player_2, '')}`,
            teams: ps.map((x) => clean(x?.team, '')).filter(Boolean).join(' / '),
            sameGame: n(p?.same_game_hr_count, 0),
            sameDay: n(p?.repeat_count, 0),
            since: n(p?.days_since_last_hit, null),
            last: clean(p?.last_same_day_hr, '—'),
            bucket: clean(p?.last_hit_bucket, '—'),
            playable,
          }
        })}
        columns={[
          { key: 'pair',     label: 'Pair',    heat: false, w: 240, bold: true, sticky: true },
          { key: 'teams',    label: 'Teams',   heat: false, w: 74, mono: true, dim: true },
          { key: 'playable', label: 'Tonight', w: 52,
            title: '2 = both hitters are on tonight’s slate' },
          { key: 'sameGame', label: 'Same game', w: 58 },
          { key: 'sameDay',  label: 'Same day',  w: 56 },
          { key: 'since',    label: 'Days ago',  w: 56, invert: true,
            fmt: (v) => (v == null ? '—' : String(v)) },
          { key: 'last',     label: 'Last',    heat: false, w: 80, mono: true, dim: true },
          { key: 'bucket',   label: 'Window',  heat: false, w: 62, dim: true },
        ]}
        onRowClick={onPlayerClick ? (r) => r._raw && onPlayerClick(r._raw) : null}
        initialSort="sameGame"
        maxHeight={520}
        caption="Sorted by same-game hits, not by pair score — score mixes in a boost you can't see. Days ago is inverted so a recent pairing reads bright. Tonight is 2 when both hitters are actually playable today."
      />

      {/* PairBuilder used to render here too — removed 2026-08-04, it lives
          on the Pools tab now. One builder, one home. */}

      <div style={{ fontSize: 10.5, color: C.text3, marginTop: 10, lineHeight: 1.6 }}>
        <strong style={{ color: C.text2 }}>Same day</strong> is how many separate dates both hitters homered.{' '}
        <strong style={{ color: C.text2 }}>Same game</strong> counts only the ones in the same ballpark on
        the same night — much rarer, and the only version of this that's a genuinely correlated bet.
        Everything else is two independent events that happened to land on one date, so treat a big Days
        number with a zero next to it as coincidence, not signal.
      </div>
    </div>
  )
}
