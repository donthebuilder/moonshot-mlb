'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'

// AGAINST THE BAR — every published game as a dot on one axis, with the bar
// drawn through them.
//
// 2026-09-13, Donovan: the screens are "outdated and uninteresting". The
// diagnosis was that every chart on TUDDY answered "who" and none of them
// answered the question a prop actually is: HOW OFTEN DOES HE CLEAR THIS
// NUMBER, AND BY HOW MUCH? A column chart of the same values the table
// underneath already lists can only say over/under. It throws away margin,
// which is the whole difference between a man who clears by a yard and a man
// who clears by thirty.
//
// One strip carries four things at once:
//   · hit rate      — how many dots sit right of the rule
//   · margin        — how far right, which the bars could never show
//   · consistency   — a tight cluster vs two blowups and eight blanks
//   · recency       — newest games are opaque, old ones fade back
//
// It is also SHORTER than the chart it replaces (54px vs 104px), which is the
// standing rule for anything that lands on a phone.
//
// Deliberately no y-axis. Vertical position is jitter and nothing else — it
// exists so two identical games don't hide behind each other. The lane bands
// are drawn, faintly, only so the eye reads it as one axis rather than a
// scatter with a meaning it doesn't have.

const DOT = 9

// A half-point line (39.5) is cleared by going OVER it; a whole-number bar
// (1 TD, 12 carries) is cleared by REACHING it. HitRate always hands down a
// .5 preset so it never had to care, but StatPortal passes the market's own
// whole-number bar and the old `>` there graded "1 TD" as a miss on a game he
// scored in — every TD row on the player file read 0 of 19.
const clears = (v, bar) => (Number.isInteger(bar) ? v >= bar : v > bar)

