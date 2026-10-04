'use client'
import NflTable from './NflTable'
import { useState } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { softCells, plainRole, blockSeason, STARTER_ROLES, SOFT_THIN_GAMES, multipleWords, earlyNote } from '../../lib/nfl/dvpSignal'
import SourceSeason from './SourceSeason'
import { ordinal } from '../../lib/format'

// THE DEFENCE, BY HIS ROLE, IN WORDS (2026-10-01, 0e d).
//
// Donovan on the card's DEFENCE VS RB -- BY DEPTH ROLE grid (orange
// two-number cells: the value over its rank) and the DRIFT rank-by-week line
// chart under it: "I actually hate these." Both were analyst instruments that
// needed a key and sat in front of the answer. In their place:
//   1. one sentence per role that matters -- his role, and the starters in
//      his position group -- from the same dvp table (rank 1 = allows the
//      most) and, when the weekly series is the same season, where that rank
//      stood at the start of it:
//        "PIT allow the 16th-most touchdowns to lead running backs (2 games),
//         up from 27th in week 4."
//   2. THE DOORS: the ranked list of the cells this defence leaks a standout
//      amount on, for his group (softCells: the same z the site's "softest
//      spot" uses).
//   3. the full table, only behind a tap: one number per cell (the rank), no
//      colour wash.
// No new data; the drift clause appears only when dvp_trend is this season.

export const GROUP = {
  WR: ['WR1', 'WR2', 'WR3', 'Other WR'],
  TE: ['TE1', 'TE2', 'Other TE'],
  RB: ['RB1', 'RB2', 'Other RB'],
  QB: ['QB'],
}
// the yardage stat each group is judged on, beside touchdowns
const YARD_STAT = { WR: 'recyd_g', TE: 'recyd_g', RB: 'rshyd_g', QB: 'rshyd_g' }
const STAT_WORD = { td: 'touchdowns', rectd: 'receiving touchdowns', rshtd: 'rushing touchdowns', recyd_g: 'receiving yards a game', rshyd_g: 'rushing yards a game', rz_tgts: 'red-zone targets', rz_car: 'red-zone carries' }

const most = (r) => (r === 1 ? 'the most' : `the ${ordinal(r)}-most`)
const plural = (w) => (/s$/.test(w) ? w : `${w}s`)
const fmtVal = (n) => (Math.abs(n) >= 10 ? Math.round(n) : Math.round(n * 10) / 10)

function roleSentence(matchup, def, role, pos) {
  const row = matchup?.dvp?.season?.[def]?.[role]
  if (!row) return null
  const tdR = Number(row.td_rank)
  const ys = YARD_STAT[pos]
  const yR = Number(row?.[`${ys}_rank`])
  if (!Number.isFinite(tdR) && !Number.isFinite(yR)) return null
  const parts = []
  if (Number.isFinite(tdR)) parts.push(`${most(tdR)} touchdowns`)
  if (Number.isFinite(yR)) parts.push(`${most(yR)} ${STAT_WORD[ys]}`)
  const g = Number(row.g)
  // the drift clause: only from a weekly series of the SAME season
  let drift = ''
  const tr = matchup?.dvp_trend
  const series = tr?.td?.[def]?.[role]
  if (Number.isFinite(tdR) && Array.isArray(series) && Array.isArray(tr?.weeks) && blockSeason(matchup, 'dvp_trend') === Number(matchup?.season)) {
    const i = series.findIndex((v) => Number.isFinite(v))
    if (i >= 0 && series[i] !== tdR) drift = `, ${series[i] > tdR ? 'up' : 'down'} from ${ordinal(series[i])} in week ${tr.weeks[i]}`
  }
  return { role, text: `${def} allow ${parts.join(' and ')} to ${plural(plainRole(role))}${Number.isFinite(g) ? ` (${g < SOFT_THIN_GAMES ? 'early: ' : ''}${g} game${g === 1 ? '' : 's'})` : ''}${drift}.` }
}

