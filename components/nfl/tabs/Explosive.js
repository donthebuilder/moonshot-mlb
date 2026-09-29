'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../../lib/nfl/theme'
import NflTable from '../NflTable'
import PageHeader from '../../PageHeader'
import { ActiveFilters, FilterBar, FilterSearch, FilterSelect } from '../../Filters'
import { useNflWatchlist } from '../../../lib/nfl/watchlist'
import NflFace from '../NflFace'
import { Para, Num, ConvictionClause, PowerLead, LensRow } from '../../power/PowerParts'
import { convictionOf, percentileOf, standingPhrase } from '../../../lib/whyPick'
import { btnStyle } from '../../ui'

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

// The lead needs a real sample: a man with 3 targets and one long catch is a
// fluke, not a read.
const LEAD_MIN_TGT = 15
const LENSES = [
  { k: 'player', label: 'Players', tag: 'who turns a target into a chunk play', color: C.green },
  { k: 'defense', label: 'Defense allowed', tag: 'which defense gives up the chunk play', color: C.cyan },
]

const BUCKET_COLS = [
  { key: 'rec_10', label: '10+', w: 34, dp: 0, title: '10+ yard receptions' },
  { key: 'rec_20', label: '20+', w: 34, dp: 0, title: '20+ yard receptions' },
  { key: 'rec_30', label: '30+', w: 34, dp: 0, title: '30+ yard receptions' },
  { key: 'rec_40', label: '40+', w: 34, dp: 0, title: '40+ yard receptions' },
]

