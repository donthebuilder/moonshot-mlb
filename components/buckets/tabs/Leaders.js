'use client'
import { useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import LeaderTile, { LEADER_GRID } from '../../LeaderTile'
import TeamMark from '../../TeamMark'
import BucketsTable from '../BucketsTable'
import { SportTheme } from '../../SportTheme'
import MobileFold from '../../MobileFold'
import { LeadersIntro, LeadersFilterBar, LeadersLead, LeagueTopCard, LeadersSection, CappedTiles } from '../../leaders/LeadersParts'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { TYPE } from '../../../lib/theme'
import { alpha } from '../../../lib/scales'
import { useBucketsLeaders, useBucketsPlayers, useBucketsBoard } from '../../../lib/nba/useBuckets'
import { DelayedBanner, Loading, LastSeasonNote } from '../ui'

// 🏆 LEADERS -- LAMP'S PAGE, FOR BASKETBALL (2026-10-20, Donovan: "Leaders like LAMP's"; components/lamp/tabs/Leaders.js, itself MOONSHOT's
// order), from the shared parts (components/leaders/LeadersParts, LeaderTile):
//   1. title with the count, the intro one tap away on a phone
//   2. tiles: the leaders among the players in a game TONIGHT, each with who he faces and #2 / #3; no games tonight -> the whole league, said
//   3. the league's top 10s (/api/buckets/leaders, its 20-game floor) one tap under the tiles
//   4. the filter bar (min GP, position, lens, search) over every season line (/api/buckets/players), sorted by the lens
// Per game, regular season, measured, not modelled: nothing on this page is a BUCKETS score.

const MIN_GP_STEPS = [0, 10, 20, 40]
const POS = [['all', 'All'], ['G', 'Guards'], ['F', 'Forwards'], ['C', 'Centers']]
const LENSES = [['pts', '🏀 Points'], ['reb', '🧱 Rebounds'], ['ast', '🎯 Assists'], ['tpm', '👌 Threes'], ['pra', '➕ PRA'], ['min', '⏱️ Minutes']]
const TILES = [['pts', 'Points per game'], ['reb', 'Rebounds per game'], ['ast', 'Assists per game'], ['tpm', 'Threes per game'], ['pra', 'PRA per game'], ['min', 'Minutes per game']]
const TOP = [['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists']]   // three cards, LAMP's and MOONSHOT's count
const f1 = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '—')

const LG = { who: { key: 'who', label: 'Player', order: 0 }, line: { key: 'line', label: 'Per game', order: 1 }, usage: { key: 'usage', label: 'Usage', order: 2 } }
const COLS = [
  { key: 'name', label: 'Player', heat: false, w: 150, bold: true, sticky: true, group: LG.who },
  { key: 'team', label: 'Tm', heat: false, w: 62, mono: true, dim: true, teamMark: 'nba', group: LG.who },
  { key: 'opp', label: 'Tonight', heat: false, w: 54, mono: true, dim: true, group: LG.who },
  { key: 'pos', label: 'Pos', heat: false, w: 34, mono: true, dim: true, group: LG.who },
  { key: 'gp', label: 'GP', w: 40, group: LG.usage, title: 'Games played: read this before any rate on the row' },
  { key: 'pts', label: 'PTS', w: 46, dp: 1, group: LG.line },
  { key: 'reb', label: 'REB', w: 46, dp: 1, group: LG.line },
  { key: 'ast', label: 'AST', w: 46, dp: 1, group: LG.line },
  { key: 'tpm', label: '3PM', w: 46, dp: 1, group: LG.line },
  { key: 'pra', label: 'PRA', w: 48, dp: 1, group: LG.line, title: 'Points + rebounds + assists a game' },
  { key: 'min', label: 'MIN', w: 46, dp: 1, group: LG.usage },
]