export default function DvpRead({ matchup, def, position, role = null, slateSeason = null, playerName = 'he' }) {
  const [open, setOpen] = useState(false)
  const group = GROUP[position]
  const blob = matchup?.dvp?.season?.[def]
  if (!group || !blob) return null
  const roles = [role, ...group.filter((r) => STARTER_ROLES.includes(r) && r !== role)].filter((r) => r && blob[r])
  const lines = roles.map((r) => roleSentence(matchup, def, r, position)).filter(Boolean)
  const doors = softCells(matchup, def, 'season', group).slice(0, 5)
  const stats = (matchup?.dvp_stats || []).filter((st) => group.some((r) => Number.isFinite(blob[r]?.[`${st}_rank`])))
  const labels = matchup?.dvp_labels || {}
  const rows = group.filter((r) => blob[r])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '18px 0 8px' }}>
        <span style={{ fontSize: 10, fontWeight: 900, color: C.text3, letterSpacing: '.1em' }}>{def} DEFENCE VS {position}</span>
        <SourceSeason matchup={matchup} kind="stats" slateSeason={slateSeason} />
      </div>
      {lines.map((l) => (
        <p key={l.role} style={{ margin: '0 0 6px', fontSize: 13, lineHeight: 1.5, color: l.role === role ? C.text : C.text2 }}>
          {l.role === role && <b style={{ color: C.cyan, fontFamily: NUM_FONT, fontSize: 11, letterSpacing: '.06em' }}>HIS ROLE · </b>}{l.text}
        </p>
      ))}
      {!role && <p style={{ margin: '0 0 6px', fontSize: 12, color: C.text3 }}>His depth role publishes with the next bot run.</p>}

      <div style={{ fontSize: 10, fontWeight: 900, color: C.text3, letterSpacing: '.1em', margin: '12px 0 6px' }}>THE DOORS · WHERE {def} LEAK MOST TO {position}S</div>
      {doors.length ? (
        <ol style={{ margin: 0, paddingLeft: 22, fontSize: 13, lineHeight: 1.5, color: C.text2 }}>
          {doors.map((d) => (
            <li key={`${d.role}-${d.stat}`} style={{ marginBottom: 4 }}>
              <b style={{ color: d.role === role ? C.cyan : C.text }}>{plural(d.plain)}</b>{d.role === role ? ` (${playerName}'s role)` : ''}: {fmtVal(d.value)} {d.label}{['recyd_g', 'rshyd_g'].includes(d.stat) ? ' a game' : Number.isFinite(d.games) ? ` in ${d.games} games` : ''}
              {multipleWords(d) ? `, ${multipleWords(d)}` : ''}{Number.isFinite(d.rank) ? ` (${most(d.rank)})` : ''}{earlyNote(d)}.
            </li>
          ))}
        </ol>
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: C.text2 }}>No door: nothing {def} allow {position}s is far enough above the league average to call.</p>
      )}

      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{
        marginTop: 10, width: '100%', minHeight: 44, textAlign: 'left', cursor: 'pointer',
        border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 11px',
        background: 'rgba(255,255,255,.015)', color: C.text2,
        fontFamily: NUM_FONT, fontSize: 12, fontWeight: 800, letterSpacing: '.06em',
      }}>{open ? '▾' : '▸'} EVERY ROLE, EVERY STAT · RANK OF 32</button>
      {open && (
        <div style={{ marginTop: 6 }}>
          {/* THE SHARED SHEET (2026-10-01, BATCH-TABLE-SKIN-V2 4b): every role x
              every stat, the rank of 32 (1 allows the most), the same scale the
              Matchups by-position sheet uses; his role is edged in cyan. */}
          <NflTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={40} caption={`${def}: rank of 32 for what it allows each role`}
            rows={rows.map((r) => ({ _key: r, role: r, ...Object.fromEntries(stats.map((st) => [st, Number.isFinite(blob[r]?.[`${st}_rank`]) ? blob[r][`${st}_rank`] : null])), _vals: blob[r] || {} }))}
            rowEdge={(x) => (x.role === role ? C.cyan : null)}
            columns={[
              { key: 'role', label: 'Role', heat: false, sticky: true, w: 70, fmt: (v) => <b style={{ color: v === role ? C.cyan : C.text }}>{v}</b> },
              ...stats.map((st) => ({ key: st, label: labels[st] || st, w: 56, scale: 'seq', domain: [1, 32], invert: true, dp: 0,
                fmt: (rk, x) => <span title={Number.isFinite(rk) ? `${x._vals[st]} -- ${ordinal(rk)} of 32` : 'not a stat this role records'}>{Number.isFinite(rk) ? rk : '—'}</span> })),
            ]} />
          <div style={{ fontSize: 11, color: C.text3, marginTop: 5, lineHeight: 1.5 }}>Each cell is {def}&apos;s rank of 32 for what it allows that role: 1 allows the most. {matchup?.season} season.</div>
        </div>
      )}
    </div>
  )
}
