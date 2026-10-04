'use client'

import PlayerFace from '../../PlayerFace'
import { useEffect, useLayoutEffect, useState } from 'react'
import { statLabel } from '../../../lib/nfl/statLabels'
import NflExplain from '../NflExplain'
import { C, NUM_FONT, MARKETS, gradeFor, TYPE } from '../../../lib/nfl/theme'
import { useNflWatchlist } from '../../../lib/nfl/watchlist'
import { oppLabel, oppShort, onBye, noData } from '../../../lib/nfl/oppLabel'
import { fetchNfl, nflRosterPaths } from '../../../lib/nfl/dataSource'
import { ActiveFilters, FilterSearch, FilterSelect } from '../../Filters'
import { usePreview, ShowMoreButton } from '../../ListPreview'
import GamelogFilterBar from '../GamelogFilterBar'
import { barRead, barSentence } from '../AgainstTheBar'
import SplitDumbbell from '../SplitDumbbell'
import ScoreAnatomy from '../ScoreAnatomy'
import MultiLine from '../../ledger/MultiLine'
import HisNumbers from '../../HisNumbers'
import { etToday } from '../../../lib/freshness'
import { statFmt } from '../../../lib/nfl/statLabels'
import { quoteFor, fmtOdds } from '../../../lib/nfl/oddsMatch'
import { nflReadBullets } from '../NflPlayerRead'

const MARKET_LOG = {
  TD: ['g_td', 'TD'], REC_YDS: ['g_recyd', 'REC YDS'], REC: ['g_rec', 'REC'],
  RUSH_YDS: ['g_ruyd', 'RUSH YDS'], RUSH_ATT: ['g_car', 'CARRIES'],
  PASS_YDS: ['g_payd', 'PASS YDS'], KICK_PTS: ['g_kick', 'KICK PTS'],
}

// The conditional-split filter (lib/gamelogFilter.js) offers every one of
// these columns as a "games where ___" slice -- MARKET_LOG's own fields
// (the exact ask from the spec: "games where this WR had 2+ receptions")
// plus the two situational cuts every published game row actually carries.
// Home/away isn't here -- see the NOTE in lib/gamelogFilter.js for why.
const GAMELOG_FILTER_FIELDS = [
  ...Object.entries(MARKET_LOG).map(([, [field, label]]) => ({ field, label, kind: 'number' })),
  { field: 'opp', label: 'Opponent', kind: 'enum' },
  { field: 's', label: 'Season', kind: 'enum' },
]

// STAT_LABELS moved to lib/nfl/statLabels.js on 2026-09-20. The private copy
// that lived here had drifted from the payload in both directions -- seven
// live keys with no label (20+, FGM, PAT, PATD, RYOE, SEP, YACOE) falling
// through to bare abbreviations on the page whose whole job is being the
// readable one, and two labels (FGATT, KICK) for keys the bot stopped
// publishing. One table now, shared with the player card, which was printing
// the raw keys because it never had access to this one.

const SPLIT_GROUPS = [
  ['home', 'away', 'Home / away'], ['indoors', 'outdoors', 'Indoor / outdoor'],
  ['grass', 'turf', 'Grass / turf'], ['leading', 'trailing', 'Leading / trailing'],
  ['h1', 'h2', 'First / second half'], ['rz', 'field', 'Red zone / field'],
]

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
// One formatter with the card (lib/nfl/statLabels.js statFmt): shares as %, whole numbers whole.
const nice = (value, key = '') => statFmt(key, value)

function setPlayerHash(playerId) {
  try {
    const hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
    hash.set('sport', 'nfl'); hash.set('tab', 'players'); hash.set('player', playerId)
    window.history.replaceState(null, '', `#${hash.toString()}`)
  } catch {}
}

function clearPlayerHash() {
  try {
    const hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
    hash.delete('player')
    window.history.replaceState(null, '', `#${hash.toString()}`)
  } catch {}
}

