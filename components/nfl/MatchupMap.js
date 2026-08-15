'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'

// MatchupMap — his routes on their holes.
//
// Two facts nobody plots on the same picture:
//
//   BACKGROUND  what this defence gives up in that zone vs the league
//   CIRCLE      how much of the work happens there
//
// Separately, each is a table you've seen. A defence's zone splits are on
// every site. A player's target distribution is on every site. Neither one
// tells you anything on its own, because a hole he never throws into is
// trivia and heavy usage into a strength is a trap. The bet lives in the
// overlap, and the overlap is a SHAPE — which is why it's a picture and not
// two more tables stacked on top of each other.
//
// THE SPOT is that overlap made explicit: share x leak, both positive. The
// product is the whole idea.
//
// Two modes off the same grid:
//   mode="player"  circle = his share of attempts there
//   mode="def"     circle = share of the YARDS they allow that come from there
//
// Def mode sizes by damage rather than by volume on purpose. Deep balls are
// rare and enormous; sizing a defence's zones by attempts faced makes every
// defence look identical (everyone faces mostly short throws) and buries the
// zone that's actually beating them.

const SIDES = ['left', 'middle', 'right']
const DEPTHS = ['deep', 'mid', 'short', 'behind']
const DEPTH_AX = {
  deep: ['DEEP', '20+'],
  mid: ['INTERMEDIATE', '10–19'],
  short: ['SHORT', '0–9'],
  behind: ['BEHIND LOS', '< 0'],
}
const DEPTH_WORD = { deep: 'deep', mid: 'intermediate', short: 'short', behind: 'behind the line' }

const LANES = ['left|end', 'left|tackle', 'left|guard', 'middle|middle',
  'right|guard', 'right|tackle', 'right|end']
const LANE_AX = {
  'left|end': ['L END', 'outside'], 'left|tackle': ['L TCK', ''], 'left|guard': ['L GRD', ''],
  'middle|middle': ['MIDDLE', 'A gap'],
  'right|guard': ['R GRD', ''], 'right|tackle': ['R TCK', ''], 'right|end': ['R END', 'outside'],
}
const LANE_WORD = {
  'left|end': 'off left end', 'left|tackle': 'behind the left tackle',
  'left|guard': 'behind the left guard', 'middle|middle': 'up the middle',
  'right|guard': 'behind the right guard', 'right|tackle': 'behind the right tackle',
  'right|end': 'off right end',
}

// A leak is only a leak against the league. Coloured against its own grid,
// every defence on earth has a red zone and a green one and the map says
// nothing at all.
const BANDS = [
  [20, `${C.red}33`, `${C.red}6b`, C.red],
  [8, `${C.orange}2b`, `${C.orange}57`, C.orange],
  [-8, 'rgba(255,255,255,.035)', C.border, C.text3],
  [-20, `${C.lime}1c`, `${C.lime}42`, C.lime],
  [-999, `${C.green}26`, `${C.green}57`, C.green],
]
function band(leak) {
  if (!Number.isFinite(leak)) return ['rgba(255,255,255,.02)', C.border, C.text3]
  for (const [cut, bg, bd, fg] of BANDS) if (leak >= cut) return [bg, bd, fg]
  return ['rgba(255,255,255,.02)', C.border, C.text3]
}

// Defence samples this thin can't support a claim. Blank rather than bluff:
// a "+180% soft" built on four attempts is worse than no colour at all.
const MIN_DEF_ATT = 8
const SPOT_MIN_DEF_ATT = 12
const SPOT_MIN_SHARE = 4
const DEAD_SHARE = 2

// The leak reading lives in the top-left corner and THE SPOT in the top-right,
// which leaves the entire middle of the cell to the circle. They used to stack
// under the share number and the circle grew straight through them.
function Zone({ cell, hot, h, compact }) {
  const [bg, bd, fg] = band(cell.leak)
  const dead = cell.share < DEAD_SHARE
  return (
    <div
      title={cell.tip}
      style={{
        flex: 1, minWidth: 0, height: h, position: 'relative', overflow: 'hidden',
        borderRadius: 11, background: bg,
        border: `${hot ? 1.5 : 1}px solid ${hot ? C.cyan : bd}`,
        boxShadow: hot ? `0 0 0 3px ${C.cyan}1f` : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: dead ? 0.32 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: 6, left: 7, fontFamily: NUM_FONT, fontSize: 9,
        fontWeight: 900, color: fg,
      }}>
        {Number.isFinite(cell.leak)
          ? `${cell.leak > 0 ? '+' : ''}${Math.round(cell.leak)}%`
          : 'thin'}
      </span>
      {hot && (
        <span style={{
          position: 'absolute', top: 5, right: 6, fontFamily: NUM_FONT, fontSize: 7,
          fontWeight: 900, letterSpacing: '.16em', color: C.cyan,
          border: `1px solid ${C.cyan}80`, background: `${C.cyan}24`,
          padding: '2px 4px', borderRadius: 4,
        }}>THE SPOT</span>
      )}
      <div style={{
        position: 'absolute', width: cell.d, height: cell.d, borderRadius: '50%',
        background: hot ? `${C.cyan}40` : 'rgba(255,255,255,.10)',
        border: `1.5px solid ${hot ? `${C.cyan}8c` : 'rgba(255,255,255,.30)'}`,
      }} />
      <div style={{
        position: 'relative', fontFamily: NUM_FONT, fontWeight: 900,
        fontSize: compact ? 16 : 19, letterSpacing: '-.02em', color: C.text,
        textShadow: '0 1px 7px rgba(0,0,0,.9)',
      }}>
        {cell.share.toFixed(1)}<span style={{ fontSize: 10, color: C.text3, marginLeft: 1 }}>%</span>
      </div>
    </div>
  )
}

