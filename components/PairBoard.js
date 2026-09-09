'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { arr, obj, n, clean, median } from '../lib/player'
import DenseTable from './DenseTable'

// The bot's recommended pairs, dense.
//
// A pair is two independent bets sold as one, so the only honest way to read
// this board is per-side: the pair score is the sum of two hitters, and a 112
// built from 88 + 24 is a very different bet from 56 + 56. The Weaker column
// exists for exactly that — it's the side that decides whether the pair
// clears, because both have to land.
//
// The production bot now publishes one common pair score and a separate,
// plainly-labelled season estimate for both players homering. The estimate is
// useful for ordering and price screening; it is not called calibrated.

const LANE_SHORT = {
  TOP30: 'TOP30', A: 'A · Core', B: 'B · Statcast', C: 'C · Flex', D: 'D · Variance',
}
const LANE_RANK = ['TOP30', 'A', 'B', 'C', 'D']
const chancePct = (p) => {
  const published = Number(p?.season_hr_game_probability)
  if (Number.isFinite(published) && published > 0 && published < 1) return 100 * published
  const perPa = Number(p?.hr_per_pa)
  return Number.isFinite(perPa) && perPa > 0 ? 100 * (1 - Math.pow(1 - perPa, 4.15)) : 0
}

export default function PairBoard({ pairBuilder, results, onPlayerClick }) {
  // Live leg-tracking: which halves of each recommended pair have homered
  // tonight. A pair's progress is discrete — 0, 1 or 2 legs — so it renders
  // as two segments, not a smooth bar pretending to continuity.
  const homered = useMemo(() => {
    const raw = results?.hr_capture_report?.all_homer_entries || results?.merged_homers || []
    return new Set(raw.map((h) => String(h?.name || '').toLowerCase().trim()).filter(Boolean))
  }, [results])
  const rows = useMemo(() => {
    return arr(obj(pairBuilder).recommended_pairs).map((pr, i) => {
      const ps = arr(pr?.players)
      const a = ps[0] || {}
      const b = ps[1] || {}
      const hrA = n(a.hr_score, 0)
      const hrB = n(b.hr_score, 0)
      const chanceA = chancePct(a)
      const chanceB = chancePct(b)
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
        bothEst: 100 * n(pr?.estimated_both_hr_probability, (chanceA * chanceB) / 10000),
        strongEst: Math.max(chanceA, chanceB),
        weakEst: Math.min(chanceA, chanceB),
        risk: clean(pr?.risk, '—'),
        stronger: Math.max(hrA, hrB),
        weaker: Math.min(hrA, hrB),
        gap: Math.abs(hrA - hrB),
        hrw: median([n(a.hrw_score, 0), n(b.hrw_score, 0)]),
        longest: median([n(a.longest_hr_score, 0), n(b.longest_hr_score, 0)]),
        overall: median([n(a.overall_score, 0), n(b.overall_score, 0)]),
        tags: arr(pr?.tags).join(' · '),
        aHit: homered.has(String(a.name || '').toLowerCase().trim()) ? 1 : 0,
        bHit: homered.has(String(b.name || '').toLowerCase().trim()) ? 1 : 0,
        aName: clean(a.name, '?'), bName: clean(b.name, '?'),
        strongName: chanceA >= chanceB ? clean(a.name, '?') : clean(b.name, '?'),
        weakName: chanceA >= chanceB ? clean(b.name, '?') : clean(a.name, '?'),
        l5: `${a.name ? String(a.name).split(' ').slice(-1)[0] : '?'} ${n(a.last5_hits,0)}H/${n(a.last5_hr,0)}HR · ${b.name ? String(b.name).split(' ').slice(-1)[0] : '?'} ${n(b.last5_hits,0)}H/${n(b.last5_hr,0)}HR`,
        reason: clean(pr?.reason, ''),
      }
    // Lane order first, then score inside the lane — sorting purely on score
    // interleaves two incompatible scales and puts every TOP30 pair on top by
    // construction rather than by merit.
    }).sort((a, b) => (a._laneOrder - b._laneOrder) || (b.score - a.score))
  }, [pairBuilder, homered])

  if (!rows.length) return null

  const sameGame = rows.filter((r) => r.sameGame).length

  // ── 🧱 THE STURDIEST PAIR (2026-08-09) ──────────────────────────────────
  //
  // The page already tells you the right thing in its caption — "both hitters
  // have to land, so the pair is never better than its worse half" — and then
  // sorts by pair score anyway and leaves you to find the sturdy one yourself.
  //
  // A pair is a two-leg bet. Its ceiling is the WEAKER side, full stop: a
  // 92 + 44 is a 44 wearing a big number. So the lead is the pair with the
  // best weaker half, and when that isn't the highest-scored pair the card
  // shows both and names the trade, because that comparison is the whole
  // lesson and it takes two lines to teach.
  const sturdiest = [...rows].sort((a, b) => b.weakEst - a.weakEst || b.bothEst - a.bothEst)[0]
  const topScore = [...rows].sort((a, b) => b.score - a.score)[0]
  const differ = sturdiest && topScore && sturdiest._key !== topScore._key

  const Side = ({ name, score, weak }) => (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
      <b style={{ fontSize: 13, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</b>
      <span style={{
        fontFamily: NUM_FONT, fontSize: 11, fontWeight: 900,
        color: weak ? (score >= 15 ? C.orange : '#f87171') : C.text3,
      }}>{score.toFixed(1)}%</span>
    </span>
  )

  return (
    <div style={{ marginBottom: 18 }}>
      {/* ── THE LEAD: the pair whose WORSE half is best ─────────────────── */}
      {sturdiest && (
        <div
          onClick={() => onPlayerClick?.(sturdiest._raw)}
          className="tap-row"
          style={{
            background: 'linear-gradient(155deg, rgba(249,115,22,.10), rgba(249,115,22,.02) 60%)',
            border: '1px solid rgba(249,115,22,.42)', borderRadius: 13,
            padding: '11px 14px', marginBottom: 12, cursor: 'pointer',
          }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: C.orange, letterSpacing: '.09em', fontFamily: NUM_FONT }}>
              🧱 STURDIEST PAIR TONIGHT
            </span>
            <span style={{ fontSize: 9.5, color: C.text3 }}>the one whose weaker half is strongest</span>
            <span style={{ marginLeft: 'auto', fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
              {sturdiest.lane} · {sturdiest.risk} risk
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <Side name={sturdiest.strongName} score={sturdiest.strongEst} />
            <span style={{ color: C.text3, fontSize: 13 }}>+</span>
            <Side name={sturdiest.weakName} score={sturdiest.weakEst} weak />
            <span style={{ marginLeft: 'auto', fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
              both est {sturdiest.bothEst.toFixed(1)}%
            </span>
          </div>
          <div style={{ fontSize: 10, color: C.text2, lineHeight: 1.6, marginTop: 5 }}>
            Both have to land, so this leads on its <b style={{ color: C.orange }}>weaker season estimate — {sturdiest.weakEst.toFixed(1)}%</b>.
            {differ && (
              <> The highest-SCORED pair is <b style={{ color: C.text }}>{topScore.pair}</b> at {topScore.score.toFixed(1)},
              but its weak-side estimate is <b style={{ color: C.text2 }}>{topScore.weakEst.toFixed(1)}%</b> —
              that&apos;s the trade.</>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>Recommended pairs</span>
        <span style={{ marginLeft: 'auto', fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          {rows.length} pairs · {sameGame} same-game
        </span>
      </div>

      {/* The heatmap that used to sit here showed the same five columns the
          table below already heats — two renderings of the same ten rows.
          Removed 2026-08-04; the table is the board, the writeup under it is
          the reasoning. */}
      <DenseTable
        rows={rows}
        columns={[
          { key: 'pair',     label: 'Pair',     heat: false, w: 230, bold: true, sticky: true },
          { key: 'teams',    label: 'Teams',    heat: false, w: 74, mono: true, dim: true },
          { key: 'lane',     label: 'Lane',     heat: false, w: 92, mono: true,
            title: 'The bot’s own lane_key. Scores are only comparable inside a lane.' },
          { key: 'sameGame', label: 'Same gm',  flag: true, mark: '●', w: 46 },
          { key: 'score',    label: 'Score',    heat: false, w: 56, mono: true,
            title: 'The bot’s common pair quality score.',
            fmt: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(Number(v) < 30 ? 2 : 1) : '—') },
          { key: 'bothEst',  label: 'Both est', w: 58, dp: 1, title: 'Independent season HR/PA screening estimate; not a calibrated model forecast.' },
          { key: 'weakEst',  label: 'Weak est', w: 58, dp: 1, title: 'Lower of the two individual season estimates.' },
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
        caption="Sorted by lane, then by the bot's common pair score. Both est multiplies the two small-sample-shrunk season HR/PA estimates under independence; it is a screening estimate, not a calibrated forecast. Click a row to open the stronger hitter."
      />

      {/* THE BOT'S REASONING, in prose. The reason/tags/risk fields were
          squeezed into truncated table cells nobody read. Each pair gets its
          line: why the bot put these two together, and the number that
          decides it (the weaker side). */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, marginBottom: 6 }}>Why these pairs</div>
        <div style={{
          background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11,
          padding: '4px 0',
        }}>
          {rows.map((r, i) => (
            <div key={r._key} style={{
              padding: '8px 13px',
              borderTop: i ? `1px solid ${C.border}` : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
                <span
                  onClick={() => onPlayerClick?.(r._raw)}
                  style={{ fontSize: 12, fontWeight: 800, cursor: onPlayerClick ? 'pointer' : 'default' }}
                >{r.pair}</span>
                <span style={{
                  fontSize: 8.5, fontWeight: 800, fontFamily: NUM_FONT, padding: '1px 6px',
                  borderRadius: 4, background: `${C.orange}1c`, color: C.orange,
                }}>{r.lane}</span>
                {r.type && <span style={{ fontSize: 9, color: C.text3 }}>{r.type}</span>}
                {r.sameGame === 1 && (
                  <span style={{ fontSize: 8.5, fontWeight: 800, color: '#22d3ee', fontFamily: NUM_FONT }}>SAME GAME</span>
                )}
                {/* two-segment leg tracker: lit = that half homered tonight */}
                <span title={`${r.aName}${r.aHit ? ' 💥' : ' —'} · ${r.bName}${r.bHit ? ' 💥' : ' —'}`}
                  style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
                  {[r.aHit, r.bHit].map((hit2, k) => (
                    <span key={k} style={{
                      width: 14, height: 5, borderRadius: 3,
                      background: hit2 ? '#4ade80' : 'rgba(255,255,255,0.10)',
                      boxShadow: hit2 ? '0 0 6px #4ade80' : 'none',
                    }} />
                  ))}
                  {(r.aHit || r.bHit) === 1 && r.aHit + r.bHit === 2 && (
                    <span style={{ fontSize: 8.5, fontWeight: 900, color: '#4ade80', fontFamily: NUM_FONT }}>PAIR ✓</span>
                  )}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 9.5, fontFamily: NUM_FONT, color: C.text3 }}>
                  weaker side <b style={{ color: r.weaker >= 60 ? C.orange : C.text2 }}>{r.weaker.toFixed(0)}</b>
                  {' '}· gap {r.gap.toFixed(0)}
                  {r.risk && r.risk !== '—' ? ` · ${r.risk} risk` : ''}
                </span>
              </div>
              <div style={{ fontSize: 10.5, color: C.text2, marginTop: 3, lineHeight: 1.55 }}>
                {r.reason || 'No stated reason on this pair — the lane and tags are the whole case.'}
                {r.tags && (
                  <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9.5 }}> — {r.tags}</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 9.5, color: C.text3, marginTop: 6, lineHeight: 1.55 }}>
          Every line is the bot&apos;s own <code>reason</code>, <code>tags</code> and <code>risk</code> for
          that pair, printed instead of truncated. The number to check before anything else is the
          weaker side — both hitters have to land, so the pair is never better than its worse half.
        </div>
      </div>
    </div>
  )
}
