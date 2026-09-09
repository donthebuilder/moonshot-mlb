'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { Empty } from './ui'
import FreshnessStamp from './FreshnessStamp'

// P/L SIMULATOR — the archive converted into the only number that matters.
//
// Every graded pick, per day per category, is in public/pick_pl.json (38 days,
// built from the local archive — same snapshot discipline as pick_matrix).
// You supply the odds you'd actually get for each category and a flat stake;
// this replays the season: every pick bet flat, wins paid at your line,
// losses eaten. Cumulative curve per category plus combined.
//
// WHAT THIS IS NOT. It is not a backtest of a strategy — it's the cost of
// following the bot blindly at the odds you enter. No line shopping, no
// skipping bad spots, no odds movement, flat stakes. The odds defaults are
// deliberately conservative round numbers, and the panel nags you to set your
// own because the entire conclusion swings on them: HIT picks at 64.5% are
// profitable at -150 and ruinous at -220, and no simulator can know which
// price your book actually hangs.

const KEY = 'moonshot_pl_odds_v1'

const DEFAULTS = {
  HR:      { odds: 400,  on: true,  label: 'HR',      hint: '1+ HR, typical +350 to +500' },
  TOP:     { odds: 400,  on: true,  label: 'Top',     hint: 'graded as 1+ HR' },
  TOP15:   { odds: 400,  on: false, label: 'Top15',   hint: 'board flag, overlaps TOP' },
  HIT:     { odds: -160, on: true,  label: 'Hit',     hint: '1+ hit, typical -140 to -200' },
  HRR:     { odds: 120,  on: true,  label: 'HRR',     hint: '2+ H+R+RBI, book-dependent' },
  CONTACT: { odds: 140,  on: true,  label: 'Contact', hint: '2+ TB, book-dependent' },
}

// American odds -> profit on a 1-unit stake.
const winProfit = (odds) => (odds >= 100 ? odds / 100 : odds <= -100 ? 100 / -odds : 0)

