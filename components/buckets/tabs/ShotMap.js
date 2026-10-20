'use client'
import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { NBA_TEAMS } from '../../../lib/nba/teams'
import { useBucketsShots, useBucketsPlayers, useBucketsBoard } from '../../../lib/nba/useBuckets'
import { unpackShots } from '../../../lib/nba/shots'
import ShotChart from '../ShotChart'
import { DelayedBanner, Loading, EmptyState, Pills, NavBtn, readHashParam, writeHashParam } from '../ui'

// 🎯 SHOT MAP -- where a club or a player shoots from: every field-goal
// attempt on file (buckets_shots, the play-by-play backfill), by zone. The
// pick rides the address (team= / player=), so a link opens the same map.
// a hash that names no real club / player is not a pick: the select would show one thing and the map another
const teamOf = (v) => { const t = String(v || '').toUpperCase(); return NBA_TEAMS.some((x) => x[0] === t) ? t : null }
const playerOf = (v) => (/^\d{2,10}$/.test(String(v || '')) ? String(v) : '')
export default function ShotMap({ onOpenPlayer, onOpenTeam }) {
  const [mode, setMode] = useState(() => (playerOf(readHashParam('player')) ? 'player' : 'team'))
  const [team, setTeam] = useState(() => teamOf(readHashParam('team')) || 'BOS')
  const [who, setWho] = useState(() => playerOf(readHashParam('player')))
  // a back/forward or a pasted link changes the address under the page: follow it
  useEffect(() => {
    const sync = () => {
      const p = playerOf(readHashParam('player')); const t = teamOf(readHashParam('team'))
      if (p) { setWho(p); setMode('player') } else if (t) { setTeam(t); setMode('team') }
    }
    window.addEventListener('hashchange', sync); window.addEventListener('popstate', sync)
    return () => { window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync) }
  }, [])
  const players = useBucketsPlayers()
  // WHOSE DEFENSE LIGHTS THE COURT (2026-10-20): tonight's opponent when the pick plays tonight (the night's board knows),
  // or any club picked here; the pick rides the address as vs=
  const { data: board } = useBucketsBoard(null, 'pts')
  const tonightOpp = useMemo(() => {
    const r = (board?.rows || []).find((x) => (mode === 'team' ? x.team === team : String(x.playerId) === String(who)))
    return r?.opp || null
  }, [board, mode, team, who])
  const [vsPick, setVsPick] = useState(() => teamOf(readHashParam('vs')))
  const vs = vsPick || tonightOpp
  const sel = mode === 'team' ? { team } : who ? { player: who } : null
  const { data, error, loading } = useBucketsShots(sel)
  const shots = useMemo(() => unpackShots(data?.shots, data?.games), [data])
  const plist = useMemo(() => [...(players.data?.players || [])].sort((a, b) => b.pts - a.pts), [players.data])
  const pname = plist.find((p) => p.id === who)?.name
  const set = (k, v) => writeHashParam(k, v)
  const selStyle = { minHeight: 44, flex: '1 1 auto', maxWidth: 360, borderRadius: 10, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text, fontSize: 16, padding: '0 10px' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow="BUCKETS · SHOT MAP" title={mode === 'team' ? `${team} shots` : pname ? `${pname}’s shots` : 'Shot map'} theme={C} numFont={NUM_FONT} accent={C.purple}
        note="Where shots come from, made and missed, zone by zone."
        stats={data ? [{ value: shots.length, label: 'ATTEMPTS', tone: C.text2 }] : null} />
      <Pills ariaLabel="Whose shots" value={mode} onChange={(k) => { setMode(k); if (k === 'team') { set('player', null); set('team', team) } else { set('team', null); if (who) set('player', who) } }} options={[{ key: 'team', text: 'A club' }, { key: 'player', text: 'A player' }]} />
      {mode === 'team' ? (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, fontWeight: 800, color: C.text3, fontFamily: NUM_FONT }}>CLUB
          <select value={team} onChange={(e) => { setTeam(e.target.value); set('team', e.target.value) }} style={selStyle}>
            {[...NBA_TEAMS].sort((a, b) => a[2].localeCompare(b[2])).map((t) => <option key={t[0]} value={t[0]}>{t[2]} {t[3]}</option>)}
          </select>
          <NavBtn onClick={() => onOpenTeam?.(team)}>Open the club →</NavBtn>
        </label>
      ) : (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, fontWeight: 800, color: C.text3, fontFamily: NUM_FONT }}>PLAYER
          <select value={who} onChange={(e) => { setWho(e.target.value); set('player', e.target.value) }} style={selStyle}>
            <option value="">Pick a player</option>
            {who && !plist.some((p) => p.id === who) ? <option value={who}>{players.data ? `Player ${who}` : 'Loading…'}</option> : null}
            {plist.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.team}</option>)}
          </select>
          {who ? <NavBtn onClick={() => onOpenPlayer?.(who)}>Open his file →</NavBtn> : null}
        </label>
      )}
      <DelayedBanner error={error} what="shot data" />
      {loading && !data ? <Loading what="the shots" /> : null}
      {mode === 'player' && !who && <EmptyState title="PICK A PLAYER" note="Choose a player above for every shot he took on file." />}
      {data && sel && !shots.length && <EmptyState title="NO SHOTS ON FILE" note="No shots recorded for this pick yet." />}
      {(mode === 'team' || who) && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, fontWeight: 800, color: C.text3, fontFamily: NUM_FONT }}>AGAINST
          <select value={vs || ''} onChange={(e) => { const v = teamOf(e.target.value); setVsPick(v); set('vs', v) }} style={{ ...selStyle, maxWidth: 240 }}>
            <option value="">No defense</option>
            {[...NBA_TEAMS].filter((t) => mode !== 'team' || t[0] !== team).sort((a, b) => a[2].localeCompare(b[2])).map((t) => <option key={t[0]} value={t[0]}>{t[2]} {t[3]}{t[0] === tonightOpp ? ' · tonight' : ''}</option>)}
          </select>
        </label>
      )}
      {shots.length > 0 && <ShotChart urlKey="sm" shots={shots} filters={['result', 'type']} threeD title={`Shot map, ${mode === 'team' ? team : pname || ''}`}
        defense={vs} defenseNote={vs && vs === tonightOpp ? 'tonight' : null} ownDefense={mode === 'team' ? team : null} who={mode === 'team' ? 'their' : 'his'}
        source="Every field-goal attempt on file, from ESPN play-by-play (this season and last)." />}
    </div>
  )
}
