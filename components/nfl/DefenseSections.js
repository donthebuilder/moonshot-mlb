'use client'
import { useMemo } from 'react'
import { C, NUM_FONT, rampAt } from '../../lib/nfl/theme'
import NflTable from './NflTable'
import TagChips from './TagChips'
import DefenseTable from './DefenseTable'
import StatStrip from '../StatStrip'
import MobileFold from '../MobileFold'
import PlayerFace from '../PlayerFace'
import { playerHref } from '../../lib/routes'
import { useDefenders, useTagBook } from '../../lib/nfl/useDefense'
import { keyDefenders, GROUP_COLUMNS, COLUMN_LABEL, GROUP_WORD, groupOf } from '../../lib/nfl/defStats'

// THE DEFENSE SURFACES (2026-10-10): one file, four mounts.
//   DefenseFile      the game page and the Matchups detail: the defence an offence faces, its tags, its key defenders
//   TeamDefenders    the team page: tags and every defender by position group
//   DefenderFile     a defender's player page: season strip, this season's line, game by game
//   (TagChips / DefenseTable are the shared parts; lib/nfl/tags.js and lib/nfl/defStats.js are the numbers)
// Nothing here changes a score or a status word; a tag is a label with its number behind it.
const Kick = ({ children, style }) => <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.1em', color: C.text2, fontFamily: NUM_FONT, margin: '0 0 8px', ...style }}>{children}</div>
const muted = { fontSize: 12, lineHeight: 1.5, color: C.text3 }

const ROLE_WORD = { rush: 'Pass rusher', cover: 'Corner' }
const PCT_GROUP = { DL: 'defensive linemen', LB: 'linebackers', CB: 'defensive backs', S: 'defensive backs', DB: 'defensive backs' }

/** Tags for a defence, or the one honest line when none clears. */
function DefenceTags({ book, team }) {
  const tags = book.team(team)
  if (tags.length) return <TagChips tags={tags} />
  return <span style={muted}>{team} has no defence tag: its corners, pass rush and run defence sit in the middle of the league, or it has under 3 games to read.</span>
}

function keyRows(rows) {
  const { rushers, corners } = keyDefenders(rows)
  return [...rushers.map((r) => ({ ...r, role: ROLE_WORD.rush })), ...corners.map((r) => ({ ...r, role: ROLE_WORD.cover }))]
    .map((r) => ({ ...r, _id: `${r.role}-${r.id || r.espn_id || r.name}` }))
}

const KEY_COLS = [
  { key: 'name', label: 'Player', heat: false, sticky: true, w: 150, group: { key: 'who', label: 'Player', order: 0 }, fmt: (v, r) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <PlayerFace sport="nfl" espnId={r.espn_id} team={r.team} name={v} size={22} />
      {r.id ? <a href={playerHref('nfl', r.id)} style={{ color: 'inherit', textDecoration: 'none', whiteSpace: 'normal', lineHeight: 1.15, minWidth: 0 }}>{v}</a> : <span style={{ whiteSpace: 'normal', lineHeight: 1.15 }}>{v}</span>}
    </span>) },
  { key: 'role', label: 'Role', heat: false, w: 96, fold: true, group: { key: 'who', label: 'Player', order: 0 } },
  { key: 'games', label: 'GP', w: 40, dp: 0, group: { key: 'season', label: 'Season', order: 3 } },
  { key: 'tkl', label: 'TKL', w: 48, dp: 0, group: { key: 'tackling', label: 'Tackling', order: 1 }, explain: 'Tackles (solo plus assisted)' },
  { key: 'sck', label: 'SACK', w: 52, dp: 1, group: { key: 'rush', label: 'Pass rush', order: 2 }, explain: 'Sacks' },
  { key: 'qbh', label: 'QB HIT', w: 60, dp: 0, group: { key: 'rush', label: 'Pass rush', order: 2 }, explain: 'Quarterback hits' },
  { key: 'pd', label: 'PBU', w: 48, dp: 0, group: { key: 'cover', label: 'Coverage', order: 2.5 }, explain: 'Passes defended' },
  { key: 'int', label: 'INT', w: 44, dp: 0, group: { key: 'cover', label: 'Coverage', order: 2.5 }, explain: 'Interceptions' },
]

