'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import {
  nameOf, teamOf, oppOf, n,
  hrScore, hitScore, prodScore, tbScore,
} from '../../lib/player'
import { PanelTitle, Empty } from '../ui'
import DenseTable from '../DenseTable'
import { rampColor, inkFor } from '../Heatmap'

// Pools — the parlay bench.
//
// Every other board on this site ranks hitters, and the lane and stat filters
// this page used to carry are all available on Leaders, Due and the boards. So
// this page does the one thing none of those do: it BUILDS a ticket. Pick a
// market, pick a leg count, get a price.
//
// The probabilities are not invented. BANDS below are the hit rates each score
// band ACTUALLY produced across 34 graded days — the same calibration table the
// Games projection uses, copied from streamlit_app.py. A score of 72 doesn't
// become "72% likely"; it becomes "hitters in the 70+ band did this 18.7% of
// the time". That is the difference between a projection and a vibe, and it is
// the only reason this page is allowed to print odds at all.

const BANDS = {
  hr:    { 0: 12.8, 40: 15.0, 55: 15.3, 70: 18.7, 85: 16.1 },
  hit:   { 0: 61.8, 40: 59.5, 55: 63.0, 70: 65.4, 85: 72.0 },
  bases: { 0: 37.8, 40: 37.5, 55: 41.6, 70: 34.3, 85: 45.5 },
}

const MARKETS = [
  { key: 'hr',    label: 'Home run', band: 'hr',    score: hrScore,   needs: '1+ HR' },
  { key: 'hit',   label: '1+ hit',   band: 'hit',   score: hitScore,  needs: '1+ hit' },
  { key: 'hrr',   label: 'HRR',      band: 'hit',   score: prodScore, needs: '2+ H+R+RBI', proxy: true },
  { key: 'bases', label: '2+ bases', band: 'bases', score: tbScore,   needs: '2+ TB' },
  { key: 'combo', label: 'Combo',    band: null,    score: null,      needs: 'mixed' },
]
const marketOf = (k) => MARKETS.find((x) => x.key === k) || MARKETS[0]

// Highest band floor the score clears — same lookup as the Games projection.
function bandRate(score, band) {
  const bands = BANDS[band]
  const floors = Object.keys(bands).map(Number).sort((a, b) => a - b)
  let rate = bands[floors[0]]
  floors.forEach((f) => { if (score >= f) rate = bands[f] })
  return rate / 100
}

// Fair American odds — what the line would be with no vig. The number to hold a
// book's price up against.
function fairOdds(p) {
  if (!(p > 0) || p >= 1) return '—'
  return p >= 0.5
    ? `-${Math.round((100 * p) / (1 - p))}`
    : `+${Math.round((100 * (1 - p)) / p)}`
}

