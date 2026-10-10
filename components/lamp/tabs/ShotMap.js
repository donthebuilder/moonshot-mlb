'use client'
import { useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import ShotPanel from '../ShotPanel'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { NHL_TEAMS } from '../../../lib/nhl/teams'
import { useLampPlayers } from '../../../lib/nhl/useLamp'
import { SourceLine, readHashParam } from '../ui'
import { arenaOf } from '../../../lib/nhl/arenas'

// 🏒 SHOT MAP (lamp research step 3, 2026-09-26) — More → League. Pick a
// club or search a skater; the map is the shot archive's aggregate
// (/api/lamp/shots), season or last 10, dots or heat. Measured, not
// modelled: nothing here is a LAMP score.
const TEAMS = NHL_TEAMS.map(([abbrev, , place, nick]) => ({ abbrev, name: `${place} ${nick}` })).sort((a, b) => a.name.localeCompare(b.name))

export default function ShotMap({ onOpenPlayer }) {
  // #player=<id> opens his own map (the Rankings page's "Where he shoots from")
  const [sel, setSel] = useState(() => { const id = String(readHashParam('player') || ''); return /^\d{7}$/.test(id) ? { player: id } : { team: TEAMS[0].abbrev } })
  const [q, setQ] = useState('')
  const players = useLampPlayers()
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 2) return []
    return (players.data?.players || []).filter((p) => p.pos !== 'G' && p.name.toLowerCase().includes(t)).slice(0, 8)
  }, [q, players.data])
  const picked = sel.player ? (players.data?.players || []).find((p) => p.id === sel.player) : null
  const field = { height: 32, padding: '0 10px', borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text, font: `700 12px/1 ${NUM_FONT}` }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader eyebrow="LAMP · SHOT MAP" title="Shot map"
        note="Where shots come from. Red = goal."
        theme={C} numFont={NUM_FONT} accent={C.ice} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.1em' }}>
          CLUB
          <select value={sel.team || ''} onChange={(e) => { setSel({ team: e.target.value }); setQ('') }} style={field}>
            {!sel.team && <option value="">—</option>}
            {TEAMS.map((t) => <option key={t.abbrev} value={t.abbrev}>{t.name}</option>)}
          </select>
        </label>
        <label style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4, color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.1em' }}>
          OR A SKATER
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name" style={{ ...field, width: 220 }} />
          {hits.length > 0 && (
            <div role="listbox" style={{ position: 'absolute', top: 54, left: 0, zIndex: 20, width: 240, background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 8, overflow: 'hidden' }}>
              {hits.map((p) => (
                <button key={p.id} type="button" role="option" onClick={() => { setSel({ player: p.id }); setQ('') }}
                  style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '8px 10px', background: 'transparent', border: 'none', borderTop: `1px solid ${C.border}`, color: C.text, cursor: 'pointer', font: 'inherit', fontSize: 12, textAlign: 'left' }}>
                  <span>{p.name}</span><span style={{ color: C.text3, font: `800 10px/1 ${NUM_FONT}` }}>{p.team} · {p.pos}</span>
                </button>
              ))}
            </div>
          )}
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 18, color: C.cream }}>{picked ? picked.name : TEAMS.find((t) => t.abbrev === sel.team)?.name}</h3>
        {picked && <button type="button" onClick={() => onOpenPlayer?.(picked.id)} style={{ background: 'none', border: 'none', color: C.ice, cursor: 'pointer', font: `800 10px/1 ${NUM_FONT}` }}>open his file →</button>}
      </div>
      <ShotPanel sel={sel} who={sel.player ? 'He' : 'They'} height={540} seasonSwitch venue={arenaOf(sel.team || picked?.team)?.name} />
      <SourceLine>gamecenter/{'{id}'}/play-by-play: shot-on-goal, goal, missed-shot and blocked-shot events (xCoord, yCoord, shotType, situationCode), regular season, shootouts left out. Stored in lamp_shots after each graded game; 2025-26 backfilled.</SourceLine>
    </div>
  )
}
