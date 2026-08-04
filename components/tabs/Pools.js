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
import PairBuilder from '../PairBuilder'

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

// Live pools — the bot's own group tickets, graded as the night runs.
// pair_pool_results.graded_pools carries the members and homer_names, so this
// is the same structure Results shows, surfaced where you'd actually build
// against it.
function LivePools({ results }) {
  const pools = (results?.pair_pool_results?.graded_pools) || []
  if (!pools.length) return null

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 2 }}>Live pools</div>
      <div style={{ fontSize: 10, color: C.text3, marginBottom: 8 }}>
        The bot&apos;s group tickets for today, graded as games finish. A pool clears only when every
        member goes deep, so most of these end the night unfinished — that&apos;s the shape of the bet,
        not a failure of the picks.
      </div>
      <div style={{
        display: 'grid', gap: 8,
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      }}>
        {pools.map((pl, i) => {
          const hit = n(pl.hr_count, 0)
          const tot = Math.max(1, n(pl.total_count, 0))
          const done = hit >= tot
          const col = done ? '#4ade80' : hit > 0 ? C.orange : C.border
          const homered = new Set((pl.homer_names || []).map((x) => String(x || '').toLowerCase()))
          return (
            <div key={i} style={{
              background: C.bg2, border: `1px solid ${col}55`, borderRadius: 10, padding: '9px 12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: C.text2 }}>{pl.label}</span>
                <span style={{
                  marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 12,
                  fontWeight: 800, color: col === C.border ? C.text3 : col,
                }}>{hit}/{tot} HR</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
                {(pl.players || []).map((mb, j) => {
                  const gone = homered.has(String(mb?.name || '').toLowerCase())
                  return (
                    <span key={j} style={{
                      fontSize: 10.5,
                      color: gone ? '#4ade80' : C.text3,
                      fontWeight: gone ? 700 : 400,
                    }}>{gone ? '💥 ' : ''}{mb?.name}</span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Pools({ players = [], results, pairHistorySummary, onPlayerClick }) {
  const [market, setMarket] = useState('hr')
  const [legs, setLegs] = useState(3)
  const [spread, setSpread] = useState(true)
  const [pool, setPool] = useState([])
  // Re-roll / swap / exclude state. None of this touches BANDS or the price
  // maths — it only changes WHICH legs get offered. The calibration table is
  // observed data and must stay untouched by anything the user clicks.
  const [seed, setSeed] = useState(0)
  const [exPlayers, setExPlayers] = useState([])
  const [exTeams, setExTeams] = useState([])
  const [benched, setBenched] = useState([])   // legs swapped out, kept out
  // The candidate list is 268 rows and the only way to reach a specific hitter
  // was to scroll. Search and a team filter narrow the pool you pick FROM
  // without touching the suggestion, the price or the exclusions.
  const [poolQuery, setPoolQuery] = useState('')
  const [poolTeam, setPoolTeam] = useState('')

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

  // Anything the user has ruled out is gone from the candidate list entirely,
  // so it can't come back through a re-roll or a swap either.
  const eligible = useMemo(() => candidates.filter((c) => (
    !exPlayers.includes(c._key)
    && !exTeams.includes(c.team)
    && !benched.includes(c._key)
  )), [candidates, exPlayers, exTeams, benched])

  // Re-roll rotates the starting point in the ranked list rather than
  // randomising. Same rules, next slice down — so a re-roll is "show me the
  // next-best ticket I haven't seen", not a shuffle that might hand back
  // something worse than what it replaced for no stated reason. It wraps, so
  // you can always get back to the top ticket by rolling through.
  const suggested = useMemo(() => {
    if (!eligible.length) return []
    const off = seed % eligible.length
    const rotated = [...eligible.slice(off), ...eligible.slice(0, off)]
    const out = []
    const seen = new Set()
    for (const c of rotated) {
      if (out.length >= legs) break
      if (spread && c.game && seen.has(c.game)) continue
      if (c.game) seen.add(c.game)
      out.push(c)
    }
    // Re-sorted so a rotated ticket still reads best-first.
    return out.sort((a, b) => b.prob - a.prob || b.score - a.score)
  }, [eligible, legs, spread, seed])

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

  // Swap one leg, leave the rest alone. The replacement is the best eligible
  // hitter not already on the ticket, honouring the one-leg-per-game rule if
  // it's on. The leg that came off is benched so a second swap moves forward
  // instead of toggling between the same two names.
  const swapLeg = (legKey) => {
    const current = ticket.map((c) => c._key)
    const games = new Set(ticket.filter((c) => c._key !== legKey).map((c) => c.game))
    const next = eligible.find((c) => (
      !current.includes(c._key) && !(spread && c.game && games.has(c.game))
    ))
    if (!next) return
    setBenched((b) => [...b, legKey])
    setPool(current.map((k) => (k === legKey ? next._key : k)))
  }

  const excludePlayer = (k) => {
    setExPlayers((p) => (p.includes(k) ? p : [...p, k]))
    setPool((p) => p.filter((x) => x !== k))
  }
  const excludeTeam = (t) => {
    if (!t) return
    setExTeams((p) => (p.includes(t) ? p : [...p, t]))
    setPool((p) => p.filter((k) => candidates.find((c) => c._key === k)?.team !== t))
  }
  const resetBuild = () => { setPool([]); setSeed(0); setExPlayers([]); setExTeams([]); setBenched([]) }

  const teams = useMemo(
    () => [...new Set(candidates.map((c) => c.team).filter(Boolean))].sort(),
    [candidates],
  )

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

      {/* Steps that know where you are. The old version was four static labels
          that looked identical whether you'd done nothing or built a full
          ticket — so it read as decoration and people ignored it. Each step
          now lights up once it's actually satisfied, and the current one is
          called out, which turns it from a legend into a progress bar. */}
      {(() => {
        const steps = [
          { t: 'Pick a market', done: true, hint: m.label },
          { t: 'Set your leg count', done: true, hint: `${legs} legs` },
          { t: 'Click rows to pick your own', done: pool.length > 0, hint: pool.length ? `${pool.length} chosen` : 'or use the suggestion' },
          { t: 'Read the fair price', done: ticket.length > 0, hint: ticket.length ? fairOdds(combined) : '—' },
        ]
        const current = steps.findIndex((s) => !s.done)
        return (
          <div style={{
            display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: '8px 13px', margin: '8px 0 12px', fontSize: 11, color: C.text2,
          }}>
            {steps.map((s, i) => {
              const isNow = i === current
              const col = s.done ? C.orange : isNow ? C.text : C.text3
              return (
                <span key={s.t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 17, height: 17, borderRadius: '50%',
                    background: s.done ? C.orange : 'transparent',
                    border: `1px solid ${s.done ? C.orange : isNow ? C.text2 : C.border}`,
                    color: s.done ? '#1a0d02' : col, fontSize: 9.5,
                    fontWeight: 800, fontFamily: NUM_FONT,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>{s.done ? '✓' : i + 1}</span>
                  <span style={{ color: col, fontWeight: isNow ? 700 : 400 }}>{s.t}</span>
                  <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>{s.hint}</span>
                  {i < steps.length - 1 && <span style={{ color: C.border, marginLeft: 4 }}>›</span>}
                </span>
              )
            })}
          </div>
        )
      })()}

      <LivePools results={results} />

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

        <button
          onClick={() => { setSeed((s) => s + 1); setPool([]) }}
          title="Same rules, next slice down the ranked list. Wraps around, so rolling through gets you back to the top ticket."
          style={{
            padding: '4px 11px', fontSize: 10.5, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
            border: `1px solid ${seed ? C.orange : C.border}`,
            background: seed ? 'rgba(249,115,22,.12)' : 'transparent',
            color: seed ? C.orange : C.text3, fontFamily: NUM_FONT,
          }}
        >🎲 Re-roll{seed ? ` ·${seed}` : ''}</button>

        <select
          value=""
          onChange={(e) => { excludeTeam(e.target.value); e.target.value = '' }}
          style={{
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 6,
            padding: '4px 8px', fontSize: 10.5, color: C.text3, fontFamily: NUM_FONT,
            cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="">Exclude a team…</option>
          {teams.filter((t) => !exTeams.includes(t)).map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        {(seed || exPlayers.length || exTeams.length || benched.length || pool.length) ? (
          <button
            onClick={resetBuild}
            style={{
              padding: '4px 11px', fontSize: 10.5, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${C.border}`, background: 'transparent', color: C.text3, fontFamily: NUM_FONT,
            }}
          >Reset</button>
        ) : null}
      </div>

      {(exPlayers.length > 0 || exTeams.length > 0 || benched.length > 0) && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 9.5, color: C.text3, textTransform: 'uppercase', letterSpacing: '.06em' }}>Ruled out</span>
          {exTeams.map((t) => (
            <button key={`t${t}`} onClick={() => setExTeams((p) => p.filter((x) => x !== t))}
              title="Click to put this team back in"
              style={{
                padding: '2px 8px', fontSize: 9.5, fontWeight: 700, borderRadius: 5, cursor: 'pointer',
                border: `1px solid ${C.border2}`, background: 'transparent', color: C.text2, fontFamily: NUM_FONT,
              }}>{t} ✕</button>
          ))}
          {exPlayers.map((k) => {
            const c = candidates.find((x) => x._key === k)
            return (
              <button key={k} onClick={() => setExPlayers((p) => p.filter((x) => x !== k))}
                title="Click to put this hitter back in"
                style={{
                  padding: '2px 8px', fontSize: 9.5, fontWeight: 700, borderRadius: 5, cursor: 'pointer',
                  border: `1px solid ${C.border2}`, background: 'transparent', color: C.text2, fontFamily: NUM_FONT,
                }}>{c ? c.name : k} ✕</button>
            )
          })}
          {benched.length > 0 && (
            <button onClick={() => setBenched([])}
              title="Legs you swapped out are held back so a repeat swap moves forward. Click to make them available again."
              style={{
                padding: '2px 8px', fontSize: 9.5, borderRadius: 5, cursor: 'pointer',
                border: `1px dashed ${C.border2}`, background: 'transparent', color: C.text3, fontFamily: NUM_FONT,
              }}>{benched.length} swapped out ↺</button>
          )}
        </div>
      )}

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
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 11.5 }}
              >
                <span
                  onClick={() => onPlayerClick?.(c._raw)}
                  style={{ color: C.text, fontWeight: 700, minWidth: 140, cursor: 'pointer' }}
                >{c.name}</span>
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
                <button
                  onClick={() => swapLeg(c._key)}
                  title="Swap just this leg — everything else on the ticket stays"
                  style={{
                    padding: '1px 6px', fontSize: 10, borderRadius: 5, cursor: 'pointer',
                    border: `1px solid ${C.border}`, background: 'transparent', color: C.text3,
                  }}
                >⇄</button>
                <button
                  onClick={() => excludePlayer(c._key)}
                  title="Rule this hitter out of every ticket until you put him back"
                  style={{
                    padding: '1px 6px', fontSize: 10, borderRadius: 5, cursor: 'pointer',
                    border: `1px solid ${C.border}`, background: 'transparent', color: C.text3,
                  }}
                >✕</button>
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
          {' '}Re-rolling, swapping and excluding change <i>which</i> legs are offered; they never
          change the rate attached to a leg, because that rate is observed history rather than
          something this page is free to tune.
          {seed > 0 && ' You are looking at a rolled ticket, so these are not the top-ranked legs available.'}
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        fontSize: 11, color: C.text2, marginBottom: 8,
      }}>
        <span style={{
          background: `${C.orange}22`, border: `1px solid ${C.orange}66`, color: C.orange,
          borderRadius: 6, padding: '2px 8px', fontWeight: 800, fontSize: 10,
        }}>Click rows to build your ticket</span>
        <span style={{ color: C.text3 }}>
          Add as many as you like — click again to remove. A ✓ marks the ones you&apos;ve added.
        </span>
        {pool.length > 0 && (
          <b style={{ color: C.orange, marginLeft: 'auto' }}>{pool.length} selected</b>
        )}
      </div>

      {/* Narrow the list you're choosing from. Deliberately separate from the
          exclusion chips above: this hides rows from view, exclusions remove
          hitters from the re-roll and swap pool entirely. */}
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8,
      }}>
        <input
          value={poolQuery}
          onChange={(e) => setPoolQuery(e.target.value)}
          placeholder="Search this list — name, team or pitcher…"
          style={{
            flex: 1, minWidth: 180, background: C.bg3, border: `1px solid ${C.border}`,
            borderRadius: 7, padding: '6px 11px', fontSize: 11.5, color: C.text,
            outline: 'none', fontFamily: NUM_FONT,
          }}
        />
        <select
          value={poolTeam}
          onChange={(e) => setPoolTeam(e.target.value)}
          style={{
            background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7,
            padding: '6px 9px', fontSize: 11, color: C.text2, cursor: 'pointer',
            outline: 'none', fontFamily: NUM_FONT,
          }}
        >
          <option value="">All teams</option>
          {teams.map((t2) => <option key={t2} value={t2}>{t2}</option>)}
        </select>
        {(poolQuery || poolTeam) && (
          <button
            onClick={() => { setPoolQuery(''); setPoolTeam('') }}
            style={{
              padding: '5px 11px', fontSize: 10.5, fontWeight: 700, borderRadius: 7,
              cursor: 'pointer', border: `1px solid ${C.border}`,
              background: 'transparent', color: C.text3, fontFamily: NUM_FONT,
            }}
          >Clear</button>
        )}
      </div>

      <DenseTable
        rows={candidates
          .filter((c) => !poolTeam || c.team === poolTeam)
          .filter((c) => {
            const q = poolQuery.toLowerCase().trim()
            if (!q) return true
            return `${c.name} ${c.team} ${c.opp}`.toLowerCase().includes(q)
          })
          .map((c) => ({ ...c, picked: pool.includes(c._key) ? 1 : 0 }))}
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

      {/* PAIR BUILDER — moved here from the Pairs tab (2026-08-04). Pools and
          the pair builder are sibling tools: both construct a multi-leg play
          around hitters you choose. Two builders on two tabs meant neither
          was the obvious place to build anything; now tickets and pairs are
          built in one place, pools first, pairs under them. The Pairs tab is
          the bot's opinion; this tab is yours. */}
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
        <PairBuilder summary={pairHistorySummary} players={players} onPlayerClick={onPlayerClick} />
      </div>
    </div>
  )
}