/** The defence an offence faces: tags (always visible) and its three best pass rushers and three corners (folded on a phone). */
export function DefenseFile({ matchup, slateSeason = null, def, off = null }) {
  const book = useTagBook(matchup, slateSeason, { turnovers: false })
  const d = useDefenders(def)
  const rows = useMemo(() => keyRows(d.rows), [d.rows])
  if (!def || !matchup) return null
  const src = d.season ? `${d.season}, ${d.games ?? '?'} games` : null
  return (
    <section aria-label={`${def} defense`} style={{ marginBottom: 14 }}>
      <Kick>{def} DEFENSE{off ? ` · WHAT ${off} FACES` : ''}</Kick>
      <div style={{ marginBottom: 8 }}><DefenceTags book={book} team={def} /></div>
      {rows.length > 0 ? (
        <MobileFold title="Key defenders" summary={`${def}'s best rushers and corners`} count={rows.length} accent={C.green}>
          <NflTable rows={rows} columns={KEY_COLS} maxRows={6} maxHeight={9999} bare
            caption={`${def}'s three best pass rushers (sacks, then QB hits) and three corners (passes defended plus interceptions), ${src || 'this season'}, from finished games. Snap counts are not published for defenders.`} />
        </MobileFold>
      ) : (
        <div style={muted}>{d.loading ? `Loading ${def}'s defenders…` : `No defender numbers for ${def} yet: ${d.failed ? 'neither the bot table nor ESPN box scores could be read.' : 'no finished game has a defensive line.'}`}</div>
      )}
    </section>
  )
}

/** The team page: tags, then every defender, a position group at a time. */
export function TeamDefenders({ team, matchup, slateSeason = null }) {
  const book = useTagBook(matchup, slateSeason, { turnovers: false })
  const d = useDefenders(team)
  if (!team) return null
  return (
    <section aria-label={`${team} defenders`}>
      <Kick style={{ color: C.green, letterSpacing: '.16em', fontSize: 11 }}>DEFENDERS{d.season ? ` · ${d.season}` : ''}{d.games ? ` · ${d.games} ${d.games === 1 ? 'GAME' : 'GAMES'}` : ''}</Kick>
      {matchup && <div style={{ marginBottom: 8 }}><DefenceTags book={book} team={team} /></div>}
      {d.rows.length > 0
        ? <DefenseTable rows={d.rows} unplaced={d.unplaced} source={{ season: d.season, games: d.games, partial: d.partial, missing: d.missing, boxLoaded: d.boxLoaded, botLoaded: d.botLoaded }} />
        : <div style={muted}>{d.loading ? 'Loading defenders…' : `No defender numbers for ${team} yet: ${d.failed ? 'neither the bot table nor ESPN box scores could be read.' : 'no finished game has a defensive line.'}`}</div>}
    </section>
  )
}

const LOG_COLS = (group) => {
  const keys = (GROUP_COLUMNS[group] || GROUP_COLUMNS.DB).filter((k) => k !== 'ff')   // forced fumbles are a season number only (not in a box score)
  const g = { tkl: { key: 'tackling', label: 'Tackling', order: 1 }, tfl: { key: 'tackling', label: 'Tackling', order: 1 }, sck: { key: 'rush', label: 'Pass rush', order: 2 }, qbh: { key: 'rush', label: 'Pass rush', order: 2 }, pd: { key: 'cover', label: 'Coverage', order: 3 }, int: { key: 'cover', label: 'Coverage', order: 3 }, fr: { key: 'take', label: 'Takeaways', order: 4 } }
  return [
    { key: 'wk', label: 'Wk', w: 40, heat: false, sticky: true, group: { key: 'who', label: 'Game', order: 0 }, fmt: (v) => `Wk ${v}` },
    { key: 'opp', label: 'Opp', w: 44, heat: false, teamMark: 'nfl', group: { key: 'who', label: 'Game', order: 0 } },
    ...keys.map((k) => ({ key: k, label: COLUMN_LABEL[k][0], w: k === 'qbh' ? 60 : 48, dp: k === 'sck' ? 1 : 0, group: g[k], explain: COLUMN_LABEL[k][1] })),
  ]
}

