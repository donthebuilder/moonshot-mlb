'use client'
import { useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import LeaderTile from '../../LeaderTile'
import TeamMark from '../../TeamMark'
import LampTable from '../LampTable'
import { SportTheme } from '../../SportTheme'
import { LeadersIntro, LeadersFilterBar, LeadersLead, LeagueTopCard, LeadersSection } from '../../leaders/LeadersParts'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { TYPE } from '../../../lib/theme'
import { alpha } from '../../../lib/scales'
import { nhlMug } from '../../../lib/nhl/format'
import { useLampLeaders, useLampSeasonStats } from '../../../lib/nhl/useLamp'
import { DelayedBanner, Loading, SourceLine, StaleSeasonNote, fmtPct3, fmt2, fmtSec, plusMinus } from '../ui'

// 🏒 LEADERS — MOONSHOT'S PAGE, FOR HOCKEY (2026-09-29, Donovan: "make sure
// the leaders page for nfl and nhl look like mlb"). Same order as MOONSHOT's
// Leaders (components/tabs/Leaders.js):
//   1. title with the count, the ruled intro
//   2. tiles: the leaders among the men playing TONIGHT, each with who he
//      faces and #2 / #3 (MOONSHOT's LeaderTile). On a night with no games
//      the tiles rank the whole league and the line above them says so.
//   3. league-wide top 10s straight from the league's leaders feed (MOONSHOT's
//      StatsAPI top-10 cards); a name playing tonight is marked and opens
//   4. MOONSHOT's filter bar (min GP, position, lens, search) over the full
//      table of every season line (lib/nhl/seasonStats.js), sorted by the lens.
// Measured, not modelled: nothing on this page is a LAMP score.

const MIN_GP_STEPS = [0, 10, 20, 40]
const POS = [['all', 'All'], ['F', 'Fwd'], ['D', 'Def']]
const VIEWS = [['skaters', 'Skaters'], ['goalies', 'Goalies']]

const SKATER_LENSES = [['pts', '🏆 Points'], ['g', '🚨 Goals'], ['a', '🍎 Assists'], ['sog', '🎯 Shots'], ['ppp', '⚡ Power play'], ['toi', '⏱️ Ice time']]
const GOALIE_LENSES = [['w', '🏆 Wins'], ['svPct', '🧱 Save %'], ['gaa', '🥅 GAA'], ['so', '🔒 Shutouts']]
const LOW_IS_GOOD = new Set(['gaa'])

const SKATER_COLS = [
  { key: 'name', label: 'Skater', heat: false, w: 150, bold: true, sticky: true },
  { key: 'team', label: 'Tm', heat: false, w: 62, mono: true, dim: true, teamMark: 'nhl' },
  { key: 'opp', label: 'Tonight', heat: false, w: 50, mono: true, dim: true },
  { key: 'pos', label: 'Pos', heat: false, w: 34, mono: true, dim: true },
  { key: 'gp', label: 'GP', w: 40, title: 'Games played — read this before any rate on the row' },
  { key: 'g', label: 'G', w: 40 },
  { key: 'a', label: 'A', w: 40 },
  { key: 'pts', label: 'PTS', w: 44 },
  { key: 'ptsPg', label: 'P/GP', w: 48, dp: 2 },
  { key: 'pm', label: '+/-', w: 42, fmt: (v) => plusMinus(v) },
  { key: 'sog', label: 'SOG', w: 44 },
  { key: 'shPct', label: 'SH%', w: 48, dp: 1, title: 'Shooting percentage: goals per shot on goal' },
  { key: 'ppg', label: 'PPG', w: 42, title: 'Power-play goals' },
  { key: 'ppp', label: 'PPP', w: 42, title: 'Power-play points' },
  { key: 'gwg', label: 'GWG', w: 44, title: 'Game-winning goals' },
  { key: 'toi', label: 'TOI/GP', w: 54, fmt: (v) => fmtSec(v), title: 'Average ice time per game' },
  { key: 'fo', label: 'FO%', w: 46, dp: 1, title: 'Faceoff win percentage (centres; blank for anyone who never took one)' },
  { key: 'pim', label: 'PIM', w: 42, invert: true, title: 'Penalty minutes. Inverted: fewer is better for his team' },
]
const GOALIE_COLS = [
  { key: 'name', label: 'Goalie', heat: false, w: 150, bold: true, sticky: true },
  { key: 'team', label: 'Tm', heat: false, w: 62, mono: true, dim: true, teamMark: 'nhl' },
  { key: 'opp', label: 'Tonight', heat: false, w: 50, mono: true, dim: true },
  { key: 'gp', label: 'GP', w: 40 },
  { key: 'gs', label: 'GS', w: 40, title: 'Games started' },
  { key: 'w', label: 'W', w: 40 },
  { key: 'l', label: 'L', w: 40, invert: true },
  { key: 'otl', label: 'OTL', w: 42, invert: true },
  { key: 'svPct', label: 'SV%', w: 50, fmt: (v) => fmtPct3(v) },
  { key: 'gaa', label: 'GAA', w: 48, invert: true, fmt: (v) => fmt2(v), title: 'Goals against average. Inverted: lower is better' },
  { key: 'so', label: 'SO', w: 40, title: 'Shutouts' },
  { key: 'sa', label: 'SA', w: 46, title: 'Shots against' },
]

// Tiles: [key, label, format, colour key, minimum GP for a rate]. Counting
// stats rank everyone; a rate needs a sample or one hot night owns the tile
// (MOONSHOT's PA-per-HR tile takes 5 HR for the same reason).
const SKATER_TILES = [
  ['pts', 'Points', (v) => v, 'ice', 0], ['g', 'Goals', (v) => v, 'lamp', 0], ['a', 'Assists', (v) => v, 'ice', 0],
  ['sog', 'Shots on goal', (v) => v, 'ice', 0], ['ppp', 'Power-play points', (v) => v, 'ice', 0], ['toi', 'Ice time per game · min 10 GP', fmtSec, 'ice', 10],
]
const GOALIE_TILES = [
  ['w', 'Wins', (v) => v, 'ice', 0], ['svPct', 'Save % · min 10 GP', fmtPct3, 'ice', 10],
  ['gaa', 'GAA · min 10 GP', fmt2, 'ice', 10], ['so', 'Shutouts', (v) => v, 'ice', 0],
]

// The league's own top-10 feed (lib/nhl/readers readLeaders), whole league.
const SKATER_TOP = [['points', 'Points'], ['goals', 'Goals'], ['plusMinus', '+/-', plusMinus]]
const GOALIE_TOP = [['wins', 'Wins'], ['savePctg', 'Save %', fmtPct3], ['goalsAgainstAverage', 'GAA', fmt2]]
// Three cards, MOONSHOT's count (its SB / R / RBI top 10s): five was ~1,000px of phone.

// THE GROUP ROW (2026-10-01, BATCH-TABLE-SKIN-V2; the v2 skin only).
const LG = {
  skater: { key: 'who', label: 'Skater', order: 0 }, goalie: { key: 'who', label: 'Goalie', order: 0 },
  scoring: { key: 'scoring', label: 'Scoring', order: 1 }, shooting: { key: 'shooting', label: 'Shooting', order: 2 },
  pp: { key: 'pp', label: 'Power play', order: 3 }, usage: { key: 'usage', label: 'Usage', order: 4 },
  record: { key: 'record', label: 'Record', order: 1 }, net: { key: 'net', label: 'In net', order: 2 },
  more: { key: 'more', label: 'More', order: 9 },
}
const SKATER_GROUP_OF = { name: LG.skater, team: LG.skater, opp: LG.skater, pos: LG.skater, gp: LG.scoring, g: LG.scoring, a: LG.scoring, pts: LG.scoring, ptsPg: LG.scoring, pm: LG.scoring, gwg: LG.scoring, sog: LG.shooting, shPct: LG.shooting, ppg: LG.pp, ppp: LG.pp, toi: LG.usage, fo: LG.usage, pim: LG.usage }
const GOALIE_GROUP_OF = { name: LG.goalie, team: LG.goalie, opp: LG.goalie, gp: LG.record, gs: LG.record, w: LG.record, l: LG.record, otl: LG.record, so: LG.record, svPct: LG.net, gaa: LG.net, sa: LG.net }

export default function Leaders({ onOpenPlayer }) {
  const [view, setView] = useState('skaters')
  // null = automatic: 10 once the season has 20+ games in it, Any before
  // (opening week, every skater has 1-3 GP and a 10-game floor empties the
  // table). A tap on a step sets it for good.
  const [minGPPicked, setMinGP] = useState(null)
  const [pos, setPos] = useState('all')
  const [lens, setLens] = useState('pts')
  const [query, setQuery] = useState('')
  const leaders = useLampLeaders()
  const stats = useLampSeasonStats()
  const tonight = stats.data?.tonight || {}
  const playingTonight = Object.keys(tonight).length > 0
  const goalies = view === 'goalies'

  const setViewAndLens = (v) => { setView(v); setLens(v === 'goalies' ? 'w' : 'pts'); setPos('all') }

  const maxGP = useMemo(() => Math.max(0, ...(stats.data?.skaters || []).map((r) => r.gp || 0)), [stats.data])
  const minGP = minGPPicked ?? (maxGP >= 20 ? 10 : 0)
  const all = useMemo(() => (stats.data?.[view] || []).map((r) => ({
    ...r, _key: r.id, _raw: r,
    opp: tonight[r.team] ? `${tonight[r.team].home ? 'v' : '@'} ${tonight[r.team].opp}` : '',
    // The report's shares are rates (0.1234); the table prints percentages.
    shPct: r.shPct == null ? null : r.shPct * 100,
    fo: r.fo == null ? null : r.fo * 100,
  })), [stats.data, view, tonight])

  const rows = useMemo(() => {
    const q = query.toLowerCase().trim()
    return all
      .filter((r) => (r.gp ?? 0) >= minGP)
      .filter((r) => goalies || pos === 'all' || (pos === 'D' ? r.pos === 'D' : r.pos !== 'D'))
      .filter((r) => !q || `${r.name} ${r.team} ${r.opp}`.toLowerCase().includes(q))
  }, [all, minGP, pos, query, goalies])

  // Tiles rank tonight's men (MOONSHOT's rule: a leader with a matchup is a
  // lead). No games tonight: the whole league, said above the tiles.
  const tilePool = useMemo(() => all.filter((r) => !playingTonight || tonight[r.team]), [all, playingTonight, tonight])
  const top3 = (key, min) => tilePool
    .filter((r) => r[key] != null && (r.gp ?? 0) >= min)
    .sort((a, b) => (LOW_IS_GOOD.has(key) ? a[key] - b[key] : b[key] - a[key]))
    .slice(0, 3)

  // Every NHL player has a file, so every top-10 name opens it (MOONSHOT's
  // cards can only open men on tonight's slate; LAMP's can open anyone).
  const openTop = (r) => (onOpenPlayer ? () => onOpenPlayer(r.id) : undefined)
  const openRow = (r) => onOpenPlayer?.((r?._raw ?? r).id)

  const lenses = goalies ? GOALIE_LENSES : SKATER_LENSES
  const sortKey = lenses.some(([k]) => k === lens) ? lens : lenses[0][0]
  const leagueTable = leaders.data?.[view] || {}
  const season = stats.data?.season
  const stale = stats.data?.stale || leaders.data?.stale

  return (
    <SportTheme theme={C} accent={C.ice} numFont={NUM_FONT}>
      <div>
        <PageHeader
          title="League Leaders"
          sub={`${stats.data?.seasonLabel || leaders.data?.seasonLabel || 'Regular season'} lines, straight from the league — no model scores on this page`}
          right={stats.data ? (
            <span title={`${goalies ? 'Goalies' : 'Skaters'} the table is showing, out of everyone with a regular-season line.`}
              style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{rows.length} of {all.length} {view}</span>
          ) : null}
          theme={C}
          numFont={NUM_FONT}
        />

        <LeadersIntro>
          Straight season numbers — the scoring line, nothing weighted or projected. Every other board
          here ranks by the model; this one doesn&apos;t. It&apos;s the page for what a player has actually
          done, rather than what LAMP thinks of him tonight.
        </LeadersIntro>

        {stale && <StaleSeasonNote label={stats.data?.seasonLabel || leaders.data?.seasonLabel} opens={leaders.data?.opens} what="leaders" />}
        <DelayedBanner error={stats.error} what="the league’s season stats" />
        {stats.loading && !stats.data ? <Loading what="every season line" /> : null}

        {stats.data && (
          <>
            <LeadersLead>
              {playingTonight
                ? <>Every leader below is <b style={{ color: C.text2 }}>playing tonight</b> — tiles show who each one faces, plus the #2 and #3.</>
                : <>No games tonight, so the tiles rank <b style={{ color: C.text2 }}>the whole league</b>, with the #2 and #3.</>}
            </LeadersLead>
            <div className="bot-picks-grid" style={{
              display: 'grid', gap: 8, marginBottom: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            }}>
              {(goalies ? GOALIE_TILES : SKATER_TILES).map(([k, label, f, col, min]) => (
                <LeaderTile key={k} label={label} rows={top3(k, min)}
                  fmt={(r) => f(r[k])} color={C[col] || C.ice}
                  meta={(top) => <><TeamMark sport="nhl" abbr={top.team} style={{ verticalAlign: 'middle' }} /> · {top.gp} GP</>}
                  facing={(top) => (tonight[top.team]
                    ? { text: `tonight ${tonight[top.team].home ? 'vs' : 'at'} ${tonight[top.team].opp}`, title: `Tonight: ${top.team} ${tonight[top.team].home ? 'vs' : 'at'} ${tonight[top.team].opp}` }
                    : null)}
                  onPlayerClick={onOpenPlayer ? (r) => onOpenPlayer(r.id) : undefined}
                  theme={C} numFont={NUM_FONT} />
              ))}
            </div>
          </>
        )}

        <LeadersSection
          title={`🏒 League-wide top 10s — ${goalies ? 'goaltending' : 'scoring'}`}
          tint={alpha(C.ice, 0.04)}
          lead={<>whole league, live from the league&apos;s leaders feed. Tap a name to open his file.</>}>
          <DelayedBanner error={leaders.error} what="the league’s leaders feed" />
          {leaders.loading && !leaders.data ? <Loading what="the leaders" /> : null}
          <div className="bot-picks-grid" style={{
            display: 'grid', gap: 8,
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          }}>
            {(goalies ? GOALIE_TOP : SKATER_TOP).map(([k, label, f]) => (
              <LeagueTopCard key={k} title={`${label} — NHL top 10`}
                rows={(leagueTable[k] || []).map((r) => ({ id: r.id, name: r.name, team: r.team, value: r.value, display: f ? f(r.value) : r.value }))}
                open={openTop} />
            ))}
          </div>
        </LeadersSection>

        <LeadersFilterBar
          groups={[
            { label: 'View', value: view, onChange: setViewAndLens, options: VIEWS },
            { label: 'Min GP', value: minGP, onChange: setMinGP, options: MIN_GP_STEPS.map((v) => [v, v || 'Any']) },
            ...(goalies ? [] : [{ label: 'Pos', value: pos, onChange: setPos, options: POS }]),
            { label: 'Lens', value: sortKey, onChange: setLens, options: lenses, wrap: true },
          ]}
          search={{ value: query, onChange: setQuery, placeholder: `Search a ${goalies ? 'goalie' : 'skater'}…` }}
        />

        {stats.data && (!rows.length ? (
          <div style={{ fontSize: TYPE.body, color: C.text3, padding: '10px 2px' }}>
            Nobody has {minGP} games played with this filter.
          </div>
        ) : (
          <LampTable
            heatMode="sorted"
            key={`${view}-${sortKey}`}
            rows={rows}
            columns={(goalies ? GOALIE_COLS : SKATER_COLS).map((c) => ({ ...c, group: (goalies ? GOALIE_GROUP_OF : SKATER_GROUP_OF)[c.key] || LG.more }))}
            onRowClick={openRow}
            faceOf={(r) => ({ sport: 'nhl', photo: nhlMug(season, r.team, r.id), name: r.name })}
            initialSort={{ key: sortKey, dir: LOW_IS_GOOD.has(sortKey) ? 'asc' : 'desc' }}
            maxHeight={620}
            caption={`Regular-season lines, unmodelled. Minimum games played is set to ${minGP} because a rate on a handful of games is noise. ${goalies ? 'GAA, losses and OT losses are inverted so bright still means good for the goalie.' : 'PIM is inverted so bright still means good for his team; every other column reads high-is-good.'} Tap a row for his file.`}
          />
        ))}

        <SourceLine>Source: the NHL stats reports (skater/summary, goalie/summary, regular season) via /api/lamp/seasonstats, and the league&apos;s leaders feed via /api/lamp/leaders, both cached ten minutes. The season shown is the newest one with games in it.</SourceLine>
      </div>
    </SportTheme>
  )
}
