'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import ChartFrame from './ChartFrame'

// MatchupMap — his routes on their holes, drawn on the field it happens on.
//
// ── WHY THIS WAS REBUILT (2026-09-13) ────────────────────────────────────
//
// The previous version was a 3x4 grid of rounded cells, each carrying THREE
// encodings at once: a leak % in the corner, a share % in the middle, and a
// circle whose diameter was that share again. It was correct and it was the
// densest chart on the site, and Donovan's verdict on it was "it's almost
// like i dont know what im looking at. it doesnt feel natural."
//
// He was right, and the first fix was wrong: chalk lines were drawn BEHIND
// the same grid of cells, which does not make a picture of a field, it makes
// a busy dashboard with wallpaper. The grid was the problem.
//
// TUDDY is for people who do not follow football. So:
//
//   THE FIELD IS THE CHART. No cells. Heat is painted onto the turf, and only
//   where this defence actually gets beaten — everywhere quiet is a defence
//   doing its job, which is a thing you can see at a glance and never had to
//   be told.
//
//   THE ANSWER COMES FIRST, IN WORDS. "SF get beaten by long balls over the
//   middle." Nobody has to decode a rank, a role code, or a percentage to get
//   the point of the picture; the numbers are underneath for whoever wants
//   them.
//
// What was deliberately given up: the old chart showed "how much of their
// damage comes from here" as circle area in every zone at once. That is one
// encoding too many for this audience, so it survives as a number in the
// verdict sentence and in the per-zone detail, not as a second mark competing
// with the heat.
//
// Player mode keeps the whole original idea — the bet lives where HIS work
// and THEIR hole overlap — but draws it the same way: their weakness is the
// turf, his usage is a ring on top of it, and THE SPOT is where a big ring
// sits on a hot patch.

const SIDES = ['left', 'middle', 'right']
const DEPTHS = ['deep', 'mid', 'short', 'behind']

// Plain English, everywhere, for both halves of a zone name. "TE2", "RECYD/G"
// and "intermediate" are all jargon to someone who has never watched a game.
const DEPTH_WORD = {
  deep: 'long balls', mid: 'medium passes', short: 'quick passes',
  behind: 'dumpoffs behind the line',
}
const DEPTH_AX = {
  deep: ['LONG', '20+ yds'], mid: ['MEDIUM', '10–19'],
  short: ['QUICK', '0–9'], behind: ['BEHIND', 'the line'],
}
const SIDE_WORD = {
  left: 'down the left', middle: 'over the middle', right: 'down the right',
}

const LANES = ['left|end', 'left|tackle', 'left|guard', 'middle|middle',
  'right|guard', 'right|tackle', 'right|end']
const LANE_AX = {
  'left|end': 'OUTSIDE L', 'left|tackle': 'L TACKLE', 'left|guard': 'L GUARD',
  'middle|middle': 'MIDDLE', 'right|guard': 'R GUARD', 'right|tackle': 'R TACKLE',
  'right|end': 'OUTSIDE R',
}
const LANE_WORD = {
  'left|end': 'runs round the left end', 'left|tackle': 'runs behind the left tackle',
  'left|guard': 'runs behind the left guard', 'middle|middle': 'runs straight up the middle',
  'right|guard': 'runs behind the right guard', 'right|tackle': 'runs behind the right tackle',
  'right|end': 'runs round the right end',
}

// A leak is only a leak against the league. Against its own grid every defence
// on earth has a worst zone and the map says nothing at all.
const MIN_DEF_ATT = 8
const SPOT_MIN_DEF_ATT = 12
const SPOT_MIN_SHARE = 4

// Heat saturates at +40% over league. Past that the picture stops
// distinguishing anything, and +40% is already an enormous hole.
const HEAT_FULL = 40
const heatOf = (leak) => (Number.isFinite(leak) && leak > 0 ? Math.min(1, leak / HEAT_FULL) : 0)
const coolOf = (leak) => (Number.isFinite(leak) && leak < 0 ? Math.min(1, -leak / HEAT_FULL) : 0)

// The four bands as percentages of the field box, end zone included. One
// table, so the turf, the blooms, the labels and the rings can never disagree
// about where a band is.
const EZ = 7
const BAND = {
  deep: [EZ, 30.25], mid: [30.25, 53.5], short: [53.5, 76.75], behind: [76.75, 100],
}
const MID = (d) => (BAND[d][0] + BAND[d][1]) / 2
const COL = { left: 16.7, middle: 50, right: 83.3 }

