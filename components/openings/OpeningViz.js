'use client'
import { useState } from 'react'
import { flatChip, FLAT_CHIP_CLASS } from '../../lib/chips'
import TeamMark from '../TeamMark'
import PlayerFace from '../PlayerFace'
import { surname } from '../../lib/player'

// 🏀 THE FACE WALL (10-25, Donovan: "the faces one is cool ... faces and table", then "do something with the background of the
// player pictures ... the rings, I gotta understand what all that means ... this is very new, I like this"). One game's two
// clubs, face to face across a half-court line, every mark one game on file (newest first):
//   face on a disc          his club scored the first basket -- and this is the man who did it
//   face + accent ring      ... and his club won the tip too
//   empty accent ring       won the tip, lost the first basket
//   faint dot               lost both
// The legend draws those four marks, not a sentence. Under each wall: the three faces that turn up most, with counts.
// Shared: a product hands the matchup rows, the two clubs' logs ([first 1|0, tip 1|0, scorer id] newest first), a
// name lookup, its theme and accent, and optionally its `floor` ({ a, b, line }: BUCKETS' hardwood and line paint).
// The tables and the counts are records, never a chance.

// 4 x 33px + gaps fits half of a 360 phone (Donovan 10-25: "the image needs to be bigger ... so you can really see them");
// the wall previews each club's last 20 games, "All games" opens the rest
const D = 33, GAP = 3, COLS = 4, PREVIEW = 20

function Mark({ kind, id, name, sport, C, accent, D = 33 }) {
  const box = { width: D, height: D, borderRadius: '50%', display: 'grid', placeItems: 'center', boxSizing: 'border-box', flex: '0 0 auto' }
  if (kind === 'none') return <span style={box}><span style={{ width: 5, height: 5, borderRadius: 3, background: C.text3, opacity: 0.45 }} /></span>
  if (kind === 'wasted') return <span style={{ ...box, border: `1.5px solid ${accent}`, opacity: 0.85 }} />
  return (
    <span title={name || undefined} style={{ ...box, overflow: 'hidden', background: `radial-gradient(circle at 50% 35%, ${C.bg3}, ${C.bg})`,
      border: kind === 'both' ? `1.5px solid ${accent}` : `1px solid ${C.border}`, boxShadow: kind === 'both' ? `0 0 8px ${accent}77` : 'none' }}>
      <PlayerFace sport={sport} id={id} name={name || ''} size={D - 2} />
    </span>
  )
}
const kindOf = (x) => (x[0] === 1 ? (x[1] === 1 ? 'both' : 'first') : (x[1] === 1 ? 'wasted' : 'none'))

