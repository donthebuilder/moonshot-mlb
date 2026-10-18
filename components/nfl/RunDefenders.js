'use client'
import { useMemo } from 'react'
import PlayerFace from '../PlayerFace'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { useDefenders } from '../../lib/nfl/useDefense'
import { playerHref } from '../../lib/routes'

// THE RUN VIEW'S DEFENCE (2026-10-18, PHONE-PARITY / "the run view has no defence"). The honest version: no data says which gap a defender lines up at or
// tackles in, so NOBODY is placed on the field. What the files do carry is each defender's season line (lib/nfl/defStats.js): the club's best run
// stoppers, by tackles for loss then tackles, DL / LB / S, named under the field as the team's totals. The gaps themselves already show the defence
// (the "leak" glow and the tap sentence). Nothing renders until the roster join has a man with tackles.
const RUN_GROUPS = new Set(['DL', 'LB', 'S'])
// "Jalon Walker Sr." is Walker: the generational suffix is not a name
export const lastName = (n) => String(n || '').replace(/[,\s]+(jr|sr|ii|iii|iv|v)\.?$/i, '').trim().split(/\s+/).slice(-1)[0]

export function runStoppers(rows, n = 4) {
  return (rows || [])
    .filter((r) => RUN_GROUPS.has(r.group) && Number(r.tkl) > 0)
    .sort((a, b) => (Number(b.tfl) || 0) - (Number(a.tfl) || 0) || (Number(b.tkl) || 0) - (Number(a.tkl) || 0) || String(a.name).localeCompare(String(b.name)))
    .slice(0, n)
}

export default function RunDefenders({ def, enabled = true }) {
  const d = useDefenders(enabled ? def : null)
  const top = useMemo(() => runStoppers(d.rows), [d.rows])
  if (!enabled || !top.length) return null
  return (
    <div role="group" aria-label={`${def} run defenders`} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, margin: '8px 0 2px' }}>
      <span style={{ flexBasis: '100%', font: `800 11px/1.2 ${NUM_FONT}`, letterSpacing: '.08em', color: C.text2 }}>{def} RUN DEFENDERS · SEASON TOTALS</span>
      {top.map((r) => {
        const body = (
          <>
            <PlayerFace sport="nfl" espnId={r.espn_id} team={r.team} name={r.name} size={32} />
            <span style={{ textAlign: 'left' }}>
              <span style={{ display: 'block', font: `800 12px/1.2 ${NUM_FONT}` }}>{lastName(r.name)}</span>
              <span style={{ display: 'block', font: `700 11px/1.2 ${NUM_FONT}`, color: C.text2 }}>{r.group} · {Number(r.tfl) || 0} TFL · {r.tkl} TKL</span>
            </span>
          </>
        )
        const style = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 12px 0 6px', borderRadius: 22, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text, textDecoration: 'none' }
        return r.id
          ? <a key={r.id || r.name} href={playerHref('nfl', r.id)} style={style}>{body}</a>
          : <span key={r.name} style={style}>{body}</span>
      })}
      <span style={{ flexBasis: '100%', fontSize: 11, color: C.text3 }}>No one is placed on a gap: the data does not say where a defender lines up.</span>
    </div>
  )
}