export default function Leaders({ onOpenPlayer }) {
  const [minGPPicked, setMinGP] = useState(null)
  const [pos, setPos] = useState('all')
  const [lens, setLens] = useState('pts')
  const [query, setQuery] = useState('')
  const leaders = useBucketsLeaders()
  const stats = useBucketsPlayers()
  const board = useBucketsBoard(null, 'pts')   // tonight's games (the board's own list), for "tonight vs" and the tiles' pool
  const tonight = useMemo(() => {
    const m = {}
    for (const g of board.data?.games || []) {
      const a = g.away?.abbrev, h = g.home?.abbrev
      if (a && h) { m[a] = { opp: h, home: false }; m[h] = { opp: a, home: true } }
    }
    return m
  }, [board.data])
  const playingTonight = Object.keys(tonight).length > 0

  const all = useMemo(() => (stats.data?.players || []).map((r) => ({
    ...r, _key: r.id, _raw: r, playerId: r.id,
    pra: [r.pts, r.reb, r.ast].every((v) => Number.isFinite(Number(v))) ? Number(r.pts) + Number(r.reb) + Number(r.ast) : null,
    opp: tonight[r.team] ? `${tonight[r.team].home ? 'v' : '@'} ${tonight[r.team].opp}` : '',
  })), [stats.data, tonight])
  // null = automatic: 10 once the season has 20+ games in it, Any before (LAMP's rule: opening week empties a 10-game floor)
  const maxGP = useMemo(() => Math.max(0, ...all.map((r) => r.gp || 0)), [all])
  const minGP = minGPPicked ?? (maxGP >= 20 ? 10 : 0)

  const rows = useMemo(() => {
    const q = query.toLowerCase().trim()
    return all
      .filter((r) => (r.gp ?? 0) >= minGP)
      .filter((r) => pos === 'all' || r.pos === pos)
      .filter((r) => !q || `${r.name} ${r.team} ${r.opp}`.toLowerCase().includes(q))
  }, [all, minGP, pos, query])

  const tilePool = useMemo(() => all.filter((r) => (!playingTonight || tonight[r.team]) && (r.gp ?? 0) >= minGP), [all, playingTonight, tonight, minGP])
  const top3 = (key) => tilePool.filter((r) => Number.isFinite(Number(r[key]))).sort((a, b) => b[key] - a[key]).slice(0, 3)
  const openTop = (r) => (onOpenPlayer ? () => onOpenPlayer(r.id) : undefined)
  const openRow = (r) => onOpenPlayer?.((r?._raw ?? r).id)
  const sortKey = LENSES.some(([k]) => k === lens) ? lens : 'pts'
  const cats = new Map((leaders.data?.categories || []).map((c) => [c.key, c]))
  const label = stats.data?.seasonLabel || leaders.data?.seasonLabel || 'Regular season'

  return (
    <SportTheme theme={C} accent={C.purple} numFont={NUM_FONT}>
      <div>
        <PageHeader
          title="League Leaders"
          sub={`${label} lines, straight from the league`}
          right={stats.data ? (
            <span title="Players the table is showing, out of everyone with a regular-season line." style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{rows.length} of {all.length} players</span>
          ) : null}
          theme={C}
          numFont={NUM_FONT}
        />

        <MobileFold title="What this page is" summary="season lines, not modelled" accent={C.purple}>
          <LeadersIntro>
            Straight season numbers, per game: nothing weighted or projected. Every other board here ranks by the model; this one doesn&apos;t.
            It&apos;s the page for what a player has actually done, rather than what BUCKETS thinks of him tonight.
          </LeadersIntro>
        </MobileFold>

        {(stats.data?.stale || leaders.data?.stale) && <LastSeasonNote label={label} what="leaders" />}
        <DelayedBanner error={stats.error} what="the season lines" />
        {stats.loading && !stats.data ? <Loading what="every season line" /> : null}

        {stats.data && (
          <>
            <LeadersLead>
              {playingTonight
                ? <>Every leader below is <b style={{ color: C.text2 }}>playing tonight</b>: tiles show who each one faces, plus the #2 and #3.</>
                : <>No games tonight, so the tiles rank <b style={{ color: C.text2 }}>the whole league</b>, with the #2 and #3.</>}
            </LeadersLead>
            <CappedTiles cap={4} word="leaders" className="leader-grid" style={{ ...LEADER_GRID, marginBottom: 12 }}>
              {TILES.map(([k, tileLabel]) => (
                <LeaderTile key={k} label={tileLabel} rows={top3(k)} fmt={(r) => f1(r[k])} color={C.purple}
                  meta={(top) => <><TeamMark sport="nba" abbr={top.team} style={{ verticalAlign: 'middle' }} /> · {top.gp} GP</>}
                  facing={(top) => (tonight[top.team]
                    ? { text: `tonight ${tonight[top.team].home ? 'vs' : 'at'} ${tonight[top.team].opp}`, title: `Tonight: ${top.team} ${tonight[top.team].home ? 'vs' : 'at'} ${tonight[top.team].opp}` }
                    : null)}
                  onPlayerClick={onOpenPlayer ? (r) => onOpenPlayer(r.id) : undefined}
                  theme={C} numFont={NUM_FONT} />
              ))}
            </CappedTiles>
          </>
        )}

        <MobileFold title="🏀 League-wide top 10s" summary={`per game, ${leaders.data?.minGames || 20}+ games`} accent={C.purple}>
          <LeadersSection title="🏀 League-wide top 10s, per game" tint={alpha(C.purple, 0.04)} lead={<>whole league, {leaders.data?.minGames || 20}+ games played. Tap a name to open his file.</>}>
            <DelayedBanner error={leaders.error} what="the leaders" />
            {leaders.loading && !leaders.data ? <Loading what="the leaders" /> : null}
            <div className="bot-picks-grid" style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              {TOP.map(([k, topLabel]) => (
                <LeagueTopCard key={k} title={`${topLabel}: NBA top 10`}
                  rows={(cats.get(k)?.leaders || []).map((r) => ({ id: r.id, name: r.name, team: r.team, value: r.value, display: f1(r.value) }))}
                  open={openTop} />
              ))}
            </div>
          </LeadersSection>
        </MobileFold>

        <LeadersFilterBar
          groups={[
            { label: 'Min GP', value: minGP, onChange: setMinGP, options: MIN_GP_STEPS.map((v) => [v, v || 'Any']) },
            { label: 'Pos', value: pos, onChange: setPos, options: POS },
            { label: 'Lens', value: sortKey, onChange: setLens, options: LENSES, wrap: true },
          ]}
          search={{ value: query, onChange: setQuery, placeholder: 'Search a player…' }}
        />

        {stats.data && (!rows.length ? (
          <div style={{ fontSize: TYPE.body, color: C.text3, padding: '10px 2px' }}>Nobody has {minGP} games played with this filter.</div>
        ) : (
          <BucketsTable
            heatMode="sorted"
            key={sortKey}
            rows={rows}
            columns={COLS}
            onRowClick={openRow}
            nameCell="player" faceOf={(r) => ({ sport: 'nba', id: r.id, name: r.name })}
            initialSort={{ key: sortKey, dir: 'desc' }}
            maxHeight={620}
            caption={`Regular-season lines, per game, unmodelled. Minimum games played is set to ${minGP} because a rate on a handful of games is noise. Tap a row for his file.`}
          />
        ))}
      </div>
    </SportTheme>
  )
}
