'use client'

// 🏅 THE AWARD RACES PANEL, EVERY LEAGUE (2026-10-20). Folded on Home under Title odds, the same way: the fold is not drawn
// until the sport's file reads (lib/awards.js), and <Fold> renders nothing while shut, so a reader who never opens it never
// fetches it. One chip per award, then the race as a table built like the Title odds table (components/PennantRace.js):
// DenseTable, the sport's accent (the chosen chip too: the filter chip's state style, in this product's colour), the share as the primary bar. Each row opens the player; the club opens the team.
// The rest of the race is one line under the table so the shares on the page add to 100%. The method line is always shown.
import { useEffect, useState } from 'react'
import Fold from './Fold'
import DenseTable from './DenseTable'
import { Empty } from './ui'
import { ShowMoreButton } from './ListPreview'
import { drawerChip } from './FiltersDrawer'
import { C } from '../lib/theme'
import { SPORT_ACCENT } from '../lib/sportAccent'
import { alpha } from '../lib/scales'
import { sharePct } from '../lib/championship'
import { awardsConfig, loadAwards } from '../lib/awards'

const NOTE = { fontSize: 12, color: C.text3, lineHeight: 1.55, margin: '8px 2px 0', maxWidth: 720 }

function Races({ sport, data, onOpenPlayer, onOpenTeam, canOpenPlayer }) {
  const cfg = awardsConfig(sport)
  const accent = SPORT_ACCENT[sport] || C.text
  const [key, setKey] = useState(data.races[0]?.key)
  const [allOpen, setAllOpen] = useState(false)
  const race = data.races.find((r) => r.key === key) || data.races[0]
  const rows = race.rows || []
  const shown = allOpen ? rows : rows.slice(0, cfg.previewRows)
  const top = Math.max(0.05, ...rows.map((r) => Number(r.share) || 0))
  return (
    <div>
      <div role="tablist" aria-label="Award" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '2px 0 8px' }}>
        {data.races.map((r) => (
          <button key={r.key} type="button" role="tab" aria-selected={r.key === race.key} title={r.title} onClick={() => { setKey(r.key); setAllOpen(false) }}
            style={{ ...drawerChip(r.key === race.key), ...(r.key === race.key ? { color: accent, border: `1px solid ${accent}`, background: alpha(accent, 0.14) } : null), minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 14px' }}>{r.label}</button>
        ))}
      </div>
      {race.status === 'waiting' ? <Empty text={race.why} /> : (
        <>
          <DenseTable bare noGroups accent={accent} sport={cfg.teamMark}
            rows={shown.map((r, i) => ({ ...r, _key: r.id, rank: i + 1, playerId: r.id }))}
            columns={[
              { key: 'rank', label: '#', group: 'Player', heat: false, w: 26 },
              { key: 'name', label: 'Player', group: 'Player', heat: false, bold: true, sticky: true, w: 150, ...(canOpenPlayer ? { link: (r) => (canOpenPlayer(String(r.playerId)) ? () => onOpenPlayer?.(String(r.playerId)) : null) } : null) },
              // the share leads, beside the name, so a phone sees it without scrolling the table
              { key: 'share', label: 'Share', group: 'Player', w: 64, primary: true, bar: 'primary', domain: [0, top], title: `His share of the ${race.title} race`, fmt: (v) => sharePct(v) },
              { key: 'team', label: 'Tm', group: 'Player', heat: false, mono: true, w: 52, teamMark: cfg.teamMark, link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
              ...(cfg.raceCols?.[race.key] || [...cfg.cols, ...(cfg.extraCols?.[race.key] || [])]).map((c) => ({ key: c.key, label: c.label, title: c.title, group: 'Line', w: 46, dp: c.dp, mono: true, ...(c.heat === false ? { heat: false } : null), ...(c.subOnly ? { subOnly: true } : null) })),
            ]}
            onRowClick={canOpenPlayer ? undefined : (r) => onOpenPlayer?.(String((r?._raw ?? r).playerId))} nameCell="player" faceOf={(r) => ({ sport: cfg.teamMark, id: r.playerId, espnId: r.espnId, name: r.name })}
            initialSort={{ key: 'share', dir: 'desc' }} heatMode="sorted" maxHeight={9999} maxRows={rows.length}
            caption={`${race.title}: the top ${rows.length} of ${race.pool} players, each with his share of the race. ${canOpenPlayer ? 'A linked name' : 'Each row'} opens that player.`} />
          <ShowMoreButton open={allOpen} restN={rows.length - shown.length} toggle={() => setAllOpen((v) => !v)} itemWord="players" />
          <p style={NOTE}>Other {Math.max(0, (race.pool || 0) - rows.length)}: {sharePct(race.rest)}. {race.measured}</p>
        </>
      )}
      <p style={NOTE}>{data.method}{data.note ? ` ${data.note}` : ''}</p>
    </div>
  )
}

// canOpenPlayer(id) (optional): only those names are links, the rest plain text -- a product whose player card does not cover
// everyone in a race (TUDDY's card covers its board: passers, runners, catchers) never draws a dead tap.
export default function AwardRaces({ sport, onOpenPlayer, onOpenTeam, canOpenPlayer = null }) {
  const cfg = awardsConfig(sport)
  const [data, setData] = useState(null)
  useEffect(() => {
    if (!cfg) return undefined
    let alive = true
    loadAwards(sport).then((r) => { if (alive) setData(r) }).catch(() => {})
    return () => { alive = false }
  }, [sport, cfg])
  if (!cfg || !data?.ok) return null
  return (
    <Fold id={cfg.foldId} title={cfg.foldTitle} meta={cfg.foldMeta}>
      <Races sport={sport} data={data} onOpenPlayer={onOpenPlayer} onOpenTeam={onOpenTeam} canOpenPlayer={canOpenPlayer} />
    </Fold>
  )
}
