'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { hrScore } from '../lib/player'
import { gameFrom, simGame, simulate } from '../lib/gameSim'

// 🎲 GAME SIM PANEL (2026-09-03)
//
// The box score Donovan asked for, on top of lib/gameSim. Two things on one
// card, in this order on purpose:
//
//   1. THE SPREAD — win%, the run distribution, and per-hitter homer odds over
//      2,000 simulated games. This is what a simulator is FOR and what a single
//      box score cannot tell you.
//   2. ONE BOX SCORE — a representative game, drawn from the middle of that
//      distribution, laid out the way a real box is.
//
// The order matters. A box score is a single draw, and a single draw shown
// first reads as a prediction. Leading with the distribution and captioning the
// box as one game out of two thousand is the difference between a tool and a
// fortune teller.
//
// COST: 2,000 full games is ~250ms. It runs on demand — nothing simulates
// until the panel is opened — and memoises on the game's identity, so
// re-rendering the card does not re-run the sim.

const pct = (x) => `${(x * 100).toFixed(0)}%`
const num = { fontFamily: NUM_FONT, fontVariantNumeric: 'tabular-nums' }

const Cell = ({ children, w = 34, dim, bold, color }) => (
  <span style={{
    ...num, width: w, textAlign: 'right', flex: 'none',
    fontSize: 11, fontWeight: bold ? 800 : 600,
    color: color || (dim ? C.text3 : C.text2),
  }}>{children}</span>
)

const HEAD_B = ['AB', 'R', 'H', 'HR', 'RBI', 'BB', 'K', 'SB']
const HEAD_P = ['IP', 'H', 'ER', 'BB', 'K', 'P']

const Side = ({ s, onPlayerClick }) => (
  <div style={{
    border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 12px',
    background: C.glass, minWidth: 300, flex: '1 1 340px',
  }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: C.text, letterSpacing: '.06em' }}>{s.team}</span>
      <span style={{ ...num, marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: C.yellow }}>
        {s.runs} R · {s.hits} H · {s.errors} E
      </span>
    </div>

    <div style={{ display: 'flex', gap: 2, paddingBottom: 4, borderBottom: `1px solid ${C.border}` }}>
      <span style={{ flex: 1, fontSize: 9, letterSpacing: '.08em', color: C.text3 }}>BATTER</span>
      {HEAD_B.map((h) => <Cell key={h} w={h === 'RBI' ? 34 : 28} dim>{h}</Cell>)}
    </div>
    {s.batters.map((b) => (
      <div key={b.id ?? b.name} style={{
        display: 'flex', gap: 2, alignItems: 'center', padding: '3px 0',
        // The only row emphasis is a homer, because that is this site's subject.
        background: b.hr ? 'rgba(249,115,22,.10)' : 'transparent',
        borderRadius: 4,
      }}>
        <button
          onClick={onPlayerClick ? () => onPlayerClick(b.row) : undefined}
          style={{
            flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0,
            cursor: onPlayerClick ? 'pointer' : 'default',
            fontSize: 11, fontWeight: 700, color: b.hr ? C.orange : C.text,
          }}>{b.name}</button>
        <Cell w={28} dim>{b.ab}</Cell>
        <Cell w={28}>{b.r}</Cell>
        <Cell w={28} bold={!!b.h}>{b.h}</Cell>
        <Cell w={28} bold={!!b.hr} color={b.hr ? C.orange : undefined}>{b.hr}</Cell>
        <Cell w={34}>{b.rbi}</Cell>
        <Cell w={28} dim>{b.bb}</Cell>
        <Cell w={28} dim>{b.k}</Cell>
        <Cell w={28} color={b.sb ? C.cyan : undefined} dim={!b.sb}>{b.sb}</Cell>
      </div>
    ))}

    <div style={{ display: 'flex', gap: 2, marginTop: 10, paddingBottom: 4, borderBottom: `1px solid ${C.border}` }}>
      <span style={{ flex: 1, fontSize: 9, letterSpacing: '.08em', color: C.text3 }}>PITCHER</span>
      {HEAD_P.map((h) => <Cell key={h} w={30} dim>{h}</Cell>)}
    </div>
    {s.pitchers.map((p, i) => (
      <div key={i} style={{ display: 'flex', gap: 2, alignItems: 'center', padding: '3px 0' }}>
        <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: p.dec ? C.text : C.text2 }}>
          {p.dec && <span style={{ color: p.dec === 'W' ? C.green : C.red, fontWeight: 800 }}>({p.dec}) </span>}
          {p.name}
        </span>
        <Cell w={30} bold>{p.ip}</Cell>
        <Cell w={30}>{p.h}</Cell>
        <Cell w={30}>{p.er}</Cell>
        <Cell w={30} dim>{p.bb}</Cell>
        <Cell w={30}>{p.k}</Cell>
        <Cell w={30} dim>{p.pitches}</Cell>
      </div>
    ))}
  </div>
)