/** A defender's page section: the season strip (with the bot's group percentile where it has one), then game by game. */
export function DefenderFile({ player, matchup, slateSeason = null }) {
  const d = useDefenders(player?.team)
  const book = useTagBook(matchup, slateSeason, { turnovers: false })
  const line = useMemo(() => d.rows.find((r) => (player?.player_id && r.id === player.player_id) || (player?.espn_id && r.espn_id === player.espn_id)) || null, [d.rows, player])
  const group = line?.group || groupOf(player?.position) || 'DB'
  const log = useMemo(() => {
    const e = (d.boxPlayers || {})[line?.espn_id || player?.espn_id]
    return (e?.log || []).map((l) => ({ _id: `${l.w}-${l.opp}`, wk: l.w, opp: l.opp, tkl: l.def?.tot ?? null, tfl: l.def?.tfl ?? null, sck: l.def?.sck ?? null, qbh: l.def?.qbh ?? null, pd: l.def?.pd ?? null, int: l.def?.int ?? 0, fr: l.rec ?? 0 }))
  }, [d.boxPlayers, line, player])
  const keys = (GROUP_COLUMNS[group] || GROUP_COLUMNS.DB).filter((k) => line && line[k] != null)
  const stats = line ? keys.map((k) => {
    const pc = line.pctl && ({ tkl: 'tackles', tfl: 'tackles_for_loss', sck: 'sacks', qbh: 'qb_hits', pd: 'pass_defended', ff: 'fumbles_forced' })[k]
    const p = pc ? Number(line.pctl[pc]) : NaN
    return { id: k, label: COLUMN_LABEL[k][0], text: k === 'sck' ? String(Math.round(line[k] * 10) / 10) : String(line[k]), color: Number.isFinite(p) ? rampAt(p / 100) : null,
      title: `${COLUMN_LABEL[k][1]}: ${line[k]} this season${Number.isFinite(p) ? `, ${Math.round(p)}th percentile among ${PCT_GROUP[group] || 'his group'} (the bot’s table)` : ''}.` }
  }) : []
  return (
    <div style={{ marginTop: 6 }}>
      {matchup && <div style={{ margin: '0 0 10px' }}>
        <div style={{ ...muted, marginBottom: 4 }}>{player.team} defence tags</div>
        <DefenceTags book={book} team={player.team} />
      </div>}
      {line ? (
        <>
          <Kick>{`DEFENSE · ${GROUP_WORD[group]?.toUpperCase() || 'DEFENDER'} · ${d.season || 'THIS SEASON'}${line.games ? ` · ${line.games} ${line.games === 1 ? 'GAME' : 'GAMES'}` : ''}`}</Kick>
          <StatStrip stats={stats} wrap style={{ marginBottom: 8, gridTemplateColumns: `repeat(${Math.min(Math.max(stats.length, 1), 4)}, minmax(0, 1fr))` }} />
          <div style={{ ...muted, marginBottom: 12 }}>
            {line.source === 'bot' ? 'ESPN box scores did not load: these are the bot’s season numbers.' : 'Tackles, sacks, hits, passes defended, interceptions and fumble recoveries are sums of finished-game box scores.'}{' '}
            {line.ff != null ? `Forced fumbles (${line.ff}) are from the bot’s table.` : 'Forced fumbles are not available.'} No snap counts are published for defenders. A number is what he has done, not what he will do.
          </div>
          {log.length > 0 && (
            <>
              <Kick>GAME BY GAME</Kick>
              <NflTable rows={log} columns={LOG_COLS(group)} maxRows={18} maxHeight={9999} bare initialSort={{ key: 'wk', dir: 'asc' }}
                caption="One row per finished game he has a defensive line in, from the box score." />
            </>
          )}
        </>
      ) : (
        <div style={muted}>{d.loading ? 'Loading his defensive numbers…' : 'No defensive line for him this season: he has not recorded a defensive stat in a finished game, or the sources could not be read.'}</div>
      )}
    </div>
  )
}