const TURF = `linear-gradient(180deg, ${C.turf1}, ${C.turf2})`
const CHALK = 'rgba(255,255,255,.17)'
const CHALK_SOFT = 'rgba(255,255,255,.09)'

const fmtPct = (n) => `${n > 0 ? '+' : ''}${Math.round(n)}%`

export default function MatchupMap({
  field, player, team, mode = 'player', defaultView = 'pass', compact = false,
}) {
  const rushable = mode === 'def'
    ? Boolean(field?.player_rush || field?.def_rush)
    : Boolean(field?.player_rush?.[player?.player_id])
  const [view, setView] = useState(defaultView === 'rush' && rushable ? 'rush' : 'pass')
  const [open, setOpen] = useState(false)

  const defTeam = mode === 'def' ? team : player?.opp
  const pass = view === 'pass'

  const model = useMemo(() => {
    if (!field || !defTeam) return null
    const dGrid = (pass ? field.def_pass : field.def_rush)?.[defTeam]
    const lg = (pass ? field.league_pass : field.league_rush) || {}
    const zones = pass ? SIDES.flatMap((s) => DEPTHS.map((d) => `${s}|${d}`)) : LANES
    const metric = pass ? 'ypa' : 'ypc'
    if (!dGrid) return null

    let src = null
    let sizeOf = null
    if (mode === 'player') {
      src = (pass ? field.player_pass : field.player_rush)?.[player?.player_id]
      if (!src) return null
      const tot = zones.reduce((a, z) => a + (src[z]?.att || 0), 0)
      if (!tot) return null
      sizeOf = (z) => (100 * (src[z]?.att || 0)) / tot
    } else {
      const tot = zones.reduce((a, z) => a + Math.max(0, dGrid[z]?.yds || 0), 0)
      if (!tot) return null
      sizeOf = (z) => (100 * Math.max(0, dGrid[z]?.yds || 0)) / tot
    }

    const cells = zones.map((z) => {
      const dz = dGrid[z]
      const lz = lg[z]
      const att = dz?.att || 0
      const share = sizeOf(z)
      const leak = (att >= MIN_DEF_ATT && lz?.[metric] > 0)
        ? ((dz[metric] - lz[metric]) / lz[metric]) * 100
        : null
      const mine = mode === 'player' ? src[z] : null
      const where = pass ? phrase(z) : LANE_WORD[z]
      return {
        z, share, leak, att, dz, lz, mine,
        heat: heatOf(leak), cool: coolOf(leak),
        tip: [
          where,
          Number.isFinite(leak)
            ? `${defTeam} give up ${fmtPct(leak)} vs a normal defence here`
            : `${defTeam}: too few plays here to call it`,
          mode === 'player'
            ? `${player?.name}: ${mine?.att || 0} of his ${pass ? 'targets' : 'carries'} (${share.toFixed(1)}%)`
            : `${dz?.yds || 0} yards allowed — ${share.toFixed(1)}% of everything they give up`,
        ].join('\n'),
      }
    })

    let spot = null
    for (const c of cells) {
      if (!Number.isFinite(c.leak) || c.leak <= 0) continue
      if (c.share < SPOT_MIN_SHARE || c.att < SPOT_MIN_DEF_ATT) continue
      const v = c.share * c.leak
      if (!spot || v > spot.v) spot = { ...c, v }
    }
    return { cells, by: Object.fromEntries(cells.map((c) => [c.z, c])), spot, metric }
  }, [field, defTeam, player, mode, pass])

  function phrase(z) {
    const [side, d] = z.split('|')
    return d === 'behind'
      ? `dumpoffs behind the line, ${side === 'middle' ? 'in the middle' : `to the ${side}`}`
      : `${DEPTH_WORD[d]} ${SIDE_WORD[side]}`
  }

  if (!model) {
    return (
      <div style={{ color: C.text3, fontSize: 11.5, padding: 14 }}>
        No {pass ? 'passing' : 'rushing'} map for {mode === 'player' ? player?.name : defTeam}.
      </div>
    )
  }

  const { spot } = model
  const hottest = model.cells.reduce((a, b) => (b.heat > (a?.heat ?? -1) ? b : a), null)
  const big = compact ? 19 : 25

  // ── THE VERDICT ────────────────────────────────────────────────────────
  // The sentence is the headline, not a caption. Two shapes: in def mode it
  // is how you beat them; in player mode it is whether his work lands on
  // their hole, which is the entire premise of the product.
  const verdict = spot
    ? (mode === 'def'
      ? { lead: cap(pass ? DEPTH_WORD[spot.z.split('|')[1]] : LANE_WORD[spot.z].replace('runs ', '')),
          tail: pass ? SIDE_WORD[spot.z.split('|')[0]] : '' }
      : { lead: cap(pass ? DEPTH_WORD[spot.z.split('|')[1]] : LANE_WORD[spot.z].replace('runs ', '')),
          tail: pass ? SIDE_WORD[spot.z.split('|')[0]] : '' })
    : null

  return (
    <div className="tuddy-map">
      <style>{`
        .tuddy-map .tm-zones{display:grid;grid-template-columns:repeat(3,1fr);gap:3px}
        @media(max-width:620px){
          .tuddy-map .tm-head{flex-direction:column;align-items:flex-start;gap:14px}
          .tuddy-map .tm-mini{align-self:center}
          .tuddy-map .tm-lanes{overflow-x:auto;padding-bottom:5px}
          .tuddy-map .tm-lanes>div{flex:0 0 78px!important}
        }
      `}</style>

      {rushable && (
        <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
          {[['pass', 'Passing'], ['rush', 'Running']].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={{
              fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 900, cursor: 'pointer',
              padding: '5px 11px', borderRadius: 7,
              border: `1px solid ${view === k ? C.green : C.border}`,
              background: view === k ? `${C.green}2a` : 'transparent',
              color: view === k ? C.green : C.text3,
            }}>{l}</button>
          ))}
        </div>
      )}

      {/* ── THE ANSWER, BEFORE THE PICTURE ─────────────────────────────── */}
      <div style={{
        border: `1px solid ${spot ? 'rgba(53,205,255,.30)' : C.border}`, borderRadius: 14,
        padding: compact ? '14px 15px' : '17px 19px', marginBottom: 10,
        background: `radial-gradient(circle at 92% 0%, rgba(53,205,255,.09), transparent 46%), ${C.bg2}`,
      }}>
        <div style={{
          fontFamily: NUM_FONT, fontSize: 9, fontWeight: 900, letterSpacing: '.18em',
          color: C.cyan, marginBottom: 8,
        }}>
          {mode === 'def' ? `HOW TO BEAT ${defTeam}` : `${player?.name || 'HIM'} vs ${defTeam}`}
        </div>
        {spot ? (
          <>
            <div style={{ fontSize: big, lineHeight: 1.2, color: C.text, letterSpacing: '-.02em', fontWeight: 700 }}>
              {verdict.lead}{verdict.tail ? <><br /><span style={{ color: C.cyan }}>{verdict.tail}</span></> : null}
            </div>
            <div style={{ marginTop: 11, fontSize: compact ? 12.5 : 14, color: C.text2, lineHeight: 1.55 }}>
              {mode === 'def' ? (
                <>They give up <b style={{ color: C.text }}>{fmtPct(spot.leak)} more</b> there than a
                normal defence, and <b style={{ color: C.text }}>{Math.round(spot.share)}%</b> of
                everything they allow comes from that one spot.</>
              ) : (
                <><b style={{ color: C.text }}>{player?.name}</b> takes{' '}
                <b style={{ color: C.text }}>{spot.share.toFixed(0)}%</b> of his{' '}
                {pass ? 'targets' : 'carries'} right there — the one place{' '}
                {defTeam} give up <b style={{ color: C.text }}>{fmtPct(spot.leak)} more</b> than a
                normal defence.</>
              )}
            </div>
          </>
        ) : (
          <div style={{ fontSize: compact ? 14 : 16, color: C.text2, lineHeight: 1.5 }}>
            {mode === 'def'
              ? `${defTeam} don't have one clear weak spot — nothing they give up is far enough above normal, on enough plays, to call it.`
              : `Nothing lines up. Every hole ${defTeam} leave is one ${player?.name || 'he'} doesn't work.`}
          </div>
        )}
      </div>

      <ChartFrame accent={C.green} live={Boolean(spot)}
        pad={compact ? '12px 12px 10px' : '15px 16px 13px'}
        style={{ maxWidth: compact ? 'none' : 620, borderRadius: 15 }}>
        {pass ? <PassField model={model} mode={mode} compact={compact} />
              : <RunLine model={model} compact={compact} />}

        {/* RENDERING CAUGHT THIS ONE TOO. In player mode the biggest red
            patch is often NOT where the marker is — their worst hole is
            frequently a place this particular player never goes. That looks
            like a bug unless somebody says out loud that the marker is the
            OVERLAP, which is the whole premise of the chart and was never
            written down anywhere a reader could see it. */}
        {mode === 'player' && spot && hottest && hottest.z !== spot.z && (
          <div style={{
            marginTop: 10, fontSize: compact ? 11.5 : 12.5, lineHeight: 1.55, color: C.text3,
          }}>
            The biggest red patch is <b style={{ color: C.text2 }}>{hottest.tip.split('\n')[0]}</b> —
            that is where {defTeam} are weakest, but {player?.name || 'he'} barely goes there.
            The marker is where his work and their weakness actually meet.
          </div>
        )}

        <div style={{
          display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 11,
        }}>
          <Key swatch="radial-gradient(circle, rgba(248,113,113,.75), rgba(251,191,36,.35))">
            they get beaten here
          </Key>
          {mode === 'player' && <Key ring>how much of his work goes here</Key>}
          <Key plain>no colour = they hold up</Key>
        </div>
      </ChartFrame>

      {/* ── THE NUMBERS, ONE TAP DOWN ──────────────────────────────────── */}
      {/* Nothing is deleted, it is folded. The picture answers the question;
          this answers "prove it", which is a different reader on a different
          day and should not be charged to the first one. */}
      <button type="button" onClick={() => setOpen((o) => !o)} style={{
        marginTop: 9, width: '100%', textAlign: 'left', cursor: 'pointer',
        border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 11px',
        background: 'rgba(255,255,255,.015)', color: C.text3,
        fontFamily: NUM_FONT, fontSize: 9, fontWeight: 800, letterSpacing: '.1em',
      }}>
        {open ? '▾' : '▸'} EVERY PART OF THE FIELD, WITH THE NUMBERS
      </button>
      {open && (
        <div style={{
          marginTop: 6, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden',
        }}>
          {model.cells.map((c, i) => (
            <div key={c.z} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '7px 11px',
              borderTop: i ? `1px solid ${C.border}` : 0,
              background: c.heat > 0.05 ? `rgba(248,113,113,${0.05 + c.heat * 0.13})` : 'transparent',
            }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: C.text2 }}>{cap(c.tip.split('\n')[0])}</span>
              <span style={{
                fontFamily: NUM_FONT, fontSize: 11, fontWeight: 900, minWidth: 46, textAlign: 'right',
                color: !Number.isFinite(c.leak) ? C.text3 : c.leak > 0 ? C.red : C.green,
              }}>{Number.isFinite(c.leak) ? fmtPct(c.leak) : 'thin'}</span>
              <span style={{ fontFamily: NUM_FONT, fontSize: 10, color: C.text3, minWidth: 62, textAlign: 'right' }}>
                {c.share.toFixed(1)}% {mode === 'player' ? 'of his' : 'of theirs'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s }

/* ── THE FIELD, FROM ABOVE ───────────────────────────────────────────────
   A real field: end zone, yard lines with their numbers on both sidelines,
   hash marks, the line of scrimmage. The offence attacks upward, so higher
   on screen is further downfield — which is what "long ball" means and the
   only thing a newcomer has to absorb.
   ──────────────────────────────────────────────────────────────────────── */
function PassField({ model, mode, compact }) {
  const { spot } = model
  return (
    <div style={{
      position: 'relative', borderRadius: 12, overflow: 'hidden', background: TURF,
      border: `1px solid ${CHALK_SOFT}`, aspectRatio: compact ? '4 / 4.2' : '5 / 5.1',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: `${EZ}%`,
        background: 'repeating-linear-gradient(135deg, rgba(0,245,173,.13) 0 5px, transparent 5px 11px)',
        borderBottom: `2px solid ${CHALK}`,
      }}>
        <span style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          fontFamily: NUM_FONT, fontSize: 7.5, fontWeight: 900, letterSpacing: '.22em',
          color: 'rgba(255,255,255,.34)', whiteSpace: 'nowrap',
        }}>END ZONE</span>
      </div>

      {[['deep', '20'], ['mid', '10']].map(([d, n]) => (
        <div key={d}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: `${BAND[d][1]}%`, height: 1, background: CHALK }} />
          {['left', 'right'].map((side) => (
            <span key={side} style={{
              position: 'absolute', top: `${BAND[d][1]}%`, [side]: 8, marginTop: -18,
              fontFamily: NUM_FONT, fontSize: compact ? 11 : 13, fontWeight: 900,
              color: 'rgba(255,255,255,.20)',
            }}>{n}</span>
          ))}
        </div>
      ))}

      {[38, 62].map((l) => (
        <div key={l} style={{
          position: 'absolute', top: `${EZ}%`, bottom: 0, left: `${l}%`, width: 1,
          background: 'repeating-linear-gradient(180deg, rgba(255,255,255,.10) 0 6px, transparent 6px 16px)',
        }} />
      ))}

      <div style={{ position: 'absolute', left: 0, right: 0, top: `${BAND.short[1]}%`, height: 2, background: 'rgba(255,255,255,.40)' }}>
        <span style={{
          position: 'absolute', right: 8, top: 5, fontFamily: NUM_FONT, fontSize: 7.5,
          fontWeight: 800, letterSpacing: '.14em', color: 'rgba(255,255,255,.40)',
        }}>THE LINE</span>
      </div>

      {/* THE HEAT. Painted only where they get beaten — a defence that holds
          up leaves the turf alone, which is the reading. */}
      {model.cells.map((c) => {
        if (c.heat < 0.12) return null
        const [side, d] = c.z.split('|')
        const size = 34 + c.heat * 40
        return (
          <div key={c.z} title={c.tip} style={{
            position: 'absolute', top: `${MID(d)}%`, left: `${COL[side]}%`,
            width: `${size}%`, aspectRatio: '1.35 / 1', transform: 'translate(-50%,-50%)',
            borderRadius: '50%', filter: 'blur(5px)',
            background: `radial-gradient(closest-side, rgba(248,113,113,${0.14 + c.heat * 0.5}), rgba(251,191,36,${0.10 + c.heat * 0.22}) 55%, transparent 78%)`,
          }} />
        )
      })}

      {/* HIS WORK, in player mode: a ring per zone, area proportional to his
          share. The bet is a big ring sitting on a hot patch — which is now
          something you see rather than something you compute. */}
      {/* RINGS SIZED BY AREA, AND ONLY WHERE HE ACTUALLY WORKS. At a 4%
          floor and a 42% ceiling this drew nine overlapping circles that
          swallowed the heat they are supposed to sit on — rendering caught
          it, reading did not. 7% floor, 26% ceiling, area-proportional so a
          ring twice as wide really is four times the work. */}
      {mode === 'player' && model.cells.map((c) => {
        if (c.share < 7) return null
        const [side, d] = c.z.split('|')
        const size = 7 + Math.sqrt(c.share / 100) * (compact ? 22 : 26)
        return (
          <div key={`r${c.z}`} title={c.tip} style={{
            position: 'absolute', top: `${MID(d)}%`, left: `${COL[side]}%`,
            width: `${size}%`, aspectRatio: '1 / 1', transform: 'translate(-50%,-50%)',
            borderRadius: '50%', border: '1.5px solid rgba(255,255,255,.50)',
            background: 'rgba(255,255,255,.045)',
          }} />
        )
      })}

      {spot && (() => {
        const [side, d] = spot.z.split('|')
        return (
          <div style={{
            position: 'absolute', top: `${MID(d)}%`, left: `${COL[side]}%`,
            transform: 'translate(-50%,-50%)', textAlign: 'center', width: 140,
          }}>
            <div style={{
              width: 12, height: 12, margin: '0 auto 7px', borderRadius: '50%',
              border: `2px solid ${C.red}`, boxShadow: '0 0 0 5px rgba(248,113,113,.20)',
            }} />
            <span style={{
              display: 'inline-block', fontFamily: NUM_FONT, fontSize: 8, fontWeight: 900,
              letterSpacing: '.14em', color: C.bg, background: C.red,
              padding: '3px 7px', borderRadius: 5, whiteSpace: 'nowrap',
            }}>{mode === 'def' ? 'THE WEAK SPOT' : 'THE SPOT'}</span>
          </div>
        )
      })()}

      {/* Band names live ON the turf, small, so nothing needs a side axis
          eating a quarter of a phone screen. */}
      {DEPTHS.map((d) => (
        <span key={d} style={{
          position: 'absolute', top: `${BAND[d][0]}%`, left: 8, marginTop: 5,
          fontFamily: NUM_FONT, fontSize: 7.5, fontWeight: 800, letterSpacing: '.13em',
          color: 'rgba(255,255,255,.30)', whiteSpace: 'nowrap',
        }}>{DEPTH_AX[d][0]} <span style={{ color: 'rgba(255,255,255,.17)' }}>{DEPTH_AX[d][1]}</span></span>
      ))}
    </div>
  )
}

