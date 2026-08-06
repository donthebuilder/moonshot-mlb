'use client'
import React, { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { thresholdRates, lastSeasonRates, staffQuality, teamAbbrs, starterHands, MARKETS } from '../lib/gamelogs'

// PROP GRID v4 — the full PF chart, on our data, with our context.
//
// What the latest teardown added (2026-08-06, from the Harper screenshot):
//   · ADJUSTABLE LINE — every market has line chips (1+/2+/3+ where sane), and
//     the tiles, streak, read line, last-season tile and timeline all
//     recompute against the chosen line. "2.5 H+R+RBI" is chips, not a dropdown.
//   · VALUE BARS — bar height is the actual number that game, green over the
//     line, red under, number on the bar; a faint white rule marks the line
//     and a dashed orange rule marks his average in the window.
//   · ARM FILTER — All / vs RHP / vs LHP, joined per game via the schedule's
//     probable starter (fetched lazily on first use, cached). Starter's arm,
//     which is the bulk of his PAs, not every PA — the note says so.
// Still here from earlier passes: venue filter, clickable window tiles that
// drive the timeline, pinnable game bars, opponent-staff tint strip.
// Live game logs; context lane, feeds no score.

const rateCol = (pct) => pct >= 60 ? '#4ade80' : pct >= 40 ? '#FCD34D' : pct >= 25 ? C.orange : '#f87171'

// Line options per market. Default is the first entry.
const LINES = { hit: [1, 2], tb2: [2, 3, 4], hr: [1, 2], hrr: [1, 2, 3], run: [1, 2], rbi: [1, 2] }
const SHORT = { hit: 'Hit', tb2: 'TB', hr: 'HR', hrr: 'H+R+RBI', run: 'Run', rbi: 'RBI' }

export default function ThresholdGrid({ playerId }) {
  const [data, setData] = useState(null)
  const [ls, setLs] = useState(null)
  const [staff, setStaff] = useState(null)
  const [abbrs, setAbbrs] = useState(null)
  const [hands, setHands] = useState(null)        // gamePk -> 'L' | 'R', lazy
  const [handsState, setHandsState] = useState('idle') // idle | loading | done | none
  const [mkt, setMkt] = useState('hr')
  const [line, setLine] = useState(1)
  const [venue, setVenue] = useState('all')
  const [arm, setArm] = useState('all')
  const [span, setSpan] = useState('L20')
  const [selGame, setSelGame] = useState(null)

  useEffect(() => {
    let alive = true
    setData(null); setHands(null); setHandsState('idle'); setArm('all'); setSelGame(null)
    thresholdRates(playerId).then((d) => { if (alive) setData(d) })
    lastSeasonRates(playerId).then((d) => { if (alive) setLs(d) })
    staffQuality().then((d) => { if (alive) setStaff(d) })
    teamAbbrs().then((d) => { if (alive) setAbbrs(d) })
    return () => { alive = false }
  }, [playerId])

  // Arm data is 3–4 extra API calls, so it loads the first time the filter is
  // actually touched, never before.
  const wantArm = (k) => {
    setArm(k); setSelGame(null)
    if (k !== 'all' && handsState === 'idle') {
      setHandsState('loading')
      starterHands(playerId).then((h) => { setHands(h); setHandsState(h ? 'done' : 'none') })
    }
  }

  if (data === null) return <div style={{ fontSize: 10, color: C.text3, padding: '6px 0', fontFamily: NUM_FONT }}>Loading game log…</div>
  if (!data) return null

  const m = MARKETS.find((x) => x.key === mkt) || MARKETS[0]
  const lines = LINES[m.key] || [1]
  const thr = lines.includes(line) ? line : lines[0]
  const valFor = (g) => m.key === 'hit' ? g.h : m.key === 'tb2' ? g.tb : m.key === 'hr' ? g.hr
    : m.key === 'run' ? g.r : m.key === 'hrr' ? g.h + g.r + g.rbi : g.rbi
  const clears = (g) => valFor(g) >= thr
  const dynLabel = `${thr}+ ${SHORT[m.key]}`

  // Pool = full log through every active filter; everything recomputes from it.
  const armReady = arm === 'all' || (handsState === 'done' && hands)
  const pool = (data.logAll || data.log || [])
    .filter((g) => venue === 'all' ? true : venue === 'home' ? g.home : !g.home)
    .filter((g) => (arm === 'all' || !armReady) ? true : hands[g.gamePk] === arm)
  const win = (size) => {
    const seg = pool.slice(0, size)
    return { ok: seg.filter(clears).length, n: seg.length }
  }
  const r = { L5: win(5), L10: win(10), L20: win(20), Szn: win(pool.length) }
  let stk = 0
  if (pool.length) {
    const first = clears(pool[0]); let k = 0
    for (const g of pool) { if (clears(g) === first) k++; else break }
    stk = first ? k : -k
  }
  const SPAN_N = { L5: 5, L10: 10, L20: 20, Szn: 40 }
  const filteredLog = pool.slice(0, SPAN_N[span] || 20)

  // Last season vs the SAME line, from the raw games that now ride along.
  const lsGames = ls?._games || null
  const lsOk = lsGames ? lsGames.filter(clears).length : null
  const lsN = lsGames ? lsGames.length : null

  // THE READ — the panel in one sentence, plus his per-game average (the
  // number PF draws as the purple AVG rule; ours is a word and a rule both).
  const p10 = r.L10.n ? (100 * r.L10.ok) / r.L10.n : null
  const pSzn = r.Szn.n ? (100 * r.Szn.ok) / r.Szn.n : null
  const pLs = lsN ? (100 * lsOk) / lsN : null
  const trend = p10 == null || pSzn == null ? null
    : p10 - pSzn >= 12 ? 'hot' : pSzn - p10 >= 12 ? 'cold' : 'steady'
  const trendCol = trend === 'hot' ? '#4ade80' : trend === 'cold' ? '#f87171' : C.text2
  const trendWord = trend === 'hot' ? 'running well above his own baseline'
    : trend === 'cold' ? 'below his baseline — cold stretch' : 'right at his norm'
  const avgVal = filteredLog.length ? filteredLog.reduce((a, g) => a + valFor(g), 0) / filteredLog.length : null

  // Value-bar scaling: one unit per run of the biggest thing in view.
  const maxVal = Math.max(thr + 1, ...filteredLog.map(valFor), 1)
  const unit = 42 / maxVal
  const showNums = filteredLog.length <= 28

  const chip = (on, danger) => ({
    padding: '2px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 9.5,
    fontWeight: 700, fontFamily: NUM_FONT,
    border: `1px solid ${on ? (danger ? '#f87171' : C.orange) : C.border}`,
    background: on ? (danger ? 'rgba(248,113,113,.12)' : 'rgba(249,115,22,.14)') : 'transparent',
    color: on ? (danger ? '#f87171' : C.orange) : C.text3,
  })

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>🎯 Props</span>
        <span style={{ fontSize: 9, color: C.text3 }}>how often he actually cashes each bet</span>
        {MARKETS.map((x) => {
          const rr = data.markets[x.key]
          const pb = rr?.L10?.n ? (100 * rr.L10.ok) / rr.L10.n : null
          return (
            <button key={x.key} onClick={() => { setMkt(x.key); setLine((LINES[x.key] || [1])[0]); setSelGame(null) }} style={{
              padding: '5px 13px', borderRadius: 999, cursor: 'pointer',
              fontSize: 11.5, fontWeight: 700, fontFamily: NUM_FONT,
              border: `1px solid ${mkt === x.key ? C.orange : C.border}`,
              background: mkt === x.key ? 'rgba(249,115,22,.14)' : 'transparent',
              color: mkt === x.key ? C.orange : C.text2,
            }}>
              {x.label}
              {pb != null && <span style={{ marginLeft: 5, fontSize: 9, color: mkt === x.key ? C.orange : rateCol(pb) }}>{pb.toFixed(0)}%</span>}
            </button>
          )
        })}
      </div>

      <div style={{
        background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.03))`,
        border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px',
      }}>
        {/* THE READ */}
        {p10 != null && (
          <div style={{ fontSize: 12.5, lineHeight: 1.55, marginBottom: 11, color: C.text2 }}>
            Cleared <b style={{ color: C.text }}>{dynLabel}</b> in{' '}
            <b style={{ fontFamily: NUM_FONT, color: rateCol(p10) }}>{r.L10.ok} of his last {r.L10.n}</b>
            {pSzn != null && <> — vs <span style={{ fontFamily: NUM_FONT }}>{pSzn.toFixed(0)}%</span> this season</>}
            {pLs != null && <>, <span style={{ fontFamily: NUM_FONT }}>{pLs.toFixed(0)}%</span> last year</>}.{' '}
            <b style={{ color: trendCol }}>{trendWord.charAt(0).toUpperCase() + trendWord.slice(1)}.</b>
            {avgVal != null && m.key !== 'hr' && <span style={{ color: C.text3 }}> Averaging <b style={{ fontFamily: NUM_FONT, color: C.text2 }}>{avgVal.toFixed(1)}</b> per game in view.</span>}
          </div>
        )}

        {/* filters: line · venue · arm */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {lines.length > 1 && (
            <>
              <span style={{ fontSize: 8, color: C.text3, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>Line</span>
              {lines.map((v) => (
                <button key={v} onClick={() => { setLine(v); setSelGame(null) }} style={chip(thr === v)}
                  title={`Over ${v - 0.5} — needs ${v}+ to cash`}>{v}+</button>
              ))}
              <span style={{ width: 6 }} />
            </>
          )}
          {[['all', 'All'], ['home', 'Home'], ['away', 'Away']].map(([k, label]) => (
            <button key={k} onClick={() => { setVenue(k); setSelGame(null) }} style={chip(venue === k)}>{label}</button>
          ))}
          <span style={{ width: 6 }} />
          {[['all', 'Any arm'], ['R', 'vs RHP'], ['L', 'vs LHP']].map(([k, label]) => (
            <button key={k} onClick={() => wantArm(k)} style={chip(arm === k)}
              title="Filter to games where the opposing STARTER threw from this side — the bulk of his PAs that night, not every PA">{label}</button>
          ))}
          {arm !== 'all' && handsState === 'loading' && (
            <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>checking who started each game…</span>
          )}
          {arm !== 'all' && handsState === 'none' && (
            <span style={{ fontSize: 9, color: C.orange, fontFamily: NUM_FONT }}>couldn&apos;t resolve starters — showing all games</span>
          )}
          {(venue !== 'all' || (arm !== 'all' && armReady)) && (
            <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>
              every tile below recomputed · {pool.length} games match
            </span>
          )}
        </div>

        {/* window tiles — clickable, they drive the timeline */}
        <div style={{
          display: 'grid', gap: 6, marginBottom: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(76px, 1fr))',
        }}>
          {[['L5', 'Last 5'], ['L10', 'Last 10'], ['L20', 'Last 20'], ['Szn', 'Season']].map(([w, label]) => {
            const { ok, n } = r[w]
            const pct = n ? (100 * ok) / n : null
            const on = span === w
            return (
              <button key={w} onClick={() => { setSpan(w); setSelGame(null) }}
                title="Click — the timeline below shows exactly this window"
                style={{
                  textAlign: 'center', cursor: 'pointer',
                  background: on ? 'rgba(249,115,22,.08)' : 'rgba(255,255,255,.03)',
                  border: `1px solid ${on ? C.orange : C.border}`, borderRadius: 9, padding: '7px 4px 6px',
                  boxShadow: on ? '0 0 10px rgba(249,115,22,.18)' : 'none',
                }}>
                <div style={{ fontSize: 8, color: on ? C.orange : C.text3, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 800 }}>{label}</div>
                <div style={{ fontFamily: NUM_FONT, fontSize: 21, fontWeight: 900, lineHeight: 1.25, color: pct != null ? rateCol(pct) : C.text3 }}>
                  {pct != null ? `${pct.toFixed(0)}%` : '—'}
                </div>
                <div style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3 }}>{n ? `${ok}/${n}` : ' '}</div>
              </button>
            )
          })}
          {lsN > 0 && (
            <div style={{ textAlign: 'center', background: 'rgba(255,255,255,.02)', border: `1px dashed ${C.border2}`, borderRadius: 9, padding: '7px 4px 6px' }}
              title={`Last season, full year, same ${dynLabel} line — the long-memory anchor the recent windows swing around`}>
              <div style={{ fontSize: 8, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 800 }}>{new Date().getFullYear() - 1}</div>
              <div style={{ fontFamily: NUM_FONT, fontSize: 21, fontWeight: 900, lineHeight: 1.25, color: rateCol((100 * lsOk) / lsN) }}>
                {((100 * lsOk) / lsN).toFixed(0)}%
              </div>
              <div style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3 }}>{lsOk}/{lsN}</div>
            </div>
          )}
          <div style={{
            textAlign: 'center', borderRadius: 9, padding: '7px 4px 6px',
            background: stk > 0 ? 'rgba(74,222,128,.10)' : stk < 0 ? 'rgba(248,113,113,.08)' : 'rgba(255,255,255,.03)',
            border: `1px solid ${stk > 0 ? '#4ade8055' : stk < 0 ? '#f8717144' : C.border}`,
          }}>
            <div style={{ fontSize: 8, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 800 }}>Streak</div>
            <div style={{ fontFamily: NUM_FONT, fontSize: 21, fontWeight: 900, lineHeight: 1.25, color: stk > 0 ? '#4ade80' : stk < 0 ? '#f87171' : C.text3 }}>
              {stk > 0 ? `W${stk}` : stk < 0 ? `L${-stk}` : '—'}
            </div>
            <div style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3 }}>{dynLabel}</div>
          </div>
        </div>

        {/* TIMELINE v3 — value bars against the line, PF's chart made ours.
            Height IS the number; green clears the line, red doesn't; the
            faint white rule is the line, the dashed orange rule his average.
            Opp-staff tint strip and pinnable bars carry over. */}
        {filteredLog.length > 0 && (
          <div style={{ position: 'relative' }}>
            {/* the line */}
            <div style={{
              position: 'absolute', left: 0, right: 0,
              bottom: 10 + Math.min(46, (thr - 0.5) * unit), height: 1,
              background: 'rgba(255,255,255,.35)', pointerEvents: 'none', zIndex: 2,
            }} title={`the ${thr - 0.5} line`} />
            {/* his average */}
            {avgVal != null && (
              <div style={{
                position: 'absolute', left: 0, right: 0,
                bottom: 10 + Math.min(46, avgVal * unit), height: 0,
                borderTop: `1px dashed rgba(249,115,22,.6)`, pointerEvents: 'none', zIndex: 2,
              }} title={`his average: ${avgVal.toFixed(1)} per game in view`} />
            )}
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
              {[...filteredLog].reverse().map((g, gi) => {
                const val = valFor(g)
                const ok = val >= thr
                const q = staff?.[g.oppId]
                const ab = abbrs?.[g.oppId] || g.opp
                const oppCol = q ? `rgba(249,115,22,${(0.18 + q.soft * 0.72).toFixed(2)})` : 'rgba(255,255,255,.08)'
                const oppNote = q ? ` · ${ab} staff: OPS-against ${q.ops.toFixed(3)}, #${q.rank}/30 toughest` : ''
                const isSel = selGame === `${g.date}${gi}`
                const hgt = Math.max(5, Math.min(48, 5 + val * unit))
                return (
                  <div key={gi} title={`${g.date} ${g.home ? 'vs' : '@'} ${ab} — ${val} (${g.h}H ${g.tb}TB ${g.hr}HR)${oppNote}`}
                    onClick={() => setSelGame(isSel ? null : `${g.date}${gi}`)}
                    style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', cursor: 'pointer' }}>
                    {showNums && val > 0 && (
                      <div style={{ fontFamily: NUM_FONT, fontSize: 9, fontWeight: 800, color: ok ? '#4ade80' : 'rgba(248,113,113,.8)', textAlign: 'center', marginBottom: 1 }}>{val}</div>
                    )}
                    <div style={{
                      height: hgt, borderRadius: '3px 3px 1px 1px',
                      background: ok
                        ? 'linear-gradient(180deg, #86efac, #4ade80)'
                        : val > 0 ? 'linear-gradient(180deg, rgba(248,113,113,.6), rgba(248,113,113,.35))' : 'rgba(248,113,113,.22)',
                      boxShadow: isSel ? '0 0 0 1.5px #fff' : ok && val >= thr + 1 ? '0 0 9px rgba(74,222,128,.45)' : 'none',
                    }} />
                    <div style={{ height: 4, borderRadius: 2, marginTop: 3, background: isSel ? '#fff' : oppCol }} />
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* pinned game */}
        {selGame && (() => {
          const rev = [...filteredLog].reverse()
          const idx = rev.findIndex((g, gi) => `${g.date}${gi}` === selGame)
          if (idx < 0) return null
          const g = rev[idx]
          const q = staff?.[g.oppId]
          const ab = abbrs?.[g.oppId] || g.opp
          const hand = hands?.[g.gamePk]
          return (
            <div style={{
              marginTop: 7, padding: '6px 10px', borderRadius: 8, fontSize: 10.5,
              fontFamily: NUM_FONT, color: C.text2, background: 'rgba(255,255,255,.04)',
              border: `1px solid ${C.border2}`, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline',
            }}>
              <b style={{ color: C.text }}>{g.date} {g.home ? 'vs' : '@'} {ab}</b>
              <span>{g.h} H</span><span>{g.tb} TB</span>
              <span style={{ color: g.hr > 0 ? '#4ade80' : undefined, fontWeight: g.hr > 0 ? 800 : 400 }}>{g.hr} HR</span>
              <span>{g.r} R</span><span>{g.rbi} RBI</span><span style={{ color: C.text3 }}>{g.ab} AB</span>
              {hand && <span style={{ color: C.text3 }}>{hand}HP started</span>}
              {q && <span style={{ color: C.text3 }}>staff #{q.rank}/30 · OPS-ag {q.ops.toFixed(3)}</span>}
              <button onClick={() => setSelGame(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.text3, cursor: 'pointer', fontSize: 11 }}>✕</button>
            </div>
          )
        })()}

        <div style={{ fontSize: 9.5, color: C.text3, marginTop: 8, lineHeight: 1.55 }}>
          {filteredLog.length} games, newest right — bar height is the actual {SHORT[m.key]} count,{' '}
          <span style={{ color: '#4ade80' }}>green clears the {thr - 0.5} line</span> (white rule), red doesn&apos;t;
          the dashed orange rule is his average{staff && <>; the strip under each bar is the opposing staff —{' '}
          <span style={{ color: C.orange }}>brighter orange = softer arms</span></>}. Window tiles above are
          clickable and drive this chart. Tap any bar to pin that game.
        </div>
      </div>
    </div>
  )
}
