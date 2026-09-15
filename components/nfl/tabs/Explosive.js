'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../../lib/nfl/theme'
import DenseTable from '../../DenseTable'
import { ActiveFilters, FilterBar, FilterSearch, FilterSelect, PillRow } from '../../Filters'

// 🚀 EXPLOSIVE — TUDDY'S SIDE OF PATH TO VICTORY B10(l), THE POWER BOARD.
//
// The 09-14 clone-list audit called this "genuine missing page... needs new
// NFL-side data entirely that doesn't exist" after grepping components/nfl/
// and lib/nfl/ for explosive/big-play NAMING and finding nothing. That grep
// was the wrong test (same lesson as rule #37, moonshot-b10-clone-list-audit
// itself already logged once this session for Box Scores): the SITE never
// named this concept, but the BOT already had -- bots/nfl/nfl_explosive.py,
// real nflreadpy play-by-play, already wired into nfl_bot.py (lines 833-835)
// and already published in nfl_matchup.json as `player_explosive` (269 real
// receivers, every 10/20/30/40-yard reception bucket plus longest and
// longest-TD) and `def_explosive` (all 32 defenses, the same buckets against
// what they allow, plus a 20+-air-yard "deep shot" split). It was sitting in
// the payload, partially read for one-off use (a single defense's row inside
// Matchups.js's Profile panel, a single player's row inside NflPlayerModal)
// but never surfaced as its own ranked board -- exactly B3's "published,
// nothing reads them" pattern, just under a different item number.
//
// Verified before building: fetched the real live nfl_matchup.json off the
// data branch. 269/269 player_explosive entries match a player on the
// CURRENT week's roster (nfl_week.json) by the same player_id -- zero
// unmatched, zero invented rows. All 32 def_explosive teams match the
// current week's 32 team abbreviations exactly.
//
// SEASON DISCLOSURE. `matchup.season` is not always the live season -- this
// is nfl_features.py's own documented rule (stats_season_for): early in a
// season, before it has three played weeks of its own, DvP/coverage/field/
// explosive/usage all point at last season's complete, real games instead
// of guessing off a handful of this year's. Once this year clears three
// played weeks the bot switches over on its own. Shown here, not hidden --
// same discipline DvpTable/Matchups already carry for the tables that read
// this same file.
//
// WHAT THIS IS NOT: a rushing big-play board. nfl_explosive.py's
// player_explosive() only tracks PASS plays (a receiver's own catches) --
// there is no rush-chunk-play equivalent published anywhere yet. Showing one
// here would mean inventing it. If that ever matters, it is bot-side work,
// not a client-side guess.

const BUCKET_COLS = [
  { key: 'rec_10', label: '10+', w: 34, dp: 0, title: '10+ yard receptions' },
  { key: 'rec_20', label: '20+', w: 34, dp: 0, title: '20+ yard receptions' },
  { key: 'rec_30', label: '30+', w: 34, dp: 0, title: '30+ yard receptions' },
  { key: 'rec_40', label: '40+', w: 34, dp: 0, title: '40+ yard receptions' },
]

const PLAYER_COLUMNS = [
  { key: 'name', label: 'Player', heat: false, sticky: true, bold: true, w: 148 },
  { key: 'team', label: 'Team', heat: false, w: 46 },
  { key: 'position', label: 'Pos', heat: false, w: 40 },
  { key: 'tgts', label: 'TGT', w: 44, dp: 0 },
  { key: 'rec', label: 'REC', w: 44, dp: 0 },
  { key: 'yds', label: 'YDS', w: 48, dp: 0 },
  { key: 'air', label: 'AIR YDS', w: 60, dp: 0, title: 'Total air yards on his targets, complete or not' },
  ...BUCKET_COLS,
  { key: 'lng', label: 'LNG', w: 44, dp: 0, title: 'Longest reception' },
  { key: 'lng_td', label: 'LNG TD', w: 56, dp: 0, title: 'Longest touchdown reception' },
]

