'use client'
import { useState } from 'react'
import PageHeader from '../../PageHeader'
import LeaderTile from '../../LeaderTile'
import TeamMark from '../../TeamMark'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampLeaders } from '../../../lib/nhl/useLamp'
import { EmptyState, DelayedBanner, Loading, SourceLine, Pills, StaleSeasonNote, fmtPct3, fmt2, fmtSec, plusMinus } from '../ui'

// 🏒 LEADERS — who leads the league, measured by the league. Regular
// season, top three per category (MOONSHOT's LeaderTile), no model score anywhere on this page
// (the same sentence TUDDY's Leaders carries). Skaters and goalies are two
// views because they are two different games.
const SKATER = [
  ['points', 'POINTS', (v) => v], ['goals', 'GOALS', (v) => v], ['assists', 'ASSISTS', (v) => v],
  ['plusMinus', '+/-', plusMinus], ['toi', 'TIME ON ICE', fmtSec], ['faceoffLeaders', 'FACEOFF %', (v) => `${(v * 100).toFixed(1)}%`], ['penaltyMins', 'PENALTY MIN', (v) => v],
]
const GOALIE = [
  ['wins', 'WINS', (v) => v], ['savePctg', 'SAVE %', fmtPct3], ['goalsAgainstAverage', 'GAA', fmt2], ['shutouts', 'SHUTOUTS', (v) => v],
]

export default function Leaders({ onOpenPlayer, onOpenTeam }) {
  const [view, setView] = useState('skaters')
  const { data, error, loading } = useLampLeaders()
  const cats = view === 'skaters' ? SKATER : GOALIE
  const table = data?.[view] || {}
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader eyebrow="LAMP · LEADERS" title={data?.seasonLabel ? `${data.seasonLabel} leaders` : 'League leaders'}
        note="Regular season, top three in each category, straight from the league. Measured, not modelled: nothing on this page is a LAMP score." theme={C} numFont={NUM_FONT} accent={C.ice} />
      {/* Under the header, not in it: the header's right side hides on a phone. */}
      <Pills ariaLabel="Skaters or goalies" value={view} onChange={setView} options={[{ key: 'skaters', text: 'SKATERS' }, { key: 'goalies', text: 'GOALIES' }]} />
      {data?.stale && <StaleSeasonNote label={data.seasonLabel} opens={data.opens} what="leaders" />}
      <DelayedBanner error={error} what="the league’s leaders feed" />
      {loading && !data ? <Loading what="the leaders" /> : null}
      {!loading && data && !Object.keys(table).length && <EmptyState title="NO LEADERS YET" note="The league publishes leaders once games have been played." />}
      {/* MOONSHOT'S LEADER TILE (2026-09-29, parity): the leader, his value,
          team and position, then #2 and #3 -- the tile MOONSHOT and TUDDY use
          (components/LeaderTile.js), in place of ten-deep plain tables. */}
      <div className="bot-picks-grid" style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        {cats.filter(([k]) => table[k]?.length).map(([k, title, fmt]) => (
          <LeaderTile key={k} label={title}
            rows={table[k].slice(0, 3).map((r) => ({ _key: r.id, name: r.name, _raw: r }))}
            fmt={(r) => fmt(r._raw.value)} color={k === 'goals' ? C.lamp : C.ice}
            meta={(top) => <><TeamMark sport="nhl" abbr={top._raw.team} style={{ verticalAlign: 'middle' }} /> · {top._raw.pos}</>}
            onPlayerClick={onOpenPlayer ? (r) => onOpenPlayer(r.id) : undefined}
            theme={C} numFont={NUM_FONT} />
        ))}
      </div>
      <SourceLine>Source: NHL skater-stats-leaders and goalie-stats-leaders/{'{season}'}/2 via /api/lamp/leaders, cached ten minutes. The season shown is the newest one with games in it.</SourceLine>
    </div>
  )
}
