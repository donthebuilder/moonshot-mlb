'use client'
import { useMemo, useState } from 'react'
import { FilterSelect } from '../../Filters'
import { C, NUM_FONT, RAMP } from '../../../lib/nba/theme'
import { useBucketsPlayers } from '../../../lib/nba/useBuckets'
import { SportTheme } from '../../SportTheme'
import PlayerBoardFrame from '../../players/PlayerBoardFrame'
import TeamMark from '../../TeamMark'
import { DelayedBanner, Loading, LastSeasonNote } from '../ui'
import Player from './Player'
import { useLiveFetch } from '../../../lib/useLiveFetch'
import { nbaLeg } from '../../../lib/slip/rowLegs'

// 👤 PLAYERS, MOONSHOT'S PAGE (2026-10-17, Donovan: "everything needs to look like the MLB Props page and the NHL players page").
// It was a plain directory table that sent you to a separate page and back. Now MOONSHOT's PlayerBoard frame
// (components/players/PlayerBoardFrame.js, the one MLB, TUDDY and LAMP sit on): search, question chips + 🎲, the list with a chip,
// and his file INLINE (the same BUCKETS player file every other tap opens). The chip is points a game and the quiet number rebounds /
// assists -- season lines from the league's stats read, no board word, no score, so nothing here can show a CALLED pick.
// BUCKETS is hidden until BUCKETS_PUBLIC; this only renders inside its shell.
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const one = (v) => (Number.isFinite(Number(v)) ? (Math.round(Number(v) * 10) / 10).toFixed(1) : '—')

export default function Players({ onOpenTeam, onOpenGame }) {
  const { data, error, loading } = useBucketsPlayers()
  const { data: odds } = useLiveFetch('/api/odds/latest?sport=nba')   // the books' points price, where it sits on the board's bar
  const all = useMemo(() => [...(data?.players || [])].sort((a, b) => (Number(b.pts) || -1) - (Number(a.pts) || -1) || String(a.name).localeCompare(String(b.name))), [data])
  // TUDDY's team filter (components/nfl/tabs/NflPlayers.js, 2026-10-20 "match the nfl pages"): every club with its count, above the search
  const [team, setTeam] = useState('all')
  const teams = useMemo(() => {
    const counts = {}
    for (const p of all) if (p.team) counts[p.team] = (counts[p.team] || 0) + 1
    return [{ key: 'all', label: `All teams (${all.length})` }, ...Object.keys(counts).sort().map((k) => ({ key: k, label: `${k} (${counts[k]})` }))]
  }, [all])
  const rows = useMemo(() => (team === 'all' ? all : all.filter((p) => p.team === team)), [all, team])
  const asks = [
    { key: 'G', label: 'Guards', test: (p) => /G/.test(String(p.pos || '')), why: 'Point guards, shooting guards and combo guards' },
    { key: 'F', label: 'Forwards', test: (p) => /F/.test(String(p.pos || '')), why: 'Small and power forwards' },
    { key: 'C', label: 'Centers', test: (p) => /^C$/.test(String(p.pos || '')), why: 'Centers' },
  ]
  if (loading && !data) return <Loading what="the players" />
  return (
    <SportTheme theme={C} accent={C.purple} numFont={NUM_FONT}>
      <DelayedBanner error={error} what="the league’s stats" />
      {data?.stale && <LastSeasonNote label={data.seasonLabel} what="season lines" />}
      <PlayerBoardFrame
        ramp={RAMP}
        rows={rows}
        slipSport="nba"
        slipOf={(p) => nbaLeg(odds, { id: p.id, name: p.name, team: p.team }, 'pts')}
        idOf={(p) => String(p.id)}
        urlIdOf={(p) => String(p.id)}
        nameOf={(p) => p.name}
        searchText={(p) => norm(`${p.name} ${p.team}`)}
        metaOf={(p) => (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <TeamMark sport="nba" abbr={p.team} variant="logo" px={16} />
            <span>{p.pos || '—'}{Number.isFinite(Number(p.gp)) ? ` · ${p.gp} GP` : ''}</span>
          </span>
        )}
        scoreOf={(p) => (Number.isFinite(Number(p.pts)) ? Number(p.pts) : null)}
        scoreTitle={(p) => `${one(p.pts)} points, ${one(p.reb)} rebounds, ${one(p.ast)} assists a game this season`}
        scoreExtra={(p) => `${one(p.reb)} R · ${one(p.ast)} A`}
        asks={asks}
        placeholder="Search a player or club…"
        sideTop={<div style={{ marginBottom: 6 }}><FilterSelect label="Team" value={team} options={teams} onChange={setTeam} /></div>}
        noun="player"
        nounPlural="players"
        renderDetail={(p) => <Player id={String(p.id)} onOpenTeam={onOpenTeam} onOpenGame={onOpenGame} />}
      />
    </SportTheme>
  )
}