// The convergence read. The simulator's homer odds and `hr_score` are built
// from completely different mechanisms — nine innings of simulated plate
// appearances against a weighted blend of signals — so where they AGREE is
// worth more than either alone, and where they disagree is worth looking at.
// It ranks both within this game and shows the gap; it does not average them
// into a third number, because a blend of two models is not a third opinion.
const Convergence = ({ rows, hrProb }) => {
  const byName = new Map(hrProb.map((h) => [h.name, h.p]))
  const scored = rows
    .map((p) => ({ p, name: p.player_name || p.name, hs: hrScore(p), sim: byName.get(p.player_name || p.name) }))
    .filter((x) => x.sim != null && Number.isFinite(x.hs))
  if (scored.length < 4) return null
  const rank = (key, dir) => {
    const s = [...scored].sort((a, b) => (dir * (b[key] - a[key])))
    return new Map(s.map((x, i) => [x.name, i + 1]))
  }
  const rH = rank('hs', 1), rS = rank('sim', 1)
  const rowsOut = scored
    .map((x) => ({ ...x, gap: (rH.get(x.name) || 0) - (rS.get(x.name) || 0) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 6)
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 9, letterSpacing: '.08em', color: C.text3, marginBottom: 5 }}>
        HOMER ODDS · SIM vs HR SCORE — two independent reads
      </div>
      {rowsOut.map((x) => (
        <div key={x.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
          <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: C.text }}>{x.name}</span>
          <span style={{ ...num, fontSize: 11, fontWeight: 800, color: C.orange, width: 44, textAlign: 'right' }}>
            {(x.sim * 100).toFixed(1)}%
          </span>
          <span style={{ ...num, fontSize: 11, fontWeight: 700, color: C.text3, width: 40, textAlign: 'right' }}>
            {x.hs.toFixed(0)}
          </span>
          <span style={{
            ...num, fontSize: 10, fontWeight: 700, width: 74, textAlign: 'right',
            // A gap of 0-2 places is agreement and gets no colour. Only a real
            // divergence earns a mark, or the column becomes decoration.
            color: Math.abs(x.gap) <= 2 ? C.text3 : x.gap > 0 ? C.green : C.red,
          }}>
            {Math.abs(x.gap) <= 2 ? 'agree' : x.gap > 0 ? `sim likes +${x.gap}` : `score likes ${-x.gap}`}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function GameSimPanel({ game, onPlayerClick, runs = 2000 }) {
  const [open, setOpen] = useState(false)
  const [seed, setSeed] = useState(1)
  const rows = game?.players || []
  const gamePk = rows[0]?.game_pk

  // Nothing simulates until the panel is opened. `seed` is in the key so
  // "another game" re-runs one draw without re-running the 2,000.
  const sim = useMemo(() => {
    if (!open || !rows.length || !gamePk) return null
    const g = gameFrom(rows, gamePk)
    if (!g) return null
    const dist = simulate(g, runs)
    return { g, dist, box: seed === 1 ? dist.box : simGame(g, seed * 104729) }
  }, [open, gamePk, rows.length, runs, seed])

  if (!rows.length) return null

  return (
    <div style={{ marginBottom: 12 }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '9px 12px', cursor: 'pointer', color: C.text,
      }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.05em' }}>🎲 SIMULATE THIS GAME</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: C.text3 }}>
          {open ? 'hide' : `${runs.toLocaleString()} games`}
        </span>
      </button>

      {open && !sim && (
        <div style={{ padding: 12, fontSize: 11, color: C.text3 }}>
          This game can&apos;t be simulated — it needs both lineups on the board.
        </div>
      )}

      {open && sim && (
        <div style={{
          marginTop: 8, border: `1px solid ${C.border}`, borderRadius: 14,
          padding: 12, background: C.bg2,
        }}>
          {/* ── the spread, first ─────────────────────────────────────── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'baseline' }}>
            <div>
              <div style={{ fontSize: 9, letterSpacing: '.08em', color: C.text3 }}>WIN PROBABILITY</div>
              <div style={{ ...num, fontSize: 15, fontWeight: 800, color: C.text }}>
                {sim.g.away.team} {pct(sim.dist.winPct.away)}
                <span style={{ color: C.text3, fontWeight: 600 }}> · </span>
                {sim.g.home.team} {pct(sim.dist.winPct.home)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, letterSpacing: '.08em', color: C.text3 }}>TOTAL RUNS</div>
              <div style={{ ...num, fontSize: 15, fontWeight: 800, color: C.text }}>
                {sim.dist.total.mean.toFixed(1)}
                <span style={{ fontSize: 11, fontWeight: 600, color: C.text3 }}>
                  {' '}({sim.dist.total.p10}–{sim.dist.total.p90} four nights in five)
                </span>
              </div>
            </div>
          </div>

          <Convergence rows={rows} hrProb={sim.dist.hrProb} />

          {/* ── then one game out of two thousand ─────────────────────── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginTop: 14, marginBottom: 6,
          }}>
            <span style={{ fontSize: 9, letterSpacing: '.08em', color: C.text3 }}>
              ONE GAME OUT OF {sim.dist.n.toLocaleString()} — NOT A PREDICTION
            </span>
            <button onClick={() => setSeed((s) => s + 1)} style={{
              marginLeft: 'auto', background: 'none', border: `1px solid ${C.border}`,
              borderRadius: 8, padding: '3px 9px', fontSize: 10, fontWeight: 700,
              color: C.text2, cursor: 'pointer',
            }}>play another</button>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Side s={sim.box.away} onPlayerClick={onPlayerClick} />
            <Side s={sim.box.home} onPlayerClick={onPlayerClick} />
          </div>

          <div style={{ marginTop: 8, fontSize: 9.5, color: C.text3, lineHeight: 1.5 }}>
            Simulated plate appearance by plate appearance from published season
            rates, this park and tonight&apos;s air.
            {sim.box.inning > 9 && ` Went ${sim.box.inning} innings.`}
            {' '}Relief arms are modelled from the team bullpen line — the board
            publishes no individual relievers, so they are numbered, not named.
            {sim.box.partialLineups && ` ${sim.box.partialLineups.join(' and ')} posted fewer than nine hitters.`}
            {!sim.g.homeKnown && ' Home side could not be confirmed from the venue.'}
          </div>
        </div>
      )}
    </div>
  )
}