function currentPlayerHash() {
  try { return new URLSearchParams(String(window.location.hash || '').replace(/^#/, '')).get('player') }
  catch { return null }
}

function ScoreProfile({ player, market, setMarket }) {
  return <section className="portal-score-grid">{MARKETS.map(([key, label]) => {
    const score = player.scores?.[key]
    if (!Number.isFinite(score)) return null
    const grade = gradeFor(score)
    return <button key={key} onClick={() => setMarket(key)} className={market === key ? 'active' : ''} style={{ '--tone': grade.color }}><small>{label}</small><strong>{Math.round(score)}</strong><span>{grade.label}</span></button>
  })}</section>
}

function Trend({ rows, market, bar }) {
  // 2026-10-01 (0e a): the dot strip against the bar went ("I actually hate
  // these"); its sentence stays, over the same ten games. The games
  // themselves are the log rows right under it.
  const [field, label] = MARKET_LOG[market] || MARKET_LOG.TD
  return (
    <div className="portal-trend">
      <AgainstTheBarLine log={rows} statKey={field} bar={bar} label={label} />
    </div>
  )
}

function AgainstTheBarLine({ log, statKey, bar, label }) {
  const read = barRead(log, statKey, bar, 10)
  if (!read) return null
  return <p style={{ fontSize: 12, color: C.text2, lineHeight: 1.5, margin: '0 0 11px' }}>{barSentence(read, bar, label)}</p>
}

function RecentGames({ rows, market, bar, setMarket }) {
  const [field, label] = MARKET_LOG[market] || MARKET_LOG.TD
  const [showAll, setShowAll] = useState(false)
  const renderRow = (row) => {
    const value = number(row[field])
    return (
      <div className="portal-log-row" key={`${row.s}-${row.w}`}>
        <span>{row.s} · {row.w}</span>
        <b>{row.tm} vs {row.opp}</b>
        <strong style={{ color: value >= bar ? C.green : C.text }}>{nice(value)}</strong>
        <em style={{ color: value >= bar ? C.green : C.red }}>{value >= bar ? 'HIT' : 'MISS'}</em>
      </div>
    )
  }
  return (
    <section className="portal-card">
      <div className="portal-card-head">
        <div><small>RECENT FORM</small><h2>Game log</h2></div>
        <div className="portal-market-tabs">{MARKETS.map(([key]) => MARKET_LOG[key] && rows.some((row) => Number.isFinite(Number(row[MARKET_LOG[key][0]]))) && <button key={key} onClick={() => setMarket(key)} className={market === key ? 'active' : ''}>{MARKETS.find(([k]) => k === key)?.[1] || key}</button>)}</div>
      </div>
      <GamelogFilterBar rows={rows} fields={GAMELOG_FILTER_FIELDS}>
        {(sliced, filters) => {
          const active = filters.length > 0
          const ordered = active ? [...sliced].reverse() : rows.slice(-8).reverse()
          const shown = active && ordered.length > 5 ? (showAll ? ordered : ordered.slice(0, 5)) : ordered
          return (
            <>
              <Trend rows={active ? sliced : rows} market={market} bar={bar}/>
              <div className="portal-log-head"><span>WEEK</span><span>OPP</span><span>{label}</span><span>BAR</span></div>
              {shown.map(renderRow)}
              {!ordered.length && <p className="portal-empty">{active ? 'No published games clear this slice.' : 'No published game log for this player yet.'}</p>}
              {active && ordered.length > 5 && (
                <button className="portal-see-all" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show less' : `Show all ${ordered.length} matching games`}</button>
              )}
            </>
          )
        }}
      </GamelogFilterBar>
    </section>
  )
}

// The transpose of the card's SplitsForMarket -- see the long note in
// components/nfl/NflPlayerModal.js. This one fixes the SITUATION and varies
// the stat; that one fixes the stat and varies the situation. Neither is a
// copy of the other and deduplicating them would delete a view.
function SplitsForSituation({ player, group, setGroup }) {
  const [left, right, label] = SPLIT_GROUPS[group]
  const A = player.splits?.[left] || {}; const B = player.splits?.[right] || {}
  const keys = [...new Set([...Object.keys(A), ...Object.keys(B)])].filter((key) => key !== 'g').slice(0, 8)
  // 2026-09-13: the old row was two numbers and a proportion bar. The
  // proportion bar was the misleading part — it drew each side's SHARE of the
  // pair, so a 3.0/3.4 split and a 1/9 split both rendered as a two-tone bar
  // and only the digits told them apart. A dumbbell draws the actual gap.
  const rows = keys.map((key) => ({
    key,
    label: key.toUpperCase(),
    a: Number.isFinite(Number(A[key])) ? Number(A[key]) : null,
    b: Number.isFinite(Number(B[key])) ? Number(B[key]) : null,
    ga: A.g,
    gb: B.g,
  }))
  return <section className="portal-card"><div className="portal-card-head"><div><small>FILTER THE PLAYER</small><h2>Splits</h2></div><select value={group} onChange={(event) => setGroup(Number(event.target.value))}>{SPLIT_GROUPS.map((row, index) => <option value={index} key={row[2]}>{row[2]}</option>)}</select></div>{rows.length
    ? <SplitDumbbell rows={rows} leftLabel={`${left}${A.g ? ` · ${A.g}g` : ''}`} rightLabel={`${right}${B.g ? ` · ${B.g}g` : ''}`} note={`Per-game rates on the ${label.toLowerCase()} split, each stat on its own scale — the number on the right is the gap, and it lights past 15%.`} />
    : <p className="portal-empty">This split is not published for the selected player.</p>}</section>
}

function Storylines({ player, market, rows, matchup }) {
  // The sentences are components/nfl/NflPlayerRead.js's (2026-09-30): the card's Read and this desk say the same thing.
  const bullets = nflReadBullets(player, market, rows, matchup)
  const TONE = {
    for: { label: 'FOR', color: C.green },
    against: { label: 'AGAINST', color: C.red },
    note: { label: 'CONTEXT', color: C.text3 },
  }
  const query = encodeURIComponent(`${player.name} ${player.team} NFL`)
  return <section className="portal-card portal-story"><div className="portal-card-head"><div><small>STORYLINE DESK</small><h2>What the data says</h2></div></div>{bullets.map((b, index) => <article key={b.text}><span>0{index + 1}</span><p><em style={{ display: 'inline-block', marginRight: 7, padding: '1px 5px', borderRadius: 4, border: `1px solid ${TONE[b.tone].color}66`, color: TONE[b.tone].color, fontFamily: NUM_FONT, fontSize: TYPE.label, fontStyle: 'normal', fontWeight: 900, letterSpacing: '.1em', verticalAlign: '1px' }}>{TONE[b.tone].label}</em>{b.text}</p></article>)}<div className="portal-news"><small>LATEST COVERAGE · LINKS ONLY</small><a href={`https://news.google.com/search?q=${query}`} target="_blank" rel="noreferrer">Search recent headlines ↗</a></div></section>
}

function PlayerDirectory({ players, selected, choose, initialTeam = null, listOpen = false }) {
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState('all')
  // A team tapped on Standings opens the directory on that club (2026-09-26).
  // The team is in the address (team=, 2026-09-29 nav audit): a club tapped on
  // Standings / Games / Matchups / the Ledger opens here filtered, and refresh
  // or share keeps the filter.
  const [team, setTeamRaw] = useState(() => initialTeam || (typeof window === 'undefined' ? null : new URLSearchParams(String(window.location.hash || '').replace(/^#/, '')).get('team')) || 'all')
  const setTeam = (t) => {
    setTeamRaw(t)
    try {
      const h = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
      if (t && t !== 'all') h.set('team', t); else h.delete('team')
      window.history.replaceState(null, '', `#${h.toString()}`)
    } catch {}
  }
  useEffect(() => { if (initialTeam) setTeam(initialTeam) }, [initialTeam]) // eslint-disable-line react-hooks/exhaustive-deps
  const counts = (key) => players.reduce((out, player) => {
    const value = player[key]
    if (value) out[value] = (out[value] || 0) + 1
    return out
  }, {})
  const positionCounts = counts('position')
  const teamCounts = counts('team')
  const positions = [{ key: 'all', label: 'All positions', count: players.length }, ...Object.keys(positionCounts).sort().map((key) => ({ key, label: key, count: positionCounts[key] }))]
  const teams = [{ key: 'all', label: 'All teams', count: players.length }, ...Object.keys(teamCounts).sort().map((key) => ({ key, label: key, count: teamCounts[key] }))]
  const needle = query.trim().toLowerCase()
  const browsing = Boolean(needle) || position !== 'all' || team !== 'all'
  const rows = players.filter((player) => (
    (position === 'all' || player.position === position)
    && (team === 'all' || player.team === team)
    && (!needle || `${player.name} ${player.team} ${player.position}`.toLowerCase().includes(needle))
  // Rated players first, best score down, then the rest of the roster A-Z
  // (phone pass 2026-09-27): the list opened on an offensive lineman on the
  // practice squad, alphabetically first of 2,531.
  // Team defenses (DEF, the v1 Defense/ST TD market) rank on a 32-team scale,
  // not the league-wide player scale, so a D/ST 92 is not a player 92 -- six of
  // them led the list (2026-09-29). Tier first: rated players, then the D/ST
  // units by their own score, then the unrated roster.
  )).sort((a, b) => {
    const best = (p) => Math.max(-1, ...Object.values(p.scores || {}).filter(Number.isFinite))
    const tier = (p) => (best(p) < 0 ? 2 : p.position === 'DEF' ? 1 : 0)
    return tier(a) - tier(b) || best(b) - best(a) || a.name.localeCompare(b.name)
  })
  const preview = usePreview(rows, 25)
  return (
    <aside className="portal-directory">
      <div className="portal-dir-head"><small>PLAYER DIRECTORY</small><strong>{rows.length}</strong></div>
      <FilterSearch value={query} onChange={setQuery} placeholder="Search player or team…" width={220} />
      <div className="portal-dir-filters">
        <FilterSelect value={position} options={positions} onChange={setPosition} />
        <FilterSelect value={team} options={teams} onChange={setTeam} />
      </div>
      <div className="portal-dir-active">
        <ActiveFilters
          filters={[
            query && { key: 'query', label: query, onClear: () => setQuery('') },
            position !== 'all' && { key: 'position', label: position, onClear: () => setPosition('all') },
            team !== 'all' && { key: 'team', label: team, onClear: () => setTeam('all') },
          ]}
          onClearAll={() => { setQuery(''); setPosition('all'); setTeam('all') }}
        />
      </div>
      {/* ON A PHONE the list stays folded until you search or filter
          (phone pass 2026-09-27): 2,531 names sat above the player you
          opened. Desktop keeps its sticky list. */}
      {/* LIST FIRST ON A PHONE (2026-09-29, MOONSHOT's Players rule --
          components/tabs/PlayerBoard.js): with nobody picked the list is the
          page, top-down, previewing 25 with MOONSHOT's "Show N more". */}
      {!browsing && !listOpen && <div className="portal-dir-hint" style={{ display: 'none', padding: '0 12px 10px', fontSize: 11.5, color: C.text3 }}>Type a name or pick a team to switch player.</div>}
      <div className={`portal-dir-list${listOpen ? ' open' : browsing ? '' : ' idle'}`}>{(listOpen ? preview.shown : rows).map((player) => {
        const best = Math.max(...Object.values(player.scores || {}).filter(Number.isFinite), 0)
        return <button key={player.player_id} className={selected?.player_id === player.player_id ? 'active' : ''} onClick={() => choose(player)}><PlayerFace sport="nfl" espnId={player?.espn_id} team={player?.team} name={player?.name} size={28} /><div><b>{player.name}</b><small>{player.position} · {player.roster_only ? player.roster_status : oppLabel(player)}</small></div><strong>{onBye(player) ? 'BYE' : noData(player) ? '—' : Math.round(best)}</strong></button>
      })}</div>
      {listOpen && <div style={{ padding: '0 10px 10px' }}><ShowMoreButton open={preview.open} restN={preview.restN} toggle={preview.toggle} itemWord="players" /></div>}
    </aside>
  )
}

// EVERY ROSTER (2026-09-24, Donovan: "I should be able to search every
// active player"). The week file is the ~560 men the model rated. Everyone
// else on a 53-man, IR or practice squad comes from nfl_roster.json
// (bots/nfl/nfl_roster.py) and joins the directory with no scores -- the
// card opens on his name, team, status and whatever game log nfl_logs.json
// has for him, and says plainly that he was not rated this week.
const ROSTER_STATUS = { ACT: 'active, not in this week\u2019s pool', RES: 'IR / reserve', DEV: 'practice squad', PUP: 'PUP', SUS: 'suspended' }
export function useRosterExtras(players) {
  const [roster, setRoster] = useState(null)
  useEffect(() => {
    let alive = true
    fetchNfl(nflRosterPaths()).then((d) => { if (alive && Array.isArray(d?.players)) setRoster(d.players) }).catch(() => {})
    return () => { alive = false }
  }, [])
  if (!roster) return []
  const have = new Set(players.map((p) => String(p.player_id)))
  return roster
    .filter((r) => r.gsis_id && !have.has(String(r.gsis_id)))
    .map((r) => ({
      player_id: r.gsis_id, name: r.name, team: r.team, position: r.position,
      roster_only: true, roster_status: ROSTER_STATUS[r.status] || r.status_word || r.status || '',
      headshot: r.headshot || null, jersey: r.jersey ?? null,
      scores: {}, stats: {}, components: {},
    }))
}

export default function StatPortal({ data, logs, matchup, initialTeam = null, odds = null }) {
  const watchlist = useNflWatchlist(data)
  const rated = data?.players || []
  const extras = useRosterExtras(rated)
  const players = extras.length ? [...rated, ...extras] : rated
  const [selectedId, setSelectedId] = useState(() => currentPlayerHash())
  const [market, setMarket] = useState('TD')
  const [splitGroup, setSplitGroup] = useState(0)
  // MOONSHOT's Players rule (components/tabs/PlayerBoard.js): on a phone
  // "what has been tapped" and "what to show" are two questions -- nothing is
  // picked until you tap, so the page opens on the list; the desktop two-column
  // layout keeps opening on the top player so its right pane is never empty.
  // 900px = where this page's own CSS stacks to one column.
  // null until measured: the auto-pick below must not fire on a phone before
  // it knows it is one (useIsPhone starts false, which picked the top player
  // on every phone). Measured in a layout effect, so neither layout flashes.
  const [phone, setPhone] = useState(null)
  useLayoutEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)')
    const sync = () => setPhone(mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])
  const picked = players.find((player) => String(player.player_id) === String(selectedId)) || null
  const selected = phone === false ? (picked || players[0]) : picked
  const spec = (data?.markets || []).find((item) => item.key === market)
  const rows = logs?.logs?.[String(selected?.player_id)]?.log || []

  useEffect(() => {
    if (phone === false && !selectedId && players[0]) { setSelectedId(String(players[0].player_id)); setPlayerHash(String(players[0].player_id)) }
  }, [players, selectedId, phone])
  const backToList = () => { setSelectedId(null); clearPlayerHash(); window.scrollTo({ top: 0 }) }

  const choose = (player) => { setSelectedId(String(player.player_id)); setPlayerHash(String(player.player_id)); const first = MARKETS.find(([key]) => Number.isFinite(player.scores?.[key])); if (first) setMarket(first[0]); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  if (!players.length) return <div className="portal-empty">The player directory publishes with the NFL slate.</div>
  // A player link that matches nobody used to open players[0] as if he were
  // the one linked (audit 00A fix 5). Now the page says so, and says whose
  // file is showing instead.
  const missing = selectedId && players.length && !players.some((player) => String(player.player_id) === String(selectedId))
  const notice = missing ? (
    <div role="status" style={{ margin: '0 0 10px', padding: '10px 12px', border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.yellow}`, borderRadius: 10, background: C.bg2, fontSize: 12, color: C.text2, lineHeight: 1.5 }}>
      <b style={{ color: C.text, letterSpacing: '.06em', fontSize: 10 }}>NO SUCH PLAYER</b> -- <b style={{ color: C.text, fontFamily: NUM_FONT }}>{String(selectedId).slice(0, 24)}</b> isn&apos;t in this week&apos;s file. {selected ? <>Showing {selected.name} instead; pick anyone from the list.</> : 'Pick anyone from the list.'}
    </div>
  ) : null
  if (!selected) return <>{notice}<div className="stat-portal"><PlayerDirectory players={players} selected={null} choose={choose} initialTeam={initialTeam} listOpen /><style>{portalCss()}</style></div></>
  const grade = gradeFor(selected.scores?.[market])

  return <>{notice}<div className="stat-portal"><PlayerDirectory players={players} selected={selected} choose={choose} initialTeam={initialTeam}/><main className="portal-profile">{phone === true && <button type="button" onClick={backToList} className="tap-row" style={{ display: 'flex', alignItems: 'center', gap: 7, border: `1px solid ${C.border2}`, background: 'rgba(255,255,255,.04)', color: C.text2, borderRadius: 9, padding: '7px 12px', fontSize: TYPE.body, fontWeight: 700, cursor: 'pointer', width: '100%', minHeight: 44 }}>← <span>All players</span><span style={{ marginLeft: 'auto', fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{players.length} in the list</span></button>}<section className="portal-hero"><div className="portal-monogram">{/* the face (BATCH-FACES step 8); NflFace keeps the club tile when there is no photo */}<PlayerFace sport="nfl" espnId={selected?.espn_id} team={selected?.team} name={selected?.name} size={50} /></div><div className="portal-identity"><small>TUDDY PLAYER FILE</small><h1>{selected.name}</h1><p>{selected.position} · {selected.team} {oppLabel(selected)}{selected.questionable ? ' · QUESTIONABLE' : ''}</p><MultiLine sport="nfl" playerId={selected.player_id} words={{ TD: 'multi-TD', PASS_TD: '2+ passing-TD' }} color={C.green} textColor={C.text2} /><button onClick={() => watchlist.toggle(selected)} className={watchlist.isPinned(selected.player_id) ? 'saved' : ''}>{watchlist.isPinned(selected.player_id) ? '★ SAVED TO WATCHLIST' : '☆ SAVE TO WATCHLIST'}</button></div><div className="portal-primary"><small>{spec?.label || market}</small><strong style={{ color: grade.color }}>{Number.isFinite(selected.scores?.[market]) ? Math.round(selected.scores[market]) : '—'}</strong><span style={{ color: grade.color }}>{grade.label}</span></div></section><section className="portal-measurables">{/* #20: this row used to open with NUMBER "— not in current feed" and 40-YARD DASH "— combine feed pending" -- half the header blank on every player, forever, because neither field is published by nflverse in what this app fetches. A tile whose value is permanently a dash is furniture. Replaced with two facts the row already has in hand. */}<div><small>OPPONENT</small><b>{oppShort(selected)}</b><span>{onBye(selected) ? `${selected.team} is on bye this week` : selected.team ? `${selected.team} this week` : 'team pending'}</span></div>{(() => { const q = quoteFor(odds, selected, market); return <div><small>PRICE · {(MARKETS.find(([k]) => k === market)?.[1] || market).toUpperCase()}</small><b>{q ? fmtOdds(q.over) : '—'}</b><span>{q ? `o${q.line} · needs ${q.implied}%${q.best_over != null && q.best_over !== q.over ? ` · best ${fmtOdds(q.best_over)} ${q.best_book || ''}` : ''}` : 'no book line read yet'}</span></div> })()}<div><small>STATUS</small><b>{selected.questionable ? 'Q' : 'ACTIVE'}</b><span>{selected.roster_only ? selected.roster_status : noData(selected) ? 'no NFL history yet' : selected.low_sample ? 'low sample' : 'full scored row'}</span></div><div><small>DATA MODE</small><b>{selected.carryover ? 'CARRYOVER' : <><span className="tuddy-live-dot-sm" aria-hidden="true" />{data?.mode?.toUpperCase() || 'LIVE'}</>}</b><span>{selected.carryover ? `${data?.stat_season || ''} baseline (carryover)` : `${data?.season || ''} season, weeks so far`}</span></div></section><ScoreProfile player={selected} market={market} setMarket={setMarket}/><div className="portal-columns"><section className="portal-card"><div className="portal-card-head"><div><small>SEASON PROFILE</small><h2>Usage and production</h2></div></div><div className="portal-stat-grid">{Object.entries(selected.stats || {}).filter(([, value]) => Number.isFinite(Number(value))).map(([key, value]) => <div key={key}><small><NflExplain label={statLabel(key)} term={key} /></small><b>{nice(value, key)}</b></div>)}</div>{Object.keys(selected.components?.[market] || {}).length > 0 && <div style={{ marginTop: 15, paddingTop: 13, borderTop: `1px solid ${C.border}` }}><ScoreAnatomy player={selected} market={market} weights={spec?.weights} pool={players} marketLabel={spec?.label || market} /></div>}</section><Storylines player={selected} market={market} rows={rows} matchup={matchup}/></div><div className="portal-columns"><SplitsForSituation player={selected} group={splitGroup} setGroup={setSplitGroup}/>{/* the published bar, never an invented 1 (2026-09-29): the week's, else nfl_logs.json's own */}{Number.isFinite(Number(spec?.bar ?? logs?.bars?.[market]?.[1])) && <RecentGames rows={rows} market={market} bar={Number(spec?.bar ?? logs?.bars?.[market]?.[1])} setMarket={setMarket}/>}</div>{/* 🔢 His numbers (numerology step 7), last; a team defense is not a name */}{selected.position !== 'DEF' && <HisNumbers name={selected.name} jersey={selected.jersey_number} birthDate={selected.birth_date} next={Number.isFinite(selected.season_td) ? selected.season_td + 1 : null} nextWord="TD" date={etToday()} theme={C} accent={C.green} numFont={NUM_FONT} />}</main><style>{portalCss()}</style></div></>
}

// The page's stylesheet, shared by the full view and the phone's list-only view
// (2026-09-29: the list view rendered unstyled when this lived in one return).
function portalCss() {
  return `
    .stat-portal{display:grid;grid-template-columns:265px minmax(0,1fr);gap:12px;align-items:start}.portal-directory{position:sticky;top:146px;overflow:hidden;max-height:calc(100vh - 166px);border:1px solid ${C.border};border-radius:13px;background:${C.bg2}}.portal-dir-head{display:flex;align-items:center;justify-content:space-between;padding:13px 14px 9px}.portal-dir-head small{color:${C.green};font:900 8px/1 ${NUM_FONT};letter-spacing:.1em}.portal-dir-head strong{color:${C.text3};font:900 11px/1 ${NUM_FONT}}.portal-directory>input{width:calc(100% - 20px)!important;height:36px;margin:0 10px 7px;padding:0 10px;border-radius:8px}.portal-dir-filters{display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:0 10px 7px}.portal-dir-filters>span{min-width:0}.portal-dir-filters select{width:100%;height:31px;padding:0 5px;font-size:9px}.portal-dir-active{padding:0 10px 8px}.portal-card-head select{height:31px;padding:0 7px;border:1px solid ${C.border};border-radius:7px;background:${C.bg2};color:${C.text2};font-size:9px}.portal-dir-list{overflow-y:auto;max-height:calc(100vh - 300px)}.portal-dir-list>button{display:grid;grid-template-columns:31px 1fr 32px;align-items:center;gap:7px;width:100%;min-height:50px;padding:7px 10px;border:0;border-top:1px solid ${C.border};background:transparent;color:inherit;text-align:left;cursor:pointer}.portal-dir-list>button.active{background:rgba(0,245,173,.09);box-shadow:inset 2px 0 ${C.green}}.portal-dir-list>button>span{color:${C.green};font:900 8px/1 ${NUM_FONT}}.portal-dir-list b{display:block;font-size:10px}.portal-dir-list small{display:block;margin-top:3px;color:${C.text3};font-size:8px}.portal-dir-list>button>strong{color:${C.cyan};font:900 11px/1 ${NUM_FONT};text-align:right}.portal-profile{display:flex;flex-direction:column;gap:10px}.portal-hero{display:grid;grid-template-columns:68px 1fr auto;align-items:center;gap:15px;min-height:150px;padding:22px;border:1px solid rgba(0,245,173,.28);border-radius:16px;background:radial-gradient(circle at 90% 10%,rgba(53,205,255,.14),transparent 34%),radial-gradient(circle at 8% 100%,rgba(0,245,173,.13),transparent 40%),${C.bg2}}.portal-monogram{display:grid;place-items:center;width:66px;height:66px;border:1px solid rgba(53,205,255,.35);border-radius:18px;background:linear-gradient(145deg,rgba(0,245,173,.2),rgba(53,205,255,.08));color:${C.cyan};font:900 22px/1 ${NUM_FONT}}.portal-identity small,.portal-card-head small,.portal-primary small{color:${C.green};font:900 8px/1 ${NUM_FONT};letter-spacing:.1em}.portal-identity h1{margin:6px 0 3px;font-size:clamp(28px,5vw,48px);letter-spacing:-.05em}.portal-identity p{margin:0;color:${C.text3};font:800 9px/1 ${NUM_FONT}}.portal-identity>button{margin-top:10px;padding:6px 8px;border:1px solid ${C.border};border-radius:7px;background:transparent;color:${C.text3};font:900 8px/1 ${NUM_FONT};cursor:pointer}.portal-identity>button.saved{border-color:${C.yellow}66;background:${C.yellow}20;color:${C.yellow}}.portal-primary{text-align:center;min-width:78px}.portal-primary strong{display:block;margin-top:5px;font:900 38px/1 ${NUM_FONT}}.portal-primary span{font:900 9px/1 ${NUM_FONT}}.portal-measurables,.portal-score-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.portal-measurables>div,.portal-score-grid>button{display:flex;flex-direction:column;align-items:flex-start;min-height:73px;padding:11px;border:1px solid ${C.border};border-radius:10px;background:${C.bg2};color:inherit;text-align:left}.portal-measurables small,.portal-score-grid small{color:${C.text3};font:900 8px/1 ${NUM_FONT}}.portal-measurables b{margin-top:8px;font:900 13px/1 ${NUM_FONT}}.portal-measurables span{margin-top:5px;color:${C.text3};font-size:8px}.portal-score-grid{grid-template-columns:repeat(7,1fr)}.portal-score-grid>button{position:relative;min-height:78px;cursor:pointer}.portal-score-grid>button.active{border-color:color-mix(in srgb,var(--tone) 65%,transparent);background:color-mix(in srgb,var(--tone) 8%,${C.bg2})}.portal-score-grid strong{margin-top:8px;color:var(--tone);font:900 20px/1 ${NUM_FONT}}.portal-score-grid span{position:absolute;right:9px;bottom:9px;color:var(--tone);font:900 8px/1 ${NUM_FONT}}.portal-columns{display:grid;grid-template-columns:1fr 1fr;gap:10px}.portal-card{padding:15px;border:1px solid ${C.border};border-radius:13px;background:${C.bg2}}.portal-card-head{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin-bottom:12px}.portal-card-head h2{margin:5px 0 0;font-size:17px}.portal-stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.portal-stat-grid>div{min-height:62px;padding:10px;border:1px solid ${C.border};border-radius:8px;background:rgba(255,255,255,.025)}.portal-stat-grid small{display:block;color:${C.text3};font-size:8px;line-height:1.2}.portal-stat-grid b{display:block;margin-top:8px;font:900 13px/1 ${NUM_FONT}}.portal-story article{display:flex;gap:9px;padding:7px 0;border-bottom:1px solid ${C.border}}.portal-story article span{color:${C.green};font:900 8px/1.5 ${NUM_FONT}}.portal-story article p{margin:0;color:${C.text2};font-size:10px;line-height:1.5}.portal-news{display:flex;flex-direction:column;gap:6px;margin-top:12px;padding-top:10px;border-top:1px solid ${C.border}}.portal-news small{color:${C.text3};font:900 8px/1 ${NUM_FONT}}.portal-news a{color:${C.cyan};font-size:9px;text-decoration:none}.portal-split-labels,.portal-split-row{display:grid;grid-template-columns:1fr 1.3fr 1fr;align-items:center;gap:8px;text-align:center}.portal-split-labels{margin-bottom:4px;color:${C.text3};font-size:8px;text-transform:uppercase}.portal-split-labels span{font-size:7px}.portal-split-row{padding:7px 0;border-top:1px solid ${C.border};position:relative}.portal-split-bar{grid-column:1/-1;display:flex;height:4px;margin-top:6px;border-radius:99px;overflow:hidden;background:rgba(255,255,255,.05)}.portal-split-bar i:first-child{background:${C.cyan};opacity:.75}.portal-split-bar i:last-child{background:${C.green};opacity:.75}.portal-split-row>strong{font:900 12px/1 ${NUM_FONT}}.portal-split-row>strong small{display:block;margin-top:4px;color:${C.text3};font-size:7px}.portal-split-row>span{color:${C.text3};font:800 8px/1 ${NUM_FONT}}.portal-market-tabs{display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end}.portal-market-tabs button{padding:6px 7px;border:1px solid ${C.border};border-radius:5px;background:transparent;color:${C.text3};font:800 7px/1 ${NUM_FONT};cursor:pointer}.portal-market-tabs button.active{border-color:${C.green};color:${C.green}}.portal-trend-bars{display:flex;align-items:flex-end;gap:4px;height:86px;padding:8px 5px 0;border:1px solid ${C.border};border-radius:8px;background:rgba(255,255,255,.02)}.portal-trend-bars>div{display:flex;flex:1;height:100%;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px}.portal-trend-bars i{display:block;width:70%;min-height:3px;border-radius:3px 3px 0 0}.portal-trend-bars span{color:${C.text3};font:700 7px/1 ${NUM_FONT}}.portal-trend p{margin:5px 0 11px;color:${C.text3};font-size:8px}.portal-log-head,.portal-log-row{display:grid;grid-template-columns:72px 1fr 55px 42px;align-items:center;gap:6px}.portal-log-head{padding:5px 3px;color:${C.text3};font:800 7px/1 ${NUM_FONT}}.portal-log-row{padding:7px 3px;border-top:1px solid ${C.border}}.portal-log-row span,.portal-log-row strong,.portal-log-row em{font:800 8px/1 ${NUM_FONT};font-style:normal}.portal-log-row span{color:${C.text3}}.portal-log-row b{font-size:9px}.portal-log-row strong{text-align:right}.portal-log-row em{text-align:right}.portal-empty{padding:20px;color:${C.text3};font-size:10px;text-align:center}.portal-see-all{display:block;width:100%;margin-top:8px;padding:8px;border:1px dashed ${C.border};border-radius:8px;background:transparent;color:${C.cyan};font:800 9px/1 ${NUM_FONT};cursor:pointer;text-align:center}
    .portal-monogram{position:relative}.portal-monogram::after{content:'';position:absolute;inset:-7px;border-radius:20px;border:1.5px solid rgba(53,205,255,.55);opacity:0;pointer-events:none;animation:tuddyPulseRing 2.8s ease-out infinite}@keyframes tuddyPulseRing{0%{transform:scale(.85);opacity:.6}100%{transform:scale(1.18);opacity:0}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}.tuddy-live-dot-sm{display:inline-block;width:5px;height:5px;margin-right:5px;border-radius:50%;background:${C.cyan};box-shadow:0 0 6px ${C.cyan};vertical-align:middle;animation:pulse 2s infinite}@media(prefers-reduced-motion:reduce){.portal-monogram::after{display:none}.tuddy-live-dot-sm{animation:none}}
    @media(max-width:900px){.stat-portal{grid-template-columns:1fr}.portal-dir-list.idle{display:none}.portal-dir-hint{display:block!important}.portal-directory{position:static;max-height:none}.portal-dir-list{display:flex;overflow-x:auto;max-height:none}.portal-dir-list>button{flex:0 0 190px;border-left:1px solid ${C.border}}.portal-dir-list.open{display:block}.portal-dir-list.open>button{border-left:0}.portal-columns{grid-template-columns:1fr}.portal-score-grid{grid-template-columns:repeat(4,1fr)}}
    @media(max-width:560px){.portal-hero{grid-template-columns:54px 1fr}.portal-monogram{width:52px;height:52px}.portal-primary{grid-column:1/-1;display:flex;align-items:center;gap:8px;text-align:left}.portal-primary strong{font-size:25px;margin:0}.portal-measurables{grid-template-columns:1fr 1fr}.portal-score-grid{grid-template-columns:1fr 1fr}.portal-stat-grid{grid-template-columns:1fr 1fr}.portal-log-head,.portal-log-row{grid-template-columns:60px 1fr 44px 36px}}
  `
}