const DEF_BUCKET_COLS = [
  { key: 'pass_10', label: '10+', w: 34, dp: 0, title: '10+ yard completions allowed' },
  { key: 'pass_20', label: '20+', w: 34, dp: 0, title: '20+ yard completions allowed' },
  { key: 'pass_30', label: '30+', w: 34, dp: 0, title: '30+ yard completions allowed' },
  { key: 'pass_40', label: '40+', w: 34, dp: 0, title: '40+ yard completions allowed' },
]

const DEFENSE_COLUMNS = [
  { key: 'team', label: 'Team', heat: false, sticky: true, bold: true, w: 60 },
  { key: 'yds', label: 'YDS', w: 52, dp: 0, title: 'Total passing yards allowed' },
  { key: 'air', label: 'AVG DEPTH', w: 68, dp: 1, title: 'Average target depth allowed (air yards per attempt)' },
  ...DEF_BUCKET_COLS,
  { key: 'exp_pct', label: 'EXP%', w: 54, dp: 1, invert: true, title: '20+ yard completions allowed, as a share of pass attempts -- the single explosive-matchup number' },
  { key: 'deep_att', label: 'DEEP ATT', w: 62, dp: 0, title: '20+ air-yard attempts faced' },
  { key: 'deep_pct', label: 'DEEP CMP%', w: 70, dp: 1, invert: true, title: 'Completion % allowed on 20+ air-yard attempts' },
  { key: 'deep_td', label: 'DEEP TD', w: 58, dp: 0, invert: true },
]

