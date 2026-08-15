'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { fetchJSON } from '../../lib/data'
import { Empty } from '../ui'
import Sparkline, { GameStrip } from '../Sparkline'
import { runsPaths, runsLookReal, readRun, marketOf, barLabel, MARKETS } from '../../lib/runs'

// 🔥 RUNS — who is hot, at the bar YOU pick.
//
// 2026-08-15, from the boards Donovan sent: a player board of strips, and a
// "hottest active runs" panel. They're the same object, so this is one page:
// pick a market and a number, and every hitter on tonight's slate sorts by the
// length of his active run with his last thirty games underneath.
//
// THREE THINGS THE ORIGINAL DOESN'T DO.
//
//   1. THE BAR IS YOURS. 1+ Hit and 2+ Hits are different questions and a
//      board that only answers one of them is answering the easy one. Every
//      threshold is a chip and the whole board recomputes on the click,
//      because the payload is raw lines rather than a frozen rate.
//   2. COLD RUNS COUNT. Sort by the drought and you get the fade board — the
//      same information, the other direction, which a "hottest" panel throws
//      away. Nine misses in a row is a position too.
//   3. IT SAYS WHAT A RUN IS WORTH. A five-game run reads like a signal; a
//      hitter who clears the bar 60% of the time makes five in a row roughly
//      one time in thirteen, which is to say regularly. The panel does that
//      arithmetic instead of leaving the streak to speak for itself.
//
// Rides bots/player_splits.py's existing fetch — no new request on either side.

const chip = (on) => ({
  padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 9.5,
  fontWeight: 800, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
  border: `1px solid ${on ? C.orange : C.border}`,
  background: on ? 'rgba(249,115,22,.14)' : 'transparent',
  color: on ? C.orange : C.text3,
})

const SPLITS = [['all', 'All games'], ['D', 'Day'], ['N', 'Night'], ['H', 'Home'], ['A', 'Road']]
const pct = (w) => (w ? `${w.pct.toFixed(0)}%` : '—')

/**
 * How ordinary is this run?
 *
 * If he clears the bar at rate p, an active run of k is roughly a p^k event on
 * any given stretch — so a 5-game run for a 60% hitter happens about one
 * stretch in 13, which is to say most weeks. Saying so is the difference
 * between a board that finds signal and one that manufactures it.
 */
function runOdds(run, base) {
  if (!base || run <= 1) return null
  const p = base.pct / 100
  if (!(p > 0 && p < 1)) return null
  const one = Math.pow(p, run)
  if (one <= 0) return null
  return Math.round(1 / one)
}