function Los({ inset }) {
  return (
    <div style={{
      height: 1, background: 'rgba(255,255,255,.22)', position: 'relative',
      margin: `9px 0 16px ${inset}px`,
    }}>
      <span style={{
        position: 'absolute', right: 0, top: 4, fontFamily: NUM_FONT,
        fontSize: 7.5, fontWeight: 700, color: C.text3, letterSpacing: '.12em',
      }}>LINE OF SCRIMMAGE</span>
    </div>
  )
}

export default function MatchupMap({
  field, player, team, mode = 'player', defaultView = 'pass', compact = false,
}) {
  const rushable = mode === 'def'
    ? Boolean(field?.player_rush || field?.def_rush)
    : Boolean(field?.player_rush?.[player?.player_id])
  const [view, setView] = useState(defaultView === 'rush' && rushable ? 'rush' : 'pass')

  const defTeam = mode === 'def' ? team : player?.opp
  const pass = view === 'pass'

  const model = useMemo(() => {
    if (!field || !defTeam) return null
    const dGrid = (pass ? field.def_pass : field.def_rush)?.[defTeam]
    const lg = (pass ? field.league_pass : field.league_rush) || {}
    const zones = pass ? SIDES.flatMap((s) => DEPTHS.map((d) => `${s}|${d}`)) : LANES
    const metric = pass ? 'ypa' : 'ypc'
    if (!dGrid) return null

    // The circle's denominator. In player mode it's his own attempts, so the
    // percentages read as "share of his work". In def mode it's the yards
    // they've allowed, so they read as "share of the damage".
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
      return {
        z, share, leak, att, dz, lz,
        tip: [
          pass ? label(z) : LANE_AX[z][0],
          mode === 'player'
            ? `him: ${mine?.att || 0} ${pass ? 'targets' : 'carries'} (${share.toFixed(1)}%)`
            : `${defTeam}: ${dz?.yds || 0} yds allowed (${share.toFixed(1)}% of their total)`,
          `${defTeam}: ${att} faced · ${dz?.[metric] ?? '—'} ${metric} (league ${lz?.[metric] ?? '—'})`,
        ].join('\n'),
      }
    })

    // Area proportional to share — a circle twice as wide reads as four times
    // as much, and it IS four times as much. The floor on the reference keeps
    // a low-volume player from having his 3% blown up into a full cell.
    const maxShare = Math.max(...cells.map((c) => c.share), 0)
    const ref = Math.max(maxShare, 12)
    const dMax = compact ? 52 : 64
    for (const c of cells) {
      const d = dMax * Math.sqrt(Math.max(0, c.share) / ref)
      // Narrower than the number it sits behind, a circle stops reading as a
      // circle and becomes a smudge around the decimal point. Nothing is
      // nothing — draw nothing.
      c.d = d < 20 ? 0 : d
    }

    let spot = null
    for (const c of cells) {
      if (!Number.isFinite(c.leak) || c.leak <= 0) continue
      if (c.share < SPOT_MIN_SHARE || c.att < SPOT_MIN_DEF_ATT) continue
      const v = c.share * c.leak
      if (!spot || v > spot.v) spot = { ...c, v }
    }

    const by = Object.fromEntries(cells.map((c) => [c.z, c]))
    return { cells, by, spot, metric }
  }, [field, defTeam, player, mode, pass, compact])

  function label(z) {
    if (!pass) return LANE_WORD[z] || z
    const [side, d] = z.split('|')
    return d === 'behind' ? `behind the line, ${side}` : `${DEPTH_WORD[d]} ${side}`
  }

  if (!model) {
    return (
      <div style={{ color: C.text3, fontSize: 11.5, padding: 14 }}>
        No {pass ? 'passing' : 'rushing'} map for {mode === 'player' ? player?.name : defTeam}.
      </div>
    )
  }

  const H = compact ? 66 : 82
  const AX = compact ? 68 : 92

  return (
    <div>
      {rushable && (
        <div style={{ display: 'flex', gap: 5, marginBottom: 9 }}>
          {[['pass', 'Passing'], ['rush', 'Rushing']].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={{
              fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 900, cursor: 'pointer',
              padding: '4px 10px', borderRadius: 7,
              border: `1px solid ${view === k ? C.green : C.border}`,
              background: view === k ? `${C.green}18` : 'transparent',
              color: view === k ? C.green : C.text3,
            }}>{l}</button>
          ))}
        </div>
      )}

      {/* Capped. Let the zones stretch to a 1400px window and a 64px circle
          sits marooned in a 400px cell — the sizing stops reading as sizing. */}
      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 15,
        padding: compact ? '13px 13px 11px' : '16px 18px 14px',
        maxWidth: compact ? 'none' : 820,
      }}>
        {pass ? (
          <>
            {DEPTHS.map((d) => (
              <div key={d}>
                <div style={{ display: 'flex', gap: 7, marginBottom: 7 }}>
                  <div style={{
                    width: AX, flex: `0 0 ${AX}px`, display: 'flex', flexDirection: 'column',
                    justifyContent: 'center', alignItems: 'flex-end', textAlign: 'right',
                  }}>
                    <b style={{
                      fontFamily: NUM_FONT, fontSize: compact ? 7.5 : 8.5, fontWeight: 800,
                      letterSpacing: '.13em', color: C.text2,
                    }}>{DEPTH_AX[d][0]}</b>
                    <span style={{
                      fontFamily: NUM_FONT, fontSize: 8, color: C.text3, marginTop: 3,
                    }}>{DEPTH_AX[d][1]}</span>
                  </div>
                  {SIDES.map((s) => (
                    <Zone key={s} cell={model.by[`${s}|${d}`]} h={H} compact={compact}
                          hot={model.spot?.z === `${s}|${d}`} />
                  ))}
                </div>
                {/* The rule goes ABOVE the behind-LOS row, because that's where
                    the line of scrimmage actually is. Drawn under the whole
                    grid it turns the one row it's meant to separate into just
                    another band of the field. */}
                {d === 'short' && <Los inset={AX + 7} />}
              </div>
            ))}
          </>
        ) : (
          <div style={{ display: 'flex', gap: 5 }}>
            {LANES.map((z) => (
              <div key={z} style={{ flex: 1, minWidth: 0 }}>
                <Zone cell={model.by[z]} h={H} compact={compact} hot={model.spot?.z === z} />
                <div style={{ textAlign: 'center', marginTop: 5 }}>
                  <b style={{
                    fontFamily: NUM_FONT, fontSize: 8, fontWeight: 800,
                    letterSpacing: '.1em', color: C.text2, display: 'block',
                  }}>{LANE_AX[z][0]}</b>
                  {LANE_AX[z][1] && (
                    <span style={{ fontFamily: NUM_FONT, fontSize: 7.5, color: C.text3 }}>
                      {LANE_AX[z][1]}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{
          display: 'flex', gap: 13, flexWrap: 'wrap', marginTop: 13,
          paddingLeft: pass ? AX + 7 : 0,
        }}>
          <Key dot>circle = {mode === 'player'
            ? `his ${pass ? 'target' : 'carry'} share`
            : 'share of yards they allow'}</Key>
          <Key swatch={`${C.red}4d`}>they leak</Key>
          <Key swatch={`${C.green}47`}>they lock it down</Key>
          <Key>corner % = their {model.metric} vs league</Key>
        </div>
      </div>

      <div style={{
        marginTop: 12, fontSize: compact ? 12.5 : 14, lineHeight: 1.6, color: C.text2,
      }}>
        {model.spot ? (
          mode === 'player' ? (
            <>
              <b style={{ color: C.text }}>{player?.name}</b> takes{' '}
              <b style={{ color: C.cyan }}>{model.spot.share.toFixed(1)}%</b> of his{' '}
              {pass ? 'targets' : 'carries'} {label(model.spot.z)} — the one place{' '}
              <b style={{ color: C.cyan }}>{defTeam}</b> gives up{' '}
              <b style={{ color: C.cyan }}>{Math.round(model.spot.leak)}%</b> more than the league.
            </>
          ) : (
            <>
              <b style={{ color: C.cyan }}>{Math.round(model.spot.share)}%</b> of the yards{' '}
              <b style={{ color: C.text }}>{defTeam}</b> allow come {label(model.spot.z)}, where
              they&apos;re <b style={{ color: C.cyan }}>{Math.round(model.spot.leak)}%</b> worse
              than the league. That&apos;s the door.
            </>
          )
        ) : (
          <span style={{ color: C.text3 }}>
            {mode === 'player'
              ? `No zone where ${player?.name || 'his'} usage and ${defTeam}'s weakness line up — every hole they leave is one he doesn't work.`
              : `${defTeam} don't leak anywhere on a big enough sample to call it.`}
          </span>
        )}
      </div>
    </div>
  )
}

function Key({ dot, swatch, children }) {
  return (
    <span style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontFamily: NUM_FONT, fontSize: 9, fontWeight: 700, color: C.text3,
    }}>
      {dot && <span style={{
        width: 9, height: 9, borderRadius: '50%', background: 'rgba(255,255,255,.16)',
        border: '1px solid rgba(255,255,255,.26)',
      }} />}
      {swatch && <span style={{
        width: 14, height: 9, borderRadius: 3, background: swatch,
      }} />}
      {children}
    </span>
  )
}
