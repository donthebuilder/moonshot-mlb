'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { arr, obj, n, clean, median } from '../lib/player'
import Heatmap from './Heatmap'
import DenseTable from './DenseTable'

// The bot's recommended pairs, dense.
//
// A pair is two independent bets sold as one, so the only honest way to read
// this board is per-side: the pair score is the sum of two hitters, and a 112
// built from 88 + 24 is a very different bet from 56 + 56. The Weaker column
// exists for exactly that — it's the side that decides whether the pair
// clears, because both have to land.

export default function PairBoard({ pairBuilder, onPlayerClick }) {
  const rows = useMemo(() => {
    return arr(obj(pairBuilder).recommended_pairs).map((pr, i) => {
      const ps = arr(pr?.players)
      const a = ps[0] || {}
      const b = ps[1] || {}
      const hrA = n(a.hr_score, 0)
      const hrB = n(b.hr_score, 0)
      return {
        _key: clean(pr?.pair_key, String(i)),
        // Row click opens the stronger side; he's the one you'd look up first.
        _raw: hrA >= hrB ? a : b,
        pair: `${clean(a.name, '?')} + ${clean(b.name, '?')}`,
        teams: [clean(a.team, ''), clean(b.team, '')].filter(Boolean).join(' / '),
        sameGame: a.game_pk && a.game_pk === b.game_pk ? 1 : 0,
        score: n(pr?.pair_score, 0),
        risk: clean(pr?.risk, '—'),
        stronger: Math.max(hrA, hrB),
        weaker: Math.min(hrA, hrB),
        gap: Math.abs(hrA - hrB),
        hrw: median([n(a.hrw_score, 0), n(b.hrw_score, 0)]),
        longest: median([n(a.longest_hr_score, 0), n(b.longest_hr_score, 0)]),
        overall: median([n(a.overall_score, 0), n(b.overall_score, 0)]),
        tags: arr(pr?.tags).join(' · '),
        reason: clean(pr?.reason, ''),
      }
    }).sort((a, b) => b.score - a.score)
  }, [pairBuilder])

  if (!rows.length) return null

  const sameGame = rows.filter((r) => r.sameGame).length

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>Recommended pairs</span>
        <span style={{ marginLeft: 'auto', fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          {rows.length} pairs · {sameGame} same-game
        </span>
      </div>

      <Heatmap
        rows={rows.slice(0, 15).map((r) => ({
          label: r.pair,
          _raw: r._raw,
          values: {
            Score: r.score,
            Stronger: r.stronger,
            Weaker: r.weaker,
            // Inverted at source: a small gap means two real bets rather than
            // one good hitter carrying a passenger, so small reads bright.
            Balance: Math.max(0, 60 - Math.min(60, r.gap)),
            HRW: r.hrw,
            Longest: r.longest,
          },
        }))}
        columns={['Score', 'Stronger', 'Weaker', 'Balance', 'HRW', 'Longest']}
        title="Top 15 pairs — read the weaker side, it decides"
        labelWidth={220}
        onRowClick={onPlayerClick ? (r) => r._raw && onPlayerClick(r._raw) : null}
        caption="Both hitters have to land, so the pair is only as good as its weaker half. Balance is flipped — bright means the two sides are close, dark means one hitter is carrying a passenger."
      />

      <DenseTable
        rows={rows}
        columns={[
          { key: 'pair',     label: 'Pair',     heat: false, w: 230, bold: true, sticky: true },
          { key: 'teams',    label: 'Teams',    heat: false, w: 74, mono: true, dim: true },
          { key: 'sameGame', label: 'Same gm',  flag: true, mark: '●', w: 46 },
          { key: 'score',    label: 'Score',    w: 50, dp: 1 },
          { key: 'stronger', label: 'Stronger', w: 56, dp: 1 },
          { key: 'weaker',   label: 'Weaker',   w: 52, dp: 1 },
          { key: 'gap',      label: 'Gap',      w: 44, dp: 1, invert: true },
          { key: 'hrw',      label: 'HRW',      w: 46, dp: 1 },
          { key: 'longest',  label: 'Longest',  w: 52, dp: 1 },
          { key: 'overall',  label: 'Overall',  w: 52, dp: 1 },
          { key: 'risk',     label: 'Risk',     heat: false, w: 52, dim: true },
          { key: 'tags',     label: 'Tags',     heat: false, w: 190, dim: true },
        ]}
        onRowClick={onPlayerClick}
        initialSort="score"
        maxHeight={420}
        caption="Gap is inverted — a wide gap between the two sides is a worse pair at the same score. Click a row to open the stronger hitter."
      />
    </div>
  )
}