export function FaceWall({ game, logs, rows, sport, C, NUM_FONT, accent, nameOf, floor = null }) {
  const first = rows.find((r) => r._id === 'firstPct')
  const [all, setAll] = useState(false)
  const line = floor?.line || C.text3
  let most = 0
  const shade = { textShadow: '0 1px 3px rgba(0,0,0,.8)' }
  const tops = {}
  const wall = (log, s) => {
    const g = (log || []).filter((x) => x[0] != null)
    const n = g.length, k = g.filter((x) => x[0] === 1).length
    const tips = g.filter((x) => x[1] === 1).length
    const wasted = g.filter((x) => x[1] === 1 && x[0] === 0).length
    const by = new Map(); for (const x of g) if (x[2]) by.set(x[2], (by.get(x[2]) || 0) + 1)
    const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    tops[s] = top
    const away = s === 'away'
    const lit = first?.better === s
    most = Math.max(most, n)
    const shown = all ? g : g.slice(0, PREVIEW)
    return (
      <div style={{ display: 'grid', gap: 8, justifyItems: away ? 'start' : 'end', alignContent: 'start', minWidth: 0 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexDirection: away ? 'row' : 'row-reverse', font: `900 12px/1 ${NUM_FONT}`, letterSpacing: '.06em', color: C.text, ...shade }}>
          <TeamMark sport={sport} abbr={away ? game.away : game.home} variant="logo" px={22} />{away ? game.away : `@ ${game.home}`}
        </span>
        <div style={{ font: `900 32px/1 ${NUM_FONT}`, color: lit ? accent : C.text, ...shade }}>{n ? `${Math.round((100 * k) / n)}%` : '—'}</div>
        <div style={{ font: `600 10px/1.45 ${NUM_FONT}`, color: C.text2, textAlign: away ? 'left' : 'right', ...shade }}>
          {`${k}/${n} scored first`}<br />{`tip ${n ? Math.round((100 * tips) / n) : 0}% · ${wasted} wasted`}
        </div>
        <div style={{ font: `900 10px/1 ${NUM_FONT}`, letterSpacing: '.08em', color: C.text3, ...shade }}>{all ? `ALL ${n} GAMES` : `LAST ${shown.length} GAMES`}</div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, ${D}px)`, gap: GAP, direction: away ? 'ltr' : 'rtl' }}>
          {shown.map((x, i) => <Mark key={i} D={D} kind={kindOf(x)} id={x[2]} name={x[2] ? nameOf?.get(x[2]) : ''} sport={sport} C={C} accent={accent} />)}
        </div>
        <div style={{ display: 'grid', gap: 5, justifyItems: away ? 'start' : 'end', marginTop: 2 }}>
          {top.map(([id, c]) => (
            <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexDirection: away ? 'row' : 'row-reverse', font: `600 12px/1 ${NUM_FONT}`, color: C.text2, ...shade }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', overflow: 'hidden', display: 'grid', placeItems: 'center', background: `radial-gradient(circle at 50% 35%, ${C.bg3}, ${C.bg})`, border: `1px solid ${C.border}` }}>
                <PlayerFace sport={sport} id={id} name={nameOf?.get(id) || ''} size={24} />
              </span>
              {surname(nameOf?.get(id) || '')}<b style={{ color: C.text }}>{c}</b>
            </span>
          ))}
        </div>
      </div>
    )
  }
  const walls = [wall(logs.away, 'away'), wall(logs.home, 'home')]
  const sample = tops.home?.[0]?.[0] || tops.away?.[0]?.[0] || null
  const legend = [['first', 'Scored first'], ['both', 'Scored first + won tip'], ['wasted', 'Won tip, lost it'], ['none', 'Lost both']]
  return (
    <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}`,
      background: floor ? `repeating-linear-gradient(90deg, ${floor.a} 0 18px, ${floor.b} 18px 36px)` : C.bg2 }}>
      {/* the floor: a dark wash so the faces read, then the half-court line and the centre circle */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.45), rgba(0,0,0,.62))' }} />
      <svg aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <line x1="50%" y1="0" x2="50%" y2="100%" stroke={line} strokeOpacity={0.35} strokeWidth={2} />
        <circle cx="50%" cy="58" r="44" fill="none" stroke={line} strokeOpacity={0.35} strokeWidth={2} />
      </svg>
      <div style={{ position: 'relative', padding: '12px 12px 12px', display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{walls}</div>
        {most > PREVIEW ? (
          <button type="button" className={FLAT_CHIP_CLASS} aria-pressed={all} onClick={() => setAll(!all)} style={{ ...flatChip(all, accent, C, NUM_FONT), justifySelf: 'center' }}>{all ? `Last ${PREVIEW}` : 'All games'}</button>
        ) : null}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
          {legend.map(([k, l]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.text2, ...shade }}>
              <Mark D={26} kind={k} id={sample} name={sample ? nameOf?.get(sample) : ''} sport={sport} C={C} accent={accent} />{l}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.text3, ...shade }}>Each mark is one game, newest first. The % counts every game on file. A record, not a chance.</div>
      </div>
    </div>
  )
}
