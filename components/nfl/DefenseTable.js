'use client'
import { useMemo, useState } from 'react'
import NflTable from './NflTable'
import PlayerFace from '../PlayerFace'
import { FilterPill } from '../Filters'
import { playerHref } from '../../lib/routes'
import { DEF_GROUPS, GROUP_WORD, GROUP_COLUMNS, COLUMN_LABEL, sortGroup, leadStat } from '../../lib/nfl/defStats'

// THE DEFENDERS TABLE (2026-10-10, Donovan: "we need to pull defensive stats too for the stat and players").
// One table, one position group at a time (DL / LB / CB / S, DB where only the generic word is known), each group
// with the columns that mean something for it: a lineman has sacks and QB hits, a corner has passes defended and
// interceptions. Rows come from lib/nfl/defStats.js joinDefenders (TUDDY's table + ESPN box scores + the roster);
// the caption says which season and how many games. A column nobody in the group has a number for is not drawn.
// Tables lead, so the table is the whole section: no card above it. First column sticky; the table scrolls inside its own box.
const COL_GROUP = {
  tkl: { key: 'tackling', label: 'Tackling', order: 1 }, tfl: { key: 'tackling', label: 'Tackling', order: 1 },
  sck: { key: 'rush', label: 'Pass rush', order: 2 }, qbh: { key: 'rush', label: 'Pass rush', order: 2 },
  pd: { key: 'cover', label: 'Coverage', order: 3 }, int: { key: 'cover', label: 'Coverage', order: 3 },
  ff: { key: 'take', label: 'Takeaways', order: 4 }, fr: { key: 'take', label: 'Takeaways', order: 4 },
}
const WHO = { key: 'who', label: 'Player', order: 0 }
const SEASON = { key: 'season', label: 'Season', order: 5 }
const DP = { sck: 1, tkl: 0, tfl: 0, qbh: 0, pd: 0, int: 0, ff: 0, fr: 0 }

export function defenderColumns(group, rows) {
  const want = (GROUP_COLUMNS[group] || GROUP_COLUMNS.DB).filter((k) => rows.some((r) => r[k] != null))
  const cols = [
    { key: 'name', label: 'Player', heat: false, sticky: true, w: 168, group: WHO, fmt: (v, r) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <PlayerFace sport="nfl" espnId={r.espn_id} team={r.team} name={v} size={22} />
        {r.id
          ? <a href={playerHref('nfl', r.id)} style={{ color: 'inherit', textDecoration: 'none', whiteSpace: 'normal', lineHeight: 1.15, minWidth: 0 }}>{v}</a>
          : <span style={{ whiteSpace: 'normal', lineHeight: 1.15, minWidth: 0 }}>{v}</span>}
      </span>) },
    { key: 'position', label: 'Pos', heat: false, w: 44, fold: true, group: WHO },
    ...(rows.some((r) => r.status && r.status !== 'Active') ? [{ key: 'status', label: 'Status', heat: false, w: 96, group: WHO, title: 'From the roster file: active, IR, practice squad. Nothing about this week’s practice report.' }] : []),
    ...want.map((k) => ({
      key: k, label: COLUMN_LABEL[k][0], w: k === 'qbh' ? 62 : 52, dp: DP[k], group: COL_GROUP[k], explain: COLUMN_LABEL[k][1],
      primary: k === leadStat(group),
    })),
    { key: 'games', label: 'GP', w: 40, dp: 0, group: SEASON, explain: 'Games he has a line in this season' },
  ]
  return cols
}

/**
 * rows = defenderLine objects; `source` = { season, games, partial, boxLoaded, botLoaded } for the caption.
 * `group` (optional) pins the group; otherwise the first group that has men leads and the pills switch.
 */
export default function DefenseTable({ rows = [], unplaced = 0, source = null, group: pinned = null, maxRows = 8, caption = null, bare = false }) {
  const present = useMemo(() => DEF_GROUPS.filter((g) => rows.some((r) => r.group === g)), [rows])
  const [pick, setPick] = useState(null)
  const group = pinned || (present.includes(pick) ? pick : present[0] || null)
  const shown = useMemo(() => sortGroup(rows.filter((r) => r.group === group), group), [rows, group])
  if (!rows.length || !group) return null
  const cols = defenderColumns(group, shown)
  const table = shown.map((r) => ({ ...r, _id: r.id || r.espn_id || r.name, _raw: r }))
  const yr = source?.season
  const note = caption || [
    `${GROUP_WORD[group]}${yr ? `, ${yr}` : ''}${source?.games ? `, ${source.games} ${source.games === 1 ? 'game' : 'games'}` : ''}.`,
    source?.boxLoaded ? 'Tackles, sacks, hits, passes defended, interceptions and fumble recoveries are ESPN box-score sums over finished games.' : 'ESPN box scores did not load, so these are TUDDY’s season numbers (men with 4+ games).',
    source?.botLoaded ? 'Forced fumbles come from TUDDY’s table.' : 'Forced fumbles are not shown: TUDDY’s table did not load.',
    'Snap counts are not published for defenders, so none are shown.',
    source?.partial ? `${source.missing} finished ${source.missing === 1 ? 'game' : 'games'} could not be read yet, so totals may be short.` : '',
    unplaced ? `${unplaced} ${unplaced === 1 ? 'man' : 'men'} with a box-score line have no position on file and are left out.` : '',
  ].filter(Boolean).join(' ')
  return (
    <div>
      {!pinned && present.length > 1 && (
        <div role="group" aria-label="Position group" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 8px' }}>
          {present.map((g) => (
            <FilterPill key={g} tall active={g === group} onClick={() => setPick(g)} count={rows.filter((r) => r.group === g).length}>{g}</FilterPill>
          ))}
        </div>
      )}
      <NflTable key={group} rows={table} columns={cols} initialSort={{ key: leadStat(group), dir: 'desc' }}
        maxRows={maxRows} maxHeight={9999} bare={bare} caption={note} />
    </div>
  )
}
