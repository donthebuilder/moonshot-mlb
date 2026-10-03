'use client'
import { useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { NBA_TEAMS } from '../../../lib/nba/teams'
import { useBucketsShots, useBucketsPlayers } from '../../../lib/nba/useBuckets'
import { unpackShots } from '../../../lib/nba/shots'
import ShotChart from '../ShotChart'
import { DelayedBanner, Loading, SourceLine, EmptyState, Pills, NavBtn, readHashParam, writeHashParam } from '../ui'

// 🎯 SHOT MAP -- where a club or a player shoots from: every field-goal
// attempt on file (buckets_shots, the play-by-play backfill), by zone. The
// pick rides the address (team= / player=), so a link opens the same map.
export default function ShotMap({ onOpenPlayer, onOpenTeam }) {
  const [mode, setMode] = useState(() => (readHashParam('player') ? 'player' : 'team'))
  const [team, setTeam] = useState(() => readHashParam('team') || 'BOS')
  const [who, setWho] = useState(() => readHashParam('player') || '')
  const players = useBucketsPlayers()
  const sel = mode === 'team' ? { team } : who ? { player: who } : null
  const { data, error, loading } = useBucketsShots(sel)
  const shots = useMemo(() => unpackShots(data?.shots), [data])
  const plist = useMemo(() => [...(players.data?.players || [])].sort((a, b) => b.pts - a.pts), [players.data])
  const pname = plist.find((p) => p.id === who)?.name
  const set = (k, v) => writeHashParam(k, v)
  const selStyle = { minHeight: 44, flex: '1 1 auto', maxWidth: 360, borderRadius: 10, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text, fontSize: 16, padding: '0 10px' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow="BUCKETS · SHOT MAP" title={mode === 'team' ? `${team} shots` : pname ? `${pname}’s shots` : 'Shot map'} theme={C} numFont={NUM_FONT} accent={C.purple}
        note="Every field-goal attempt on file, made and missed, with each zone’s makes over attempts."
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
            {plist.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.team}</option>)}
          </select>
          {who ? <NavBtn onClick={() => onOpenPlayer?.(who)}>Open his file →</NavBtn> : null}
        </label>
      )}
      <DelayedBanner error={error} what="the shot store" />
      {loading && !data ? <Loading what="the shots" /> : null}
      {mode === 'player' && !who && <EmptyState title="PICK A PLAYER" note="Choose a player above for every shot he took on file." />}
      {data && sel && !shots.length && <EmptyState title="NO SHOTS ON FILE" note="Nothing in the play-by-play store for this pick yet." />}
      {shots.length > 0 && <ShotChart shots={shots} filters={['result', 'type']} title={`Shot map, ${mode === 'team' ? team : pname || ''}`}
        source="Source: ESPN play-by-play, every field-goal attempt on file (buckets_shots, backfilled from last season and kept by the nightly tick)." />}
      <SourceLine>/api/buckets/shots reads buckets_shots in pages of 1,000, in a fixed order, so every attempt is counted once.</SourceLine>
    </div>
  )
}