// 🌙 MOONS — the site's unit (2026-08-09).
//
// This panel used to print dollar signs. The maths was always unit maths — a
// flat stake replayed over the archive — but "$412" reads as a bankroll
// statement, which is not what this is and not what this site is for. One moon
// is one unit. Every number below is byte-for-byte the same as it was; only
// the label changed.
const MOON = '🌙'
const moons = (v, dp = 0) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(dp)} ${MOON}`

export default function PLSimulator() {
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading')
  const [stake, setStake] = useState(10)
  const [cfg, setCfg] = useState(DEFAULTS)

  useEffect(() => {
    let alive = true
    fetch('/pick_pl.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setData(j); setState(j ? 'done' : 'error') } })
      .catch(() => { if (alive) setState('error') })
    // Saved odds — entering your book's real lines once should stick.
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
      if (saved) setCfg((c) => ({ ...c, ...saved }))
    } catch { /* private mode */ }
    return () => { alive = false }
  }, [])

  const setCat = (k, patch) => setCfg((c) => {
    const next = { ...c, [k]: { ...c[k], ...patch } }
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ok */ }
    return next
  })

  const sim = useMemo(() => {
    if (!data) return null
    const cats = Object.keys(cfg).filter((k) => cfg[k].on)
    const series = { TOTAL: [] }
    cats.forEach((k) => { series[k] = [] })
    const totals = { TOTAL: { bets: 0, wins: 0, pl: 0 } }
    cats.forEach((k) => { totals[k] = { bets: 0, wins: 0, pl: 0 } })

    let cumTotal = 0
    const cum = {}
    cats.forEach((k) => { cum[k] = 0 })

    data.days.forEach((d) => {
      let dayTotal = 0
      cats.forEach((k) => {
        const c = d.cats[k]
        if (!c) { series[k].push({ date: d.date, v: cum[k] }); return }
        const profit = c.ok * winProfit(cfg[k].odds) * stake - (c.n - c.ok) * stake
        cum[k] += profit
        dayTotal += profit
        totals[k].bets += c.n; totals[k].wins += c.ok; totals[k].pl += profit
        series[k].push({ date: d.date, v: cum[k] })
      })
      cumTotal += dayTotal
      totals.TOTAL.bets = Object.keys(totals).filter((k) => k !== 'TOTAL').reduce((s, k) => s + totals[k].bets, 0)
      totals.TOTAL.wins = Object.keys(totals).filter((k) => k !== 'TOTAL').reduce((s, k) => s + totals[k].wins, 0)
      totals.TOTAL.pl = cumTotal
      series.TOTAL.push({ date: d.date, v: cumTotal })
    })
    // Break-even win rate per category at the entered odds, next to the
    // observed rate — the whole verdict in two numbers.
    const verdict = {}
    cats.forEach((k) => {
      const p = winProfit(cfg[k].odds)
      verdict[k] = {
        needed: 100 / (1 + p),
        got: totals[k].bets ? (100 * totals[k].wins) / totals[k].bets : 0,
      }
    })
    return { series, totals, verdict, cats }
  }, [data, cfg, stake])

  if (state === 'loading') return <Empty text="Loading the pick archive…" />
  if (state === 'error') return <Empty text="pick_pl.json could not be loaded." />

  const CAT_COLORS = {
    TOTAL: '#f4f4f5', HR: '#f97316', TOP: '#FCD34D', TOP15: '#a1a1aa',
    HIT: '#a78bfa', HRR: '#22d3ee', CONTACT: '#4ade80',
  }

  // SVG line chart, no library. X = day index, Y = cumulative units.
  const W = 720, H = 220, PAD = { l: 46, r: 8, t: 8, b: 20 }
  const allVals = Object.values(sim.series).flat().map((x) => x.v)
  const yMin = Math.min(0, ...allVals), yMax = Math.max(0, ...allVals)
  const nDays = data.days.length
  const x = (i) => PAD.l + (i / Math.max(1, nDays - 1)) * (W - PAD.l - PAD.r)
  const y = (v) => PAD.t + (1 - (v - yMin) / Math.max(1, yMax - yMin)) * (H - PAD.t - PAD.b)
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ')

  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 2 }}>
        🌙 P/L simulator <span style={{ fontSize: 10, color: C.text3, fontWeight: 600, fontFamily: NUM_FONT }}>· in moons</span>
      </div>
      <div style={{
        fontSize: 10, color: C.text2, lineHeight: 1.55, maxWidth: 700, marginBottom: 7,
        background: 'rgba(167,139,250,.07)', border: '1px solid rgba(167,139,250,.22)',
        borderRadius: 8, padding: '6px 10px',
      }}>
        Tracked in units — <b style={{ color: '#a78bfa' }}>🌙 moons, 1 moon = 1 unit</b> — never dollars.
        This site doesn&apos;t do bankrolls. The prices you enter below are <i>yours</i> and exist only to
        turn a record into a break-even test; Moonshot publishes no lines and never has.
      </div>
      {/* #35: this is the page that answers "did this make money", and it was
          the stalest page on the site with nothing saying so. The window was
          always printed; being BEHIND was not. */}
      <FreshnessStamp
        label="P/L archive"
        from={data.meta.from}
        to={data.meta.to}
        count={data.meta.days}
        unit="days"
        generated={data.meta.generated}
      />
      <div style={{ fontSize: 10, color: C.text3, marginBottom: 10, lineHeight: 1.55, maxWidth: 700 }}>
        Every graded pick over {data.meta.days} days ({data.meta.from} → {data.meta.to}), staked flat at
        the prices below. <b style={{ color: C.text2 }}>Put in the real ones</b> — the whole
        answer swings on them, and the defaults are only round numbers. This is the cost of following
        the bot blindly: no shopping, no skipping bad spots.
      </div>

      {/* odds inputs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <label style={{ fontSize: 9.5, color: C.text3 }} title="Moons staked on every single pick. 1 moon = 1 unit — this is a unit sizer, not a bankroll.">
          Stake / pick (🌙)
          <input
            type="number" value={stake} min={1}
            onChange={(e) => setStake(Math.max(1, Number(e.target.value) || 1))}
            style={{
              display: 'block', width: 72, background: C.bg2, border: `1px solid ${C.border}`,
              borderRadius: 7, padding: '5px 8px', fontSize: 12, color: C.text,
              fontFamily: NUM_FONT, outline: 'none', marginTop: 3,
            }}
          />
        </label>
        {Object.entries(cfg).map(([k, c]) => (
          <label key={k} title={c.hint} style={{ fontSize: 9.5, color: c.on ? C.text2 : C.text3 }}>
            <span
              onClick={() => setCat(k, { on: !c.on })}
              style={{ cursor: 'pointer', fontWeight: 700, color: c.on ? CAT_COLORS[k] : C.text3 }}
            >{c.on ? '☑' : '☐'} {c.label}</span>
            <input
              type="number" value={c.odds} step={5} disabled={!c.on}
              onChange={(e) => setCat(k, { odds: Number(e.target.value) || 0 })}
              style={{
                display: 'block', width: 66, background: C.bg2,
                border: `1px solid ${c.on ? C.border : 'transparent'}`,
                borderRadius: 7, padding: '5px 8px', fontSize: 12,
                color: c.on ? C.text : C.text3, fontFamily: NUM_FONT,
                outline: 'none', marginTop: 3, opacity: c.on ? 1 : 0.5,
              }}
            />
          </label>
        ))}
      </div>

      {/* verdict tiles: needed vs got */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {sim.cats.map((k) => {
          const v = sim.verdict[k]
          const good = v.got >= v.needed
          const t = sim.totals[k]
          return (
            <div key={k} style={{
              background: `linear-gradient(135deg, ${CAT_COLORS[k]}14, ${CAT_COLORS[k]}05)`,
              border: `1px solid ${CAT_COLORS[k]}3d`, borderRadius: 9, padding: '6px 11px',
            }}>
              <div style={{ fontSize: 8.5, fontWeight: 800, color: CAT_COLORS[k], letterSpacing: '.06em' }}>
                {cfg[k].label.toUpperCase()} · {t.wins}/{t.bets}
              </div>
              <div style={{ fontFamily: NUM_FONT, fontSize: 13, fontWeight: 900, color: t.pl >= 0 ? '#4ade80' : '#f87171' }}>
                {moons(t.pl)}
              </div>
              <div style={{ fontSize: 8.5, color: good ? '#4ade80' : '#f87171', fontFamily: NUM_FONT }}
                title="Win rate needed to break even at your odds, vs the rate the archive actually produced">
                need {v.needed.toFixed(0)}% · got {v.got.toFixed(0)}%
              </div>
            </div>
          )
        })}
        <div style={{
          background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 9, padding: '6px 11px',
        }}>
          <div style={{ fontSize: 8.5, fontWeight: 800, color: C.text3, letterSpacing: '.06em' }}>
            TOTAL · {sim.totals.TOTAL.bets} bets
          </div>
          <div style={{
            fontFamily: NUM_FONT, fontSize: 15, fontWeight: 900,
            color: sim.totals.TOTAL.pl >= 0 ? '#4ade80' : '#f87171',
          }}>
            {moons(sim.totals.TOTAL.pl)}
          </div>
          <div style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>
            {(sim.totals.TOTAL.bets * stake).toLocaleString()} 🌙 staked
          </div>
        </div>
      </div>

      {/* the curve */}
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '8px 6px 2px' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
          {/* zero line */}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="#3f3f46" strokeDasharray="3 4" />
          {/* Axis is bare numbers — the unit is moons and it's stated in the
              label below rather than repeated on three ticks. Emoji inside SVG
              <text> renders inconsistently across platforms; the caption is
              the reliable place to name the unit. */}
          <text x={PAD.l - 6} y={y(0) + 3} textAnchor="end" fill="#71717a" fontSize="9" fontFamily="monospace">0</text>
          {[yMax, yMin].map((v) => v !== 0 && (
            <text key={v} x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fill="#71717a" fontSize="9" fontFamily="monospace">
              {v > 0 ? '+' : '−'}{Math.abs(v).toFixed(0)}
            </text>
          ))}
          <text x={PAD.l - 6} y={PAD.t + 8} textAnchor="end" fill="#52525b" fontSize="8" fontFamily="monospace">moons</text>
          {/* category curves, thin; total, thick */}
          {sim.cats.map((k) => (
            <path key={k} d={path(sim.series[k])} fill="none" stroke={CAT_COLORS[k]} strokeWidth="1.1" opacity="0.75" />
          ))}
          <path d={path(sim.series.TOTAL)} fill="none" stroke={C.text} strokeWidth="2.2" />
          {/* date ticks: first, middle, last */}
          {[0, Math.floor((nDays - 1) / 2), nDays - 1].map((i) => (
            <text key={i} x={x(i)} y={H - 5} textAnchor="middle" fill="#71717a" fontSize="8.5" fontFamily="monospace">
              {data.days[i]?.date.slice(5)}
            </text>
          ))}
        </svg>
      </div>
      <div style={{ fontSize: 9.5, color: C.text3, marginTop: 6, lineHeight: 1.55 }}>
        Every value on this panel is in <b style={{ color: '#a78bfa' }}>🌙 moons</b> — 1 moon = 1 unit,
        and the vertical axis is cumulative moons. White is the combined book.{' '}
        <b style={{ color: C.text2 }}>need vs got</b> on each tile is the
        whole verdict: the break-even rate your prices demand against the rate the archive actually
        produced — a category can show green picks and still bleed moons if the price is wrong.
        Flat stakes, archived results; past performance isn&apos;t tomorrow&apos;s slate.
      </div>
    </div>
  )
}