export default function Pools({ players = [], onPlayerClick }) {
  const [market, setMarket] = useState('hr')
  const [legs, setLegs] = useState(3)
  const [spread, setSpread] = useState(true)
  const [pool, setPool] = useState([])

  const m = marketOf(market)
  const keyOf = (p) => `${p?.player_id ?? nameOf(p)}-${p?.game_pk ?? ''}`

  // Candidate legs. On Combo each hitter enters on his own best market — that's
  // the point of a combo ticket: play each bat for what it actually does.
  const candidates = useMemo(() => players.map((p) => {
    let mk = m
    if (market === 'combo') {
      mk = [MARKETS[0], MARKETS[1], MARKETS[3]]
        .map((x) => ({ x, r: bandRate(x.score(p), x.band) }))
        .sort((a, b) => b.r - a.r)[0].x
    }
    const sc = mk.score(p)
    return {
      _key: keyOf(p),
      _raw: p,
      market: mk.label,
      needs: mk.needs,
      name: nameOf(p),
      team: teamOf(p),
      opp: oppOf(p),
      game: p?.game_pk,
      score: sc,
      prob: bandRate(sc, mk.band),
      weak: p?.weak_spot_flag ? 1 : 0,
      hr9: n(p?.pitcher_hr9, 0),
    }
  }).sort((a, b) => b.prob - a.prob || b.score - a.score), [players, market, m])

  const suggested = useMemo(() => {
    const out = []
    const seen = new Set()
    for (const c of candidates) {
      if (out.length >= legs) break
      if (spread && c.game && seen.has(c.game)) continue
      seen.add(c.game)
      out.push(c)
    }
    return out
  }, [candidates, legs, spread])

  const ticket = useMemo(() => (
    pool.length
      ? pool.map((k) => candidates.find((c) => c._key === k)).filter(Boolean)
      : suggested
  ), [pool, candidates, suggested])

  const combined = ticket.reduce((acc, c) => acc * c.prob, 1)
  const sameGame = new Set(ticket.map((c) => c.game)).size < ticket.length

  const toggle = (k) => setPool((prev) => (
    prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
  ))

  if (!players.length) return <Empty text="No players on this slate yet." />

  return (
    <div>
      <PanelTitle
        title="Pools"
        sub="Build a parlay — pick a market, pick your legs, see the honest price"
        right={pool.length > 0 && (
          <button
            onClick={() => setPool([])}
            style={{
              padding: '4px 10px', fontSize: 10.5, fontWeight: 700, borderRadius: 6,
              cursor: 'pointer', border: `1px solid ${C.border}`,
              background: 'transparent', color: C.text3,
            }}
          >Clear my {pool.length} legs</button>
        )}
      />

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', margin: '8px 0 10px' }}>
        {MARKETS.map((x) => (
          <button
            key={x.key}
            onClick={() => { setMarket(x.key); setPool([]) }}
            style={{
              padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 7, cursor: 'pointer',
              border: `1px solid ${market === x.key ? C.orange : C.border}`,
              background: market === x.key ? 'rgba(249,115,22,.12)' : 'transparent',
              color: market === x.key ? C.orange : C.text3,
            }}
          >{x.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', letterSpacing: '.06em' }}>Legs</span>
        {[2, 3, 4, 5, 6].map((k) => {
          const on = legs === k && !pool.length
          return (
            <button
              key={k}
              onClick={() => { setLegs(k); setPool([]) }}
              style={{
                width: 28, height: 26, fontSize: 11, fontWeight: 800, borderRadius: 6,
                cursor: 'pointer', fontFamily: NUM_FONT,
                border: `1px solid ${on ? C.orange : C.border}`,
                background: on ? 'rgba(249,115,22,.12)' : 'transparent',
                color: on ? C.orange : C.text3,
              }}
            >{k}</button>
          )
        })}
        <button
          onClick={() => setSpread((v) => !v)}
          title="Two hitters in the same game rise and fall together, so a same-game ticket is riskier than independent multiplication suggests."
          style={{
            padding: '4px 11px', fontSize: 10.5, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
            border: `1px solid ${spread ? C.orange : C.border}`,
            background: spread ? 'rgba(249,115,22,.12)' : 'transparent',
            color: spread ? C.orange : C.text3,
          }}
        >One leg per game</button>
      </div>

      <div style={{
        background: C.bg2, border: `1px solid ${C.orange}55`, borderRadius: 12,
        padding: '12px 15px', marginBottom: 10,
      }}>
        <div style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', letterSpacing: '.06em' }}>
          {pool.length ? 'Your ticket' : `Suggested ${legs}-leg ${m.label.toLowerCase()}`}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', margin: '4px 0 8px' }}>
          <span style={{ fontFamily: NUM_FONT, fontSize: 24, fontWeight: 800, color: C.orange }}>
            {(combined * 100).toFixed(1)}%
          </span>
          <span style={{ fontSize: 12, color: C.text2, fontFamily: NUM_FONT }}>
            fair price <b style={{ color: C.text }}>{fairOdds(combined)}</b>
          </span>
          <span style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT }}>
            {ticket.length} leg{ticket.length === 1 ? '' : 's'}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {ticket.map((c) => {
            const bg = rampColor(c.prob, 0, 0.75)
            return (
              <div
                key={c._key}
                onClick={() => onPlayerClick?.(c._raw)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '3px 0', fontSize: 11.5 }}
              >
                <span style={{ color: C.text, fontWeight: 700, minWidth: 140 }}>{c.name}</span>
                <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, minWidth: 78 }}>
                  {c.team} vs {c.opp}
                </span>
                <span style={{ fontSize: 10, color: C.text2, minWidth: 82 }}>{c.needs}</span>
                {c.weak > 0 && <span style={{ color: C.orange, fontSize: 10 }}>★</span>}
                <span style={{
                  marginLeft: 'auto', background: bg, color: inkFor(bg),
                  fontFamily: NUM_FONT, fontSize: 10.5, fontWeight: 800,
                  padding: '1px 7px', borderRadius: 5,
                }}>{(c.prob * 100).toFixed(1)}%</span>
                <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, minWidth: 46, textAlign: 'right' }}>
                  {fairOdds(c.prob)}
                </span>
              </div>
            )
          })}
        </div>

        <div style={{ fontSize: 9.5, color: C.text3, marginTop: 8, lineHeight: 1.55 }}>
          Legs multiplied as independent events.{' '}
          {sameGame
            ? <b style={{ color: C.orange }}>This ticket has two hitters in the same game — they rise and fall together, so the true probability is higher than shown and so is the variance.</b>
            : 'One leg per game, so treating them as independent is roughly fair.'}
          {' '}These are rates each score band actually produced over 34 graded days, not a model
          score dressed up as a percentage.
          {m.proxy && ' HRR has no calibration table of its own, so it borrows the base-hit bands — treat its price as the softest here.'}
        </div>
      </div>

      <div style={{ fontSize: 10.5, color: C.text3, marginBottom: 8 }}>
        Click any row to add or remove it from your own ticket.
        {pool.length > 0 && <b style={{ color: C.orange }}> {pool.length} locked in.</b>}
      </div>

      <DenseTable
        rows={candidates.map((c) => ({ ...c, picked: pool.includes(c._key) ? 1 : 0 }))}
        columns={[
          { key: 'picked', label: '✓',        flag: true, mark: '✓', w: 30 },
          { key: 'name',   label: 'Batter',   heat: false, w: 148, bold: true, sticky: true },
          { key: 'team',   label: 'Tm',       heat: false, w: 34, mono: true, dim: true },
          { key: 'opp',    label: 'Opp',      heat: false, w: 34, mono: true, dim: true },
          { key: 'market', label: 'Market',   heat: false, w: 84, dim: true },
          { key: 'needs',  label: 'Needs',    heat: false, w: 86, dim: true },
          { key: 'weak',   label: '★',        flag: true, mark: '★', w: 30 },
          { key: 'prob',   label: 'Hit rate', w: 62,
            fmt: (v) => `${(Number(v) * 100).toFixed(1)}%` },
          { key: 'score',  label: 'Score',    w: 48, dp: 1 },
          { key: 'hr9',    label: 'P HR/9',   w: 48, dp: 2 },
        ]}
        onRowClick={(r) => toggle(r._key)}
        initialSort="prob"
        maxHeight={440}
        caption="Hit rate moves in steps rather than smoothly — that's the calibration being honest about its resolution. Every hitter inside one score band gets that band's observed rate."
      />
    </div>
  )
}