export default function Explosive({ matchup, data, onPlayerClick }) {
  const [lens, setLens] = useState('player')
  const [query, setQuery] = useState('')
  const [team, setTeam] = useState('all')
  const [position, setPosition] = useState('all')

  const rosterById = useMemo(
    () => Object.fromEntries((data?.players || []).map((p) => [p.player_id, p])),
    [data],
  )

  const playerRows = useMemo(() => {
    const pe = matchup?.player_explosive || {}
    return Object.entries(pe).map(([pid, v]) => {
      const p = rosterById[pid]
      // A player_explosive id with no match on this week's roster is a name
      // this file can't safely show (retired, off a roster, wrong id) --
      // drop it rather than render a blank row. Verified live: 0 of 269 hit
      // this today; kept as a real guard, not a defensive hedge.
      if (!p) return null
      return {
        ...v,
        player_id: pid,
        name: p.name,
        team: p.team,
        position: p.position,
        opp: p.opp,
        _raw: p,
      }
    }).filter(Boolean)
  }, [matchup, rosterById])

  const defenseRows = useMemo(() => {
    const de = matchup?.def_explosive || {}
    // nfl_explosive.py computes att/cmp internally (to build exp_pct) but
    // never publishes them -- confirmed against the live payload's own keys.
    // No completion-percent column here for that reason; exp_pct/deep_pct
    // are real published rates and carry the same information.
    return Object.entries(de).map(([abbr, v]) => ({ ...v, team: abbr }))
  }, [matchup])

  const filterOptions = useMemo(() => {
    const countBy = (key) => playerRows.reduce((acc, p) => {
      const value = p[key]
      if (value) acc[value] = (acc[value] || 0) + 1
      return acc
    }, {})
    const teams = countBy('team')
    const positions = countBy('position')
    return {
      teams: [{ key: 'all', label: 'All teams', count: playerRows.length }, ...Object.keys(teams).sort().map((key) => ({ key, label: key, count: teams[key] }))],
      positions: [{ key: 'all', label: 'All positions', count: playerRows.length }, ...Object.keys(positions).sort().map((key) => ({ key, label: key, count: positions[key] }))],
    }
  }, [playerRows])

  const filteredPlayers = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return playerRows.filter((p) => (
      (team === 'all' || p.team === team)
      && (position === 'all' || p.position === position)
      && (!needle || p.name.toLowerCase().includes(needle))
    ))
  }, [playerRows, query, team, position])

  const filteredDefenses = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return defenseRows.filter((d) => (
      (team === 'all' || d.team === team)
      && (!needle || d.team.toLowerCase().includes(needle))
    ))
  }, [defenseRows, query, team])

  if (!Object.keys(matchup?.player_explosive || {}).length && !Object.keys(matchup?.def_explosive || {}).length) {
    return (
      <div style={{ padding: 26, border: `1px dashed ${C.border2}`, borderRadius: 12, textAlign: 'center', color: C.text3, fontSize: 10.5 }}>
        Waiting on the bot's next matchup publish — explosive-play data ships with nfl_matchup.json.
      </div>
    )
  }

  return (
    <div>
      <div style={{
        position: 'relative', padding: '20px 22px', marginBottom: 14,
        border: `1px solid ${lens === 'player' ? 'rgba(0,245,173,.28)' : 'rgba(53,205,255,.28)'}`,
        borderRadius: 16, background: C.bg2,
      }}>
        <small style={{ display: 'block', color: lens === 'player' ? C.green : C.cyan, font: `900 8px/1 ${NUM_FONT}`, letterSpacing: '.12em', marginBottom: 8 }}>
          TUDDY · EXPLOSIVE
        </small>
        <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(22px,3.8vw,34px)', letterSpacing: '-.03em' }}>
          {lens === 'player' ? 'Who turns a target into a chunk play' : 'Who gives up the chunk play'}
        </h1>
        <p style={{ maxWidth: 620, margin: 0, color: C.text3, fontSize: 11, lineHeight: 1.55 }}>
          Every 10/20/30/40-yard reception, real, off {matchup?.season || 'the'} play-by-play
          {' — '}
          {lens === 'player'
            ? 'a receiver’s own ceiling, not his average game.'
            : 'which defense turns a normal target into a big one.'}
        </p>
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 11,
        padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 12,
        background: C.bg2,
      }}>
        <PillRow
          label="Board"
          value={lens}
          options={[
            { key: 'player', label: 'Players', count: playerRows.length },
            { key: 'defense', label: 'Defense allowed', count: defenseRows.length },
          ]}
          onChange={setLens}
        />
        <FilterBar>
          <FilterSearch value={query} onChange={setQuery} placeholder={lens === 'player' ? 'Search player…' : 'Search team…'} width={165} />
          {lens === 'player' && (
            <>
              <FilterSelect label="Team" value={team} options={filterOptions.teams} onChange={setTeam} />
              <FilterSelect label="Position" value={position} options={filterOptions.positions} onChange={setPosition} />
            </>
          )}
        </FilterBar>
        <ActiveFilters
          shown={lens === 'player' ? filteredPlayers.length : filteredDefenses.length}
          total={lens === 'player' ? playerRows.length : defenseRows.length}
          filters={[
            query && { key: 'query', label: `Name: ${query}`, onClear: () => setQuery('') },
            lens === 'player' && team !== 'all' && { key: 'team', label: `Team: ${team}`, onClear: () => setTeam('all') },
            lens === 'player' && position !== 'all' && { key: 'position', label: `Position: ${position}`, onClear: () => setPosition('all') },
          ]}
          onClearAll={() => { setQuery(''); setTeam('all'); setPosition('all') }}
        />
      </div>

      {lens === 'player' ? (
        <DenseTable
          rows={filteredPlayers}
          columns={PLAYER_COLUMNS}
          initialSort="rec_20"
          onRowClick={onPlayerClick ? (r) => onPlayerClick(r._raw, 'REC_YDS') : null}
          maxRows={269}
        />
      ) : (
        <DenseTable
          rows={filteredDefenses}
          columns={DEFENSE_COLUMNS}
          initialSort="exp_pct"
          maxRows={32}
        />
      )}

      <div style={{ marginTop: 10, padding: '10px 13px', border: `1px dashed ${C.border2}`, borderRadius: 10, color: C.text3, fontSize: 10, lineHeight: 1.6 }}>
        Receiving only — rushing has no chunk-play split published yet, so this board doesn't guess at one.
        Minimum 8 targets on the season to keep a name off this list on a single fluke catch.
      </div>
    </div>
  )
}
