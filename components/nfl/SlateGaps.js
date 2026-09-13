'use client'
import { useMemo } from 'react'
import { C, NUM_FONT, RAMP } from '../../lib/nfl/theme'
import ChartFrame from './ChartFrame'

// THE GAPS.
//
// Five ranked rungs imply an order. This asks whether the numbers underneath
// can support one — and it asks it by plotting the thing itself: not each
// player's score, but the DROP from each name to the next.
//
// Every other form of this chart was tried first (line, bars, lollipop,
// staircase, and a beeswarm before those) and every one of them drew a market
// with a real standout and a market with none as the same picture, because a
// sorted score curve is a gentle slope either way and the eye cannot subtract
// adjacent points. Plotting the gaps directly is the whole difference: one
// tall bar at the front means one man is clear of the field, and a row of even
// stubs means the board is numbering names that are not actually apart.
//
// So the bars are DIFFERENCES, not levels. That needs a beat of explanation,
// which the axis caption and the verdict line both give.
//
// Eight gaps, ranks 1 through 9 — the card plus a little of the field behind
// it. Thirteen was the first try and the tail wrecked it: passing yards'
// biggest drop is 17.3 between the eleventh and twelfth of twelve starting
// quarterbacks, which set the scale for the whole chart and squashed the front
// eight bars into nothing. The question is about the top of the market, so the
// window is the top of the market.

const SHOWN = 9
const H = 58

export default function SlateGaps({ players, market, rungIds, onPick }) {
  const model = useMemo(() => {
    const all = (players || [])
      .map((p) => ({ id: String(p.player_id), name: p.name, score: Number(p.scores?.[market]) }))
      .filter((p) => Number.isFinite(p.score))
      .sort((a, b) => b.score - a.score)
    if (all.length < 4) return null

    const head = all.slice(0, SHOWN)
    const gaps = head.slice(1).map((r, i) => ({
      from: head[i], to: r, drop: head[i].score - r.score, rank: i + 1,
    }))
    const widest = gaps.reduce((a, b) => (b.drop > a.drop ? b : a), gaps[0])
    const max = widest.drop || 1
    // The gap that matters for a decision is one INSIDE the card — the five
    // names a bettor is choosing between — not one out in the field behind it.
    const carded = gaps.slice(0, 4)
    const widestCarded = carded.reduce((a, b) => (b.drop > a.drop ? b : a), carded[0])
    const top = all[0].score
    const second = all[1].score
    const fifth = all[Math.min(4, all.length - 1)].score
    const tail = all[Math.min(19, all.length - 1)].score
    const thin = all.length < 12
    // A cliff is one man clear of the FIELD: first-versus-second against the
    // spread of the top twenty. Measured against rung 5 or the median instead,
    // this called passing yards a cliff when the drop there is the twelfth of
    // twelve quarterbacks, at the tail.
    const cliff = !thin && (top - second) / ((top - tail) || 1) >= 0.3
    return { gaps, widest, widestCarded, max, top, second, fifth, thin, cliff, n: all.length, leader: all[0].name }
  }, [players, market])

  if (!model) return null
  const on = new Set((rungIds || []).map(String))
  // The glow marks the gap the SENTENCE is about. It used to mark the widest
  // gap anywhere in the top nine, which on four of seven markets was a drop
  // out in the field — so the eye went to one bar while the line underneath
  // discussed another.
  const { gaps, max } = model
  const marked = model.widestCarded

  return (
    <div style={{ padding: '2px 0 4px' }}>
      <ChartFrame accent={model.cliff ? C.green : RAMP[0]} live={model.cliff} pad="0">
      <div style={{
        position: 'relative', height: H,
        display: 'flex', alignItems: 'flex-end', gap: 3, padding: '9px 7px 0',
      }}>
        {/* the floor the bars stand on — the rank axis */}
        <div style={{
          position: 'absolute', left: 7, right: 7, bottom: 8, height: 1,
          background: 'rgba(255,255,255,.10)',
        }} />

        {gaps.map((g) => {
          const isMax = g === marked
          // A gap BETWEEN two carded names is part of the order the board is
          // asserting; past rung 5 it is the field behind it.
          const carded = on.has(g.from.id) && on.has(g.to.id)
          const h = Math.max(3, (g.drop / max) * (H - 20))
          // First pass painted everything past rung 5 at 14% white and the
          // chart read as four bars floating in an empty box — the field
          // behind the card is the comparison that makes the card mean
          // anything, so it has to be visible. The ramp runs across the whole
          // row and OPACITY carries the hierarchy instead.
          const tone = RAMP[Math.min(g.rank - 1, RAMP.length - 1)]
          return (
            <div
              key={g.rank}
              onClick={onPick ? () => onPick(g.from.id) : undefined}
              title={`${g.from.name} ${Math.round(g.from.score)} → ${g.to.name} ${Math.round(g.to.score)}  ·  a ${g.drop.toFixed(1)} drop`}
              style={{
                flex: 1, height: h, marginBottom: 8, borderRadius: '3px 3px 0 0',
                background: `linear-gradient(180deg, ${tone}, ${tone}40)`,
                opacity: carded ? 1 : 0.42,
                boxShadow: isMax
                  ? `0 0 14px ${tone}80, inset 0 1px 0 rgba(255,255,255,.28)`
                  : 'inset 0 1px 0 rgba(255,255,255,.16)',
                cursor: onPick ? 'pointer' : 'default',
                position: 'relative',
              }}
            >
              {/* a short reflection below the floor — the bars read as
                  standing on the axis rather than hanging from nothing */}
              <span style={{
                position: 'absolute', left: 0, right: 0, top: '100%', height: Math.min(7, h * 0.4),
                background: `linear-gradient(180deg, ${tone}38, transparent)`,
                transform: 'scaleY(-1)', transformOrigin: 'top', pointerEvents: 'none',
              }} />
              {isMax && (
                <span style={{
                  position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
                  width: 3, height: 3, borderRadius: '50%', background: C.green,
                  boxShadow: `0 0 6px ${C.green}`,
                }} />
              )}
            </div>
          )
        })}
      </div>
      </ChartFrame>

      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontFamily: NUM_FONT, fontSize: 8, color: C.text3, marginTop: 2,
        letterSpacing: '.06em',
      }}>
        <span>1→2</span>
        <span>{SHOWN - 1}→{SHOWN}</span>
      </div>
      <div style={{
        fontFamily: NUM_FONT, fontSize: 8, color: C.text3, opacity: 0.75,
        letterSpacing: '.05em', marginTop: 1,
      }}>each bar is the drop to the next name · lit = inside the card</div>

      <div style={{
        fontFamily: NUM_FONT, fontSize: 9.5, color: C.text2, marginTop: 3, lineHeight: 1.5,
      }}>
        {model.n} eligible ·{' '}
        {model.thin
          ? <>too few to have a shape — the card is most of the pool</>
          : model.cliff
            ? <>one clear at the top — <b style={{ color: C.green }}>{model.leader}</b> at {Math.round(model.top)},
              a {(model.top - model.second).toFixed(1)} drop to the next name</>
            : <>no standout — the widest gap inside the card is
              {' '}<b style={{ color: C.text }}>{model.widestCarded.drop.toFixed(1)}</b>, so the order
              is thinner than the numbering makes it look</>}
      </div>
    </div>
  )
}