/* ── THE RUN GAME: ONE STRIP AT THE LINE ─────────────────────────────────
   Runs happen at the line, not downfield, so they get the line rather than
   the field. Five blocks are the five linemen the seven gaps are named
   after: "left guard" stops being jargon the moment you can see it is the
   space beside a man.
   ──────────────────────────────────────────────────────────────────────── */
function RunLine({ model, compact }) {
  const { spot } = model
  return (
    <div style={{
      borderRadius: 12, overflow: 'hidden', background: TURF,
      border: `1px solid ${CHALK_SOFT}`, padding: '11px 9px 9px',
    }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 7 }}>
        {LANES.map((z, i) => (
          <div key={z} style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}>
            {i === 0 || i === 6 ? null : (
              <i style={{
                display: 'block', width: compact ? 15 : 19, height: compact ? 8 : 9,
                borderRadius: 3, background: 'rgba(255,255,255,.16)',
                border: `1px solid ${CHALK_SOFT}`,
              }} />
            )}
          </div>
        ))}
      </div>
      <div style={{ height: 2, background: 'rgba(255,255,255,.40)', marginBottom: 6, position: 'relative' }}>
        <span style={{
          position: 'absolute', right: 0, top: 4, fontFamily: NUM_FONT, fontSize: 7.5,
          fontWeight: 800, letterSpacing: '.14em', color: 'rgba(255,255,255,.40)',
        }}>THE LINE</span>
      </div>
      <div className="tm-lanes" style={{ display: 'flex', gap: 4, marginTop: 13 }}>
        {LANES.map((z) => {
          const c = model.by[z]
          const hot = spot?.z === z
          return (
            <div key={z} style={{ flex: 1, minWidth: 0 }}>
              <div title={c.tip} style={{
                height: compact ? 54 : 66, borderRadius: 8, position: 'relative',
                background: c.heat > 0.05
                  ? `linear-gradient(180deg, rgba(248,113,113,${0.20 + c.heat * 0.62}), rgba(251,191,36,${0.10 + c.heat * 0.30}))`
                  : 'rgba(255,255,255,.022)',
                border: `1px solid ${hot ? C.red : CHALK_SOFT}`,
                boxShadow: hot ? `0 0 0 3px rgba(248,113,113,.18)` : 'none',
              }}>
                {hot && (
                  <span style={{
                    position: 'absolute', bottom: 5, left: '50%', transform: 'translateX(-50%)',
                    fontFamily: NUM_FONT, fontSize: 7, fontWeight: 900, letterSpacing: '.1em',
                    color: C.bg, background: C.red, padding: '2px 5px', borderRadius: 4,
                    whiteSpace: 'nowrap',
                  }}>WEAK SPOT</span>
                )}
              </div>
              <div style={{
                textAlign: 'center', marginTop: 6, fontFamily: NUM_FONT, fontSize: 7.5,
                fontWeight: 800, letterSpacing: '.08em', color: C.text3, whiteSpace: 'nowrap',
              }}>{LANE_AX[z]}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Key({ swatch, ring, plain, children }) {
  return (
    <span style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontFamily: NUM_FONT, fontSize: 9, fontWeight: 700, color: C.text3,
    }}>
      {swatch && <span style={{ width: 14, height: 10, borderRadius: 4, background: swatch }} />}
      {ring && <span style={{
        width: 11, height: 11, borderRadius: '50%', background: 'rgba(255,255,255,.05)',
        border: '1.5px solid rgba(255,255,255,.42)',
      }} />}
      {plain && <span style={{ width: 14, height: 10, borderRadius: 4, background: 'rgba(255,255,255,.05)' }} />}
      {children}
    </span>
  )
}
