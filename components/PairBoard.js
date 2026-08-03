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
//
// SCORE IS NOT HEATED, ON PURPOSE. `pair_score` is not one quantity. The bot
// writes it on two different scales depending on the lane: the TOP30 pairs come
// back at 112 and 99, and lanes A–D come back at 11 to 16. Ramping that single
// column meant the two TOP30 rows lit up and all eight lettered-lane pairs sat
// in the floor colour — which reads as "these eight are bad" when what it
// actually means is "these eight were scored by a different formula". There is
// no shared range to normalise against, so the column is shown as a plain
// number with its lane next to it, and the heat is carried by the columns that
// ARE comparable across lanes: Stronger, Weaker, Balance, HRW, Longest are all
// per-hitter scores on one scale.

const LANE_SHORT = {
  TOP30: 'TOP30', A: 'A · Core', B: 'B · Statcast', C: 'C · Flex', D: 'D · Value',
}
const LANE_RANK = ['TOP30', 'A', 'B', 'C', 'D']

export default function PairBoard({ pairBuilder, onPlayerClick }) {
  const rows = useMemo(() => {
    return arr(obj(pairBuilder).recommended_pairs).map((pr, i) => {
      const ps = arr(pr?.players)
      const a = ps[0] || {}
      const b = ps[1] || {}
      const hrA = n(a.hr_score, 0)
      const hrB = n(b.hr_score, 0)
      const lane = String(pr?.lane_key || '').toUpperCase()
      return {
        _key: clean(pr?.pair_key, String(i)),
        // Row click opens the stronger side; he's the one you'd look up first.
        _raw: hrA >= hrB ? a : b,
        lane: LANE_SHORT[lane] || lane || '—',
        _laneOrder: LANE_RANK.indexOf(lane) < 0 ? 99 : LANE_RANK.indexOf(lane),
        type: clean(pr?.type, ''),
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
    // Lane order first, then score inside the lane — sorting purely on score
    // interleaves two incompatible scales and puts every TOP30 pair on top by
    // construction rather than by merit.
    }).sort((a, b) => (a._laneOrder - b._laneOrder) || (b.score - a.score))
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
          label: `${r.pair}  ·  ${r.lane}`,
          _raw: r._raw,
          values: {
            Stronger: r.stronger,
            Weaker: r.weaker,
            // Inverted at source: a small gap means two real bets rather than
            // one good hitter carrying a passenger, so small reads bright.
            Balance: Math.max(0, 60 - Math.min(60, r.gap)),
            HRW: r.hrw,
            Longest: r.longest,
          },
        }))}
        columns={['Stronger', 'Weaker', 'Balance', 'HRW', 'Longest']}
        title={`All ${rows.length} recommended pairs — read the weaker side, it decides`}
        labelWidth={280}
        onRowClick={onPlayerClick ? (r) => r._raw && onPlayerClick(r._raw) : null}
        caption="Both hitters have to land, so the pair is only as good as its weaker half. Balance is flipped — bright means the two sides are close, dark means one hitter is carrying a passenger. The bot's pair_score is deliberately absent from this heatmap: it's on a different scale in TOP30 than in lanes A–D, so shading it would say the lettered lanes are weak when they were simply scored by another formula. It's in the table below as a plain number, next to its lane."
      />

      <DenseTable
        rows={rows}
        columns={[
          { key: 'pair',     label: 'Pair',     heat: false, w: 230, bold: true, sticky: true },
          { key: 'teams',    label: 'Teams',    heat: false, w: 74, mono: true, dim: true },
          { key: 'lane',     label: 'Lane',     heat: false, w: 92, mono: true,
            title: 'The bot’s own lane_key. Scores are only comparable inside a lane.' },
          { key: 'sameGame', label: 'Same gm',  flag: true, mark: '●', w: 46 },
          { key: 'score',    label: 'Score',    heat: false, w: 56, mono: true,
            title: 'The bot’s pair_score. Not shaded — TOP30 scores around 100 and lanes A–D around 12, so a shared ramp would be meaningless.',
            fmt: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(Number(v) < 30 ? 2 : 1) : '—') },
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
        initialSort={null}
        maxHeight={420}
        caption="Sorted by lane, then by score inside the lane. Gap is inverted — a wide gap between the two sides is a worse pair at the same score. Score is shown unshaded because TOP30 and lanes A–D are scored on different scales; compare within a lane, not down the column. Click a row to open the stronger hitter."
      />
    </div>
  )
}