export default function AgainstTheBar({
  log, statKey, bar, span = 10, unit = '', height = 54,
}) {
  const games = useMemo(() => {
    const all = (log || []).filter((g) => Number.isFinite(Number(g[statKey])))
    return span >= 9999 ? all : all.slice(-span)
  }, [log, statKey, span])

  const read = useMemo(() => {
    if (!games.length) return null
    const vals = games.map((g) => Number(g[statKey]))
    const overs = vals.filter((v) => clears(v, bar))
    const unders = vals.filter((v) => !clears(v, bar))
    const sorted = [...vals].sort((a, b) => a - b)
    const median = sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    const last5 = vals.slice(-5)
    return {
      vals,
      hits: overs.length,
      n: vals.length,
      median,
      floor: Math.min(...vals),
      ceiling: Math.max(...vals),
      l5: [last5.filter((v) => clears(v, bar)).length, last5.length],
      // the number the bars could never show
      overMargin: overs.length ? overs.reduce((a, b) => a + b, 0) / overs.length - bar : null,
      underMargin: unders.length ? bar - unders.reduce((a, b) => a + b, 0) / unders.length : null,
    }
  }, [games, statKey, bar])

  if (!read) {
    return (
      <div style={{
        border: `1px solid ${C.border}`, borderRadius: 9, padding: '14px 10px',
        background: 'rgba(255,255,255,.02)', fontSize: 10, color: C.text3,
        textAlign: 'center',
      }}>No published games for this market yet.</div>
    )
  }

  // The axis has to hold the bar and the biggest game with room at both ends,
  // and it must never be zero-width when every value is identical.
  const hi = Math.max(read.ceiling, bar) * 1.08 || 1
  const lo = 0
  // Inset: a dot at the floor or the ceiling used to be sliced in half by the
  // container's overflow. The axis lives between 7% and 95% instead of 0-100.
  const PAD_L = 7; const PAD_R = 5
  const at = (v) => `${PAD_L + (((v - lo) / (hi - lo)) * (100 - PAD_L - PAD_R))}%`

  // A market with two or three possible values is not a distribution and a dot
  // plot of it is a lie about the data: nineteen TD games pile onto x=0 and
  // x=1 and the "spread" you see is jitter. Those get a tally instead — one
  // cell per game in time order, which answers the only questions a binary
  // market has (how many, and how recently).
  const distinct = new Set(read.vals).size
  const binary = distinct <= 3 && read.ceiling <= 3 && read.vals.every(Number.isInteger)

  // Deterministic jitter: three lanes, walked in an order that keeps adjacent
  // games apart without ever moving when the component re-renders.
  const LANES = [0.5, 0.22, 0.78]
  const lane = (i) => LANES[i % LANES.length]

  const dense = games.length > 14

  if (binary) {
    return (
      <div>
        <div style={{
          display: 'flex', gap: 3, alignItems: 'stretch', height: 34, padding: 7,
          borderRadius: 9, border: `1px solid ${C.border}`,
          background: 'rgba(255,255,255,.02)', overflow: 'hidden',
        }}>
          {games.map((g, i) => {
            const v = Number(g[statKey])
            const hitv = clears(v, bar)
            const age = (games.length - 1 - i) / Math.max(1, games.length - 1)
            return (
              <div key={`${g.s}-${g.w}-${i}`}
                title={`${g.s} wk ${g.w} vs ${g.opp || '—'} · ${v}`}
                style={{
                  flex: 1, minWidth: 4, borderRadius: 3,
                  background: hitv ? C.green : 'transparent',
                  border: hitv ? 'none' : `1px solid ${C.border2}`,
                  opacity: hitv ? 1 - age * 0.55 : 0.5,
                  display: 'grid', placeItems: 'center',
                  fontFamily: NUM_FONT, fontSize: 8, fontWeight: 900,
                  color: hitv ? '#04120d' : 'transparent',
                }}>{v > 1 ? v : ''}</div>
            )
          })}
        </div>
        <div style={{
          fontSize: 10, color: C.text2, marginTop: 6, lineHeight: 1.6, fontFamily: NUM_FONT,
        }}>
          <b style={{ color: read.hits ? C.green : C.text3 }}>{read.hits} of {read.n}</b> games
          {' '}cleared {bar} · oldest left, newest right
          {read.l5[1] >= 3 && <> · last {read.l5[1]}: <b style={{ color: read.l5[0] ? C.green : C.text3 }}>{read.l5[0]}/{read.l5[1]}</b></>}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{
        position: 'relative', height, borderRadius: 9,
        border: `1px solid ${C.border}`, background: 'rgba(255,255,255,.02)',
        overflow: 'hidden',
      }}>
        {/* the bar. the only cyan thing in the chart. */}
        <div style={{
          position: 'absolute', left: at(bar), top: 0, bottom: 0, width: 0,
          borderLeft: `1px dashed ${C.cyan}`, zIndex: 2,
        }} />
        <div style={{
          position: 'absolute', left: `calc(${at(bar)} + 5px)`, top: 4, zIndex: 3,
          fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 900, color: C.cyan,
          whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>{bar}</div>

        {games.map((g, i) => {
          const v = Number(g[statKey])
          const hitv = clears(v, bar)
          // newest reads loudest
          const age = (games.length - 1 - i) / Math.max(1, games.length - 1)
          const opacity = 1 - age * 0.62
          return (
            <div
              key={`${g.s}-${g.w}-${i}`}
              title={`${g.s} wk ${g.w} vs ${g.opp || '—'} · ${v}${unit} · ${hitv ? `+${(v - bar).toFixed(1)} over` : `${(v - bar).toFixed(1)} under`}`}
              style={{
                position: 'absolute',
                left: at(v), top: `${lane(i) * 100}%`,
                transform: 'translate(-50%,-50%)',
                width: dense ? DOT - 2 : DOT, height: dense ? DOT - 2 : DOT,
                borderRadius: '50%',
                background: hitv ? C.green : 'transparent',
                border: hitv ? 'none' : `1.5px solid ${C.text3}`,
                opacity: hitv ? opacity : opacity * 0.8,
                boxShadow: hitv && age < 0.25 ? `0 0 7px ${C.green}80` : 'none',
                zIndex: 4,
              }}
            />
          )
        })}

        {/* three ticks, no more — the numbers that matter are on the dots */}
        {[0, hi / 2, hi].map((t, i) => (
          <span key={i} style={{
            position: 'absolute', bottom: 2, left: at(t), zIndex: 1,
            transform: i === 0 ? 'none' : i === 2 ? 'translateX(-100%)' : 'translateX(-50%)',
            fontFamily: NUM_FONT, fontSize: 7.5, color: C.text3, opacity: 0.7,
          }}>{t >= 100 ? Math.round(t) : t.toFixed(t < 10 ? 1 : 0)}</span>
        ))}
      </div>

      {/* the verdict. every chart on this site says what it means. */}
      <div style={{
        fontSize: 10, color: C.text2, marginTop: 6, lineHeight: 1.6,
        fontFamily: NUM_FONT,
      }}>
        cleared <b style={{ color: read.hits / read.n >= 0.5 ? C.green : C.text }}>
          {read.hits} of {read.n}
        </b>
        {read.overMargin != null && <> · overs by <b style={{ color: C.green }}>+{read.overMargin.toFixed(1)}</b> on average</>}
        {read.underMargin != null && <> · misses short by <b style={{ color: C.text3 }}>{read.underMargin.toFixed(1)}</b></>}
        {' '}· floor <b style={{ color: C.text }}>{read.floor}</b> · ceiling <b style={{ color: C.text }}>{read.ceiling}</b>
        {read.l5[1] >= 3 && <> · last {read.l5[1]}: <b style={{ color: read.l5[0] > read.l5[1] / 2 ? C.green : C.text3 }}>{read.l5[0]}/{read.l5[1]}</b></>}
      </div>
      {read.n < 6 && (
        <div style={{ fontSize: 9.5, color: C.text3, marginTop: 3 }}>
          {read.n} games — read the dots, not the rate.
        </div>
      )}
    </div>
  )
}