export default function Runs({ players = [], onPlayerClick }) {
  const [data, setData] = useState(undefined)
  const [mk, setMk] = useState('hit')
  const [thr, setThr] = useState(1)
  const [split, setSplit] = useState('all')
  const [dir, setDir] = useState('hot')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)

  useEffect(() => {
    let alive = true
    fetchJSON(runsPaths(), runsLookReal)
      .then((j) => { if (alive) setData(j || null) })
      .catch(() => { if (alive) setData(null) })
    return () => { alive = false }
  }, [])

  const market = marketOf(mk)
  const bar = market.lines.includes(thr) ? thr : market.lines[0]

  // Only hitters actually on tonight's card. The payload is built from the
  // slate, but a slate rebuild between the splits job and now can leave a name
  // in it who has since been scratched — and a run board is a board about
  // tonight.
  const onSlate = useMemo(() => {
    const s = new Set((players || []).map((p) => Number(p?.player_id ?? p?.id)).filter(Boolean))
    return s.size ? s : null
  }, [players])

  const rows = useMemo(() => {
    if (!data?.players) return []
    const needle = q.trim().toLowerCase()
    return data.players
      .filter((p) => !onSlate || onSlate.has(Number(p.player_id)))
      .filter((p) => !needle
        || String(p.name || '').toLowerCase().includes(needle)
        || String(p.team || '').toLowerCase().includes(needle))
      .map((p) => ({ p, r: readRun(p.g, market.col, bar, split) }))
      .filter((x) => x.r && x.r.n >= 5)
      .sort((a, b) => (dir === 'hot'
        ? (b.r.run - a.r.run) || (b.r.l15?.pct ?? 0) - (a.r.l15?.pct ?? 0)
        : (a.r.run - b.r.run) || (a.r.l15?.pct ?? 0) - (b.r.l15?.pct ?? 0)))
  }, [data, market, bar, split, dir, q, onSlate])

  if (data === undefined) {
    return <div style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT, padding: 18 }}>Loading the run board…</div>
  }
  if (!data) {
    return (
      <div>
        <Head />
        <Empty text="No run board published yet. It's written by the splits job on the Today workflow — one run and this fills in." />
      </div>
    )
  }

  const label = barLabel(market, bar)

  return (
    <div>
      <Head stamp={data.slate_date} n={rows.length} span={data.games_per_player} />

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 9 }}>
        {MARKETS.map((m) => (
          <button key={m.key} onClick={() => { setMk(m.key); setThr(m.lines[0]); setOpen(null) }}
            style={chip(mk === m.key)}>{m.label}</button>
        ))}
        <span style={{ width: 8 }} />
        <span style={{ fontSize: 8, color: C.text3, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>Bar</span>
        {market.lines.map((v) => (
          <button key={v} onClick={() => { setThr(v); setOpen(null) }} style={chip(bar === v)}>{v}+</button>
        ))}
        <span style={{ width: 8 }} />
        {SPLITS.map(([k, l]) => (
          <button key={k} onClick={() => { setSplit(k); setOpen(null) }} style={chip(split === k)}
            title="The windows are computed on what survives this filter — 'his last 10 night games', not 'his last 10 games'.">{l}</button>
        ))}
        <span style={{ width: 8 }} />
        <button onClick={() => setDir('hot')} style={chip(dir === 'hot')}>Hot</button>
        <button onClick={() => setDir('cold')} style={chip(dir === 'cold')}
          title="The same board, the other direction — who has missed this bar the most times running.">Cold</button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="player or team"
          style={{
            marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 10.5, padding: '4px 9px',
            borderRadius: 999, border: `1px solid ${C.border}`, background: 'transparent',
            color: C.text, minWidth: 128, outline: 'none',
          }} />
      </div>

      {!rows.length ? (
        <Empty text={`Nobody on tonight's card has five ${split === 'all' ? '' : 'qualifying '}games logged for ${label}.`} />
      ) : (
        <>
          {/* ── the leaders, as cards ── */}
          <div style={{
            display: 'grid', gap: 7, marginBottom: 12,
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
          }}>
            {rows.slice(0, 6).map(({ p, r }) => {
              const odds = runOdds(Math.abs(r.run), r.l30 || r.l15)
              const hot = r.run > 0
              return (
                <div key={p.player_id} onClick={() => onPlayerClick?.(slateRow(players, p))} className="tap-row"
                  style={{
                    border: `1px solid ${hot ? 'rgba(74,222,128,.3)' : 'rgba(248,113,113,.28)'}`,
                    borderRadius: 12, padding: '9px 12px', cursor: 'pointer',
                    background: hot ? 'rgba(74,222,128,.05)' : 'rgba(248,113,113,.04)',
                  }}>
                  <div style={{ fontFamily: NUM_FONT, fontSize: 8, color: C.text3, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                    {p.team}{p.opp ? ` vs ${p.opp}` : ''} · {label}
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, marginTop: 1 }}>{p.name}</div>
                  <div style={{
                    fontFamily: NUM_FONT, fontSize: 17, fontWeight: 900, marginTop: 2,
                    color: hot ? '#4ade80' : '#f87171',
                  }}>
                    {Math.abs(r.run)} game {hot ? 'run' : 'drought'}
                  </div>
                  <div style={{ margin: '5px 0 4px' }}><Sparkline strip={r.strip} run={r.run} /></div>
                  <div style={{ display: 'flex', gap: 10, fontFamily: NUM_FONT, fontSize: 9.5, color: C.text3 }}>
                    <span>L5 <b style={{ color: C.text2 }}>{pct(r.l5)}</b></span>
                    <span>L10 <b style={{ color: C.text2 }}>{pct(r.l10)}</b></span>
                    <span>L15 <b style={{ color: C.text2 }}>{pct(r.l15)}</b></span>
                    <span>L30 <b style={{ color: C.text2 }}>{pct(r.l30)}</b></span>
                  </div>
                  {odds && (
                    <div style={{ fontSize: 9, color: C.text3, marginTop: 3, lineHeight: 1.45 }}>
                      At his own {pct(r.l30 || r.l15)} rate, {Math.abs(r.run)} in a row comes up about
                      once every <b style={{ color: C.text2 }}>{odds}</b> stretches
                      {odds <= 20 ? ' — which is to say regularly.' : '.'}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* ── the full board ── */}
          <div style={{ display: 'grid', gap: 4, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 330px), 1fr))' }}>
            {rows.map(({ p, r }) => {
              const isOpen = open === p.player_id
              return (
                <div key={p.player_id} style={{
                  border: `1px solid ${isOpen ? `${C.orange}55` : C.border}`, borderRadius: 9,
                  background: isOpen ? 'rgba(249,115,22,.05)' : C.bg2,
                  padding: '6px 9px', gridColumn: isOpen ? '1 / -1' : 'auto',
                }}>
                  <div onClick={() => setOpen(isOpen ? null : p.player_id)} className="tap-row"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minWidth: 0 }}>
                    <span style={{
                      fontFamily: NUM_FONT, fontSize: 11, fontWeight: 900, minWidth: 26, textAlign: 'right',
                      color: r.run > 0 ? '#4ade80' : r.run < 0 ? '#f87171' : C.text3,
                    }}>{r.run > 0 ? `${r.run}▲` : `${-r.run}▼`}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
                      {p.name}
                      <span style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3, marginLeft: 5 }}>{p.team}</span>
                    </span>
                    <Sparkline strip={r.strip} run={r.run} size={6} max={15} />
                    <span style={{ fontFamily: NUM_FONT, fontSize: 9.5, color: C.text3, minWidth: 30, textAlign: 'right' }}>
                      {pct(r.l15)}
                    </span>
                  </div>
                  {isOpen && (
                    <div style={{ paddingTop: 8 }}>
                      <div style={{ display: 'flex', gap: 12, marginBottom: 7, flexWrap: 'wrap', fontFamily: NUM_FONT, fontSize: 10, color: C.text3 }}>
                        {[['L5', r.l5], ['L10', r.l10], ['L15', r.l15], ['L30', r.l30]].map(([l, w]) => (
                          <span key={l} title={w ? `${w.ok} of ${w.n}` : ''}>
                            {l} <b style={{ color: C.text, fontSize: 12 }}>{pct(w)}</b>
                          </span>
                        ))}
                        <button onClick={(e) => { e.stopPropagation(); onPlayerClick?.(slateRow(players, p)) }}
                          style={{ ...chip(false), marginLeft: 'auto' }}>open his card →</button>
                      </div>
                      <GameStrip strip={r.strip} max={15} />
                      <div style={{ fontSize: 8.5, color: C.text3, marginTop: 5 }}>
                        {label} · newest on the right · green cleared it
                        {split !== 'all' ? ` · ${SPLITS.find(([k]) => k === split)?.[1].toLowerCase()} only` : ''}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// The board's rows come from the published payload; the modal needs a SLATE
// row. Falling back to a synthesised one would open a card with no matchup,
// no scores and no detail file, which reads as a broken modal rather than a
// missing player.
function slateRow(players, p) {
  return (players || []).find((x) => Number(x?.player_id ?? x?.id) === Number(p.player_id)) || null
}

function Head({ stamp, n, span }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 900 }}>🔥 Runs</span>
        {n != null && (
          <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
            {n} hitters · last {span || 30} games{stamp ? ` · ${stamp}` : ''}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: C.text2, lineHeight: 1.6, maxWidth: 780, marginBottom: 10 }}>
        Everyone on tonight&apos;s card, sorted by how many games running they&apos;ve cleared the bar you
        pick. <b style={{ color: C.text }}>Cold</b> flips it to the drought board — nine misses in a row
        is a position too. The strip is his last games, newest on the right, and the active run is the
        bright end of it.
      </div>
    </>
  )
}