const buildPlayerColumns = (watchlist) => [
  { key: 'watched', label: '☆', action: true, w: 28, mark: '★', markOff: '☆',
    titleOn: 'Remove from watchlist', titleOff: 'Add to watchlist',
    onAction: (row) => watchlist.toggle(row) },
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

// ── BIG PLAY WATCH (2026-09-27, TUDDY depth step 7) ──────────────────────
// Separation: the average yards between a receiver and the nearest defender
// when the ball arrives, from nflverse's NGS receiving table -- published on
// the player row as stats.SEP (87 qualified receivers). Open men are where
// chunk plays start; this ranks this week's receivers (not on bye) by it and
// prints the number. Nothing is estimated; a man NGS doesn't qualify has no
// SEP and simply isn't listed.
function BigPlayWatch({ data, onPlayerClick }) {
  const rows = useMemo(() => (data?.players || [])
    .filter((p) => !p.on_bye && ['WR', 'TE', 'RB'].includes(p.position) && Number.isFinite(Number(p.stats?.SEP)) && p.stats.SEP !== null)
    .sort((a, b) => Number(b.stats.SEP) - Number(a.stats.SEP))
    .slice(0, 5), [data])
  if (!rows.length) return null
  return (
    <section aria-label="Big play watch" style={{ margin: '0 0 12px', padding: '11px 12px', border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.1em', color: C.green, fontFamily: NUM_FONT }}>BIG PLAY WATCH</span>
        <span style={{ fontSize: 12, color: C.text3 }}>most separation at the catch point, yards (NGS)</span>
      </div>
      {rows.map((p, i) => (
        <button key={p.player_id} type="button" onClick={() => onPlayerClick?.(p, 'REC_YDS')}
          style={{ display: 'grid', gridTemplateColumns: '18px auto 1fr auto', alignItems: 'center', gap: 8, width: '100%', minHeight: 44, padding: '4px 2px', border: 0, borderTop: i ? `1px solid ${C.border}` : 0, background: 'transparent', color: C.text, textAlign: 'left', cursor: 'pointer' }}>
          <span style={{ fontFamily: NUM_FONT, fontSize: 11, color: C.text3 }}>{i + 1}</span>
          <NflFace player={p} size={28} />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
            <span style={{ display: 'block', fontSize: 11, color: C.text3, fontFamily: NUM_FONT }}>{p.position} · {p.team}{p.opp ? ` vs ${p.opp}` : ''}</span>
          </span>
          <span style={{ fontFamily: NUM_FONT, fontSize: 15, fontWeight: 900, color: C.green }}>{Number(p.stats.SEP).toFixed(1)}</span>
        </button>
      ))}
    </section>
  )
}

export default function Explosive({ matchup, data, onPlayerClick }) {
  const watchlist = useNflWatchlist(data)
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
        watched: watchlist.isPinned(pid) ? 1 : 0,
        _raw: p,
      }
    }).filter(Boolean)
  }, [matchup, rosterById, watchlist])

  const lead = useMemo(() => {
    const pool = playerRows.filter((r) => Number(r.tgts) >= LEAD_MIN_TGT)
    if (pool.length < 8) return null
    const rateOf = (r) => (100 * (Number(r.rec_20) || 0)) / Number(r.tgts)
    const row = [...pool].sort((a, b) => rateOf(b) - rateOf(a))[0]
    if (!(Number(row?.rec_20) > 0)) return null
    return { row, rate: rateOf(row), conv: convictionOf(row, pool, rateOf), pct: percentileOf(rateOf(row), pool.map(rateOf)) }
  }, [playerRows])

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
      <div style={{ padding: 26, border: `1px dashed ${C.border2}`, borderRadius: 12, textAlign: 'center', color: C.text3, fontSize: TYPE.body }}>
        Waiting on the bot's next matchup publish — explosive-play data ships with nfl_matchup.json.
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="TUDDY · EXPLOSIVE"
        title={lens === 'player' ? 'Who turns a target into a chunk play' : 'Who gives up the chunk play'}
        note={<>Every 10/20/30/40-yard reception, real, off {matchup?.season || 'the'} play-by-play{' — '}{lens === 'player' ? 'a receiver’s own ceiling, not his average game.' : 'which defense turns a normal target into a big one.'}</>}
        theme={C}
        numFont={NUM_FONT}
        accent={lens === 'player' ? C.green : C.cyan}
      />
      {/* MOONSHOT'S POWER FRAME (2026-09-29, Donovan: "did we ever do the
          player powers for all the sports?"): one lead -- the receiver who
          turns targets into chunk plays most, argued with his own numbers and
          how far clear of the field he stands -- then one board behind a
          lens row (components/power/PowerParts.js, MOONSHOT's Power look). */}
      {lead && (
        <PowerLead theme={C} numFont={NUM_FONT} color={C.green} kicker="The chunk-play read of the week"
          name={lead.row.name} meta={`${lead.row.team}${lead.row.opp ? ` vs ${lead.row.opp}` : ''} · ${lead.row.position}`}
          onName={onPlayerClick ? () => onPlayerClick(lead.row._raw, 'REC_YDS') : undefined}>
          <Para theme={C}>
            Nobody on the slate turns a target into a chunk play like him:{' '}
            <Num theme={C} numFont={NUM_FONT} color={C.green}>{lead.row.rec_20}</Num> catches of 20+ yards on{' '}
            <Num theme={C} numFont={NUM_FONT}>{lead.row.tgts}</Num> targets,{' '}
            <Num theme={C} numFont={NUM_FONT} color={C.green}>{lead.rate.toFixed(0)}%</Num>
            {lead.pct != null && <> — <b style={{ color: C.text2 }}>{standingPhrase(lead.pct).replace('of the slate', `of receivers with ${LEAD_MIN_TGT}+ targets`)}</b></>}
            <ConvictionClause theme={C} numFont={NUM_FONT} conv={lead.conv} field={`receivers with ${LEAD_MIN_TGT}+ targets`} unit="percentage points" />.
            {lead.row.lng > 0 && <> His longest catch is <Num theme={C} numFont={NUM_FONT}>{lead.row.lng}</Num> yards{lead.row.lng_td > 0 ? <>, his longest touchdown <Num theme={C} numFont={NUM_FONT}>{lead.row.lng_td}</Num></> : null}.</>}
          </Para>
          <Para theme={C} dim>A rate of big plays already made, from {matchup?.season || 'this season'}&apos;s play-by-play -- not a chance of one this week.</Para>
        </PowerLead>
      )}
      <LensRow theme={C} lenses={LENSES} value={lens} onChange={setLens}
        btn={(color, on) => ({ ...btnStyle(color, on), border: `1px solid ${on ? `${color}99` : C.border}`, color: on ? color : C.text2 })} />

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 11,
        padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 12,
        background: C.bg2,
      }}>
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
        <NflTable
          rows={filteredPlayers}
          columns={buildPlayerColumns(watchlist)}
          initialSort="rec_20"
          onRowClick={onPlayerClick ? (r) => onPlayerClick(r?._raw ?? r, 'REC_YDS') : null}
          maxRows={269}
        />
      ) : (
        <NflTable
          rows={filteredDefenses}
          columns={DEFENSE_COLUMNS}
          initialSort="exp_pct"
          maxRows={32}
        />
      )}

      {lens === 'player' && <div style={{ marginTop: 12 }}><BigPlayWatch data={data} onPlayerClick={onPlayerClick} /></div>}

      <div style={{ marginTop: 10, padding: '10px 13px', border: `1px dashed ${C.border2}`, borderRadius: 10, color: C.text3, fontSize: TYPE.micro, lineHeight: 1.6 }}>
        Receiving only — rushing has no chunk-play split published yet, so this board doesn't guess at one.
        Minimum 8 targets on the season to keep a name off this list on a single fluke catch.
      </div>
    </div>
  )
}
