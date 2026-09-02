'use client'

import { useEffect, useState } from 'react'
import { C, NUM_FONT, MARKETS, gradeFor } from '../../../lib/nfl/theme'
import { useNflWatchlist } from '../../../lib/nfl/watchlist'
import { ActiveFilters, FilterSearch, FilterSelect } from '../../Filters'

const MARKET_LOG = {
  TD: ['g_td', 'TD'], REC_YDS: ['g_recyd', 'REC YDS'], REC: ['g_rec', 'REC'],
  RUSH_YDS: ['g_ruyd', 'RUSH YDS'], RUSH_ATT: ['g_car', 'CARRIES'],
  PASS_YDS: ['g_payd', 'PASS YDS'], KICK_PTS: ['g_kick', 'KICK PTS'],
}

const STAT_LABELS = {
  'TGT%': 'Target share', WOPR: 'WOPR', TGT: 'Targets / game', REC: 'Receptions / game',
  RECYD: 'Receiving yds / game', AIRYD: 'Air yds / game', CAR: 'Carries / game',
  RUYD: 'Rushing yds / game', RZ: 'Red-zone opp / game', GL: 'Goal-line opp / game',
  xTD: 'Expected TD / game', TD: 'TD / game', TDoE: 'TD over expected',
  PAYD: 'Passing yds / game', ATT: 'Attempts / game', CPOE: 'Completion % over expected',
  FGATT: 'FG attempts / game', KICK: 'Kicker points / game',
}

const SPLIT_GROUPS = [
  ['home', 'away', 'Home / away'], ['indoors', 'outdoors', 'Indoor / outdoor'],
  ['grass', 'turf', 'Grass / turf'], ['leading', 'trailing', 'Leading / trailing'],
  ['h1', 'h2', 'First / second half'], ['rz', 'field', 'Red zone / field'],
]

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const nice = (value) => Number.isFinite(Number(value)) ? (Math.abs(Number(value)) < 1 ? Number(value).toFixed(3) : Number(value).toFixed(1)) : '—'

function setPlayerHash(playerId) {
  try {
    const hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
    hash.set('sport', 'nfl'); hash.set('tab', 'players'); hash.set('player', playerId)
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
  const [field, label] = MARKET_LOG[market] || MARKET_LOG.TD
  const points = rows.slice(-10)
  const max = Math.max(bar || 1, ...points.map((row) => number(row[field])), 1)
  return <div className="portal-trend"><div className="portal-trend-bars">{points.map((row) => {
    const value = number(row[field]); const hit = value >= bar
    return <div key={`${row.s}-${row.w}`} title={`${row.s} W${row.w} vs ${row.opp}: ${value}`}><i style={{ height: `${Math.max(4, value / max * 100)}%`, background: hit ? C.green : C.text3 }}/><span>W{row.w}</span></div>
  })}</div><p>{label} · last {points.length} published games · green cleared {bar}</p></div>
}

function RecentGames({ rows, market, bar, setMarket }) {
  const [field, label] = MARKET_LOG[market] || MARKET_LOG.TD
  const recent = rows.slice(-8).reverse()
  return <section className="portal-card"><div className="portal-card-head"><div><small>RECENT FORM</small><h2>Game log</h2></div><div className="portal-market-tabs">{MARKETS.map(([key]) => rows.some((row) => Number.isFinite(Number(row[MARKET_LOG[key][0]]))) && <button key={key} onClick={() => setMarket(key)} className={market === key ? 'active' : ''}>{key}</button>)}</div></div><Trend rows={rows} market={market} bar={bar}/><div className="portal-log-head"><span>WEEK</span><span>OPP</span><span>{label}</span><span>BAR</span></div>{recent.map((row) => { const value = number(row[field]); return <div className="portal-log-row" key={`${row.s}-${row.w}`}><span>{row.s} · {row.w}</span><b>{row.tm} vs {row.opp}</b><strong style={{ color: value >= bar ? C.green : C.text }}>{nice(value)}</strong><em style={{ color: value >= bar ? C.green : C.red }}>{value >= bar ? 'HIT' : 'MISS'}</em></div>})}{!recent.length && <p className="portal-empty">No published game log for this player yet.</p>}</section>
}

function Splits({ player, group, setGroup }) {
  const [left, right, label] = SPLIT_GROUPS[group]
  const A = player.splits?.[left] || {}; const B = player.splits?.[right] || {}
  const keys = [...new Set([...Object.keys(A), ...Object.keys(B)])].filter((key) => key !== 'g').slice(0, 8)
  return <section className="portal-card"><div className="portal-card-head"><div><small>FILTER THE PLAYER</small><h2>Splits</h2></div><select value={group} onChange={(event) => setGroup(Number(event.target.value))}>{SPLIT_GROUPS.map((row, index) => <option value={index} key={row[2]}>{row[2]}</option>)}</select></div><div className="portal-split-labels"><b>{left}</b><span>per-game rates · sample beside each side</span><b>{right}</b></div>{keys.map((key) => <div className="portal-split-row" key={key}><strong>{nice(A[key])}<small>{A.g ? `${A.g}g` : ''}</small></strong><span>{key.toUpperCase()}</span><strong>{nice(B[key])}<small>{B.g ? `${B.g}g` : ''}</small></strong></div>)}{!keys.length && <p className="portal-empty">This split is not published for the selected player.</p>}</section>
}

function Storylines({ player, market, rows, matchup }) {
  const scored = Object.entries(player.scores || {}).filter(([, value]) => Number.isFinite(value)).sort((a, b) => b[1] - a[1])
  const [bestMarket, bestScore] = scored[0] || []
  const lastFive = rows.slice(-5)
  const role = matchup?.dvp_roles?.[player.player_id] || matchup?.roles?.[player.player_id]
  const defense = matchup?.dvp?.season?.[player.opp]?.[role]
  // ── #21: THE DESK MIXED EVIDENCE FOR AND AGAINST, UNMARKED ───────────────
  //
  // McCaffrey's 81 (A+) card listed "LA ranks #28 in TDs allowed to the RB1
  // role (rank 1 is softest)" -- which argues AGAINST the call -- inside a
  // numbered list that reads, by its position on an A+ card, as the reasons
  // FOR it. A desk that presents a counter-argument as a supporting point is
  // worse than one that omits it.
  //
  // Every bullet now carries its direction, and the DVP one computes its own:
  // a low rank is a soft matchup and helps, a high rank is a hard one and
  // hurts, and the boundary is the middle of a 32-team league. Nothing is
  // dropped -- the point of a desk is that it says the awkward thing too; it
  // just has to say which way it points.
  const dvpRank = Number(defense?.td_rank)
  const dvpTone = !Number.isFinite(dvpRank) ? 'note' : dvpRank <= 12 ? 'for' : dvpRank >= 21 ? 'against' : 'note'
  const bullets = [
    bestMarket && { tone: 'for', text: `${bestMarket} is his strongest DASH lane at ${Math.round(bestScore)} (${gradeFor(bestScore).label}).` },
    player.questionable && { tone: 'against', text: 'Injury status is questionable; the slate row should be rechecked before kickoff.' },
    player.carryover && { tone: 'note', text: 'The current score leans on last season’s per-game baseline until current-season form has depth.' },
    role && defense && {
      tone: dvpTone,
      text: `${player.opp} ranks #${Number.isFinite(dvpRank) ? dvpRank : '—'} of 32 in TDs allowed to the ${role} role — ${
        !Number.isFinite(dvpRank) ? 'rank not published'
          : dvpRank <= 12 ? 'a soft spot, and a reason for the call'
            : dvpRank >= 21 ? 'a hard spot, and a reason against it'
              : 'middle of the league, neither way'
      }.`,
    },
    lastFive.length && { tone: 'note', text: `${lastFive.length} recent published games are available for the ${MARKET_LOG[market]?.[1] || market} trend.` },
  ].filter(Boolean)
  const TONE = {
    for: { label: 'FOR', color: C.green },
    against: { label: 'AGAINST', color: C.red },
    note: { label: 'CONTEXT', color: C.text3 },
  }
  const query = encodeURIComponent(`${player.name} ${player.team} NFL`)
  return <section className="portal-card portal-story"><div className="portal-card-head"><div><small>STORYLINE DESK</small><h2>What the data says</h2></div></div>{bullets.map((b, index) => <article key={b.text}><span>0{index + 1}</span><p><em style={{ display: 'inline-block', marginRight: 7, padding: '1px 5px', borderRadius: 4, border: `1px solid ${TONE[b.tone].color}66`, color: TONE[b.tone].color, fontFamily: NUM_FONT, fontSize: 8, fontStyle: 'normal', fontWeight: 900, letterSpacing: '.1em', verticalAlign: '1px' }}>{TONE[b.tone].label}</em>{b.text}</p></article>)}<div className="portal-news"><small>LATEST COVERAGE · LINKS ONLY</small><a href={`https://www.espn.com/search/_/q/${encodeURIComponent(player.name)}`} target="_blank" rel="noreferrer">Search ESPN for {player.name} ↗</a><a href={`https://news.google.com/search?q=${query}`} target="_blank" rel="noreferrer">Search recent headlines ↗</a></div></section>
}

function PlayerDirectory({ players, selected, choose }) {
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState('all')
  const [team, setTeam] = useState('all')
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
  const rows = players.filter((player) => (
    (position === 'all' || player.position === position)
    && (team === 'all' || player.team === team)
    && (!needle || `${player.name} ${player.team} ${player.position}`.toLowerCase().includes(needle))
  )).sort((a, b) => a.name.localeCompare(b.name))
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
      <div className="portal-dir-list">{rows.map((player) => {
        const best = Math.max(...Object.values(player.scores || {}).filter(Number.isFinite), 0)
        return <button key={player.player_id} className={selected?.player_id === player.player_id ? 'active' : ''} onClick={() => choose(player)}><span>{player.team}</span><div><b>{player.name}</b><small>{player.position} · vs {player.opp}</small></div><strong>{Math.round(best)}</strong></button>
      })}</div>
    </aside>
  )
}

export default function StatPortal({ data, logs, matchup }) {
  const watchlist = useNflWatchlist(data)
  const players = data?.players || []
  const [selectedId, setSelectedId] = useState(() => currentPlayerHash())
  const [market, setMarket] = useState('TD')
  const [splitGroup, setSplitGroup] = useState(0)
  const selected = players.find((player) => String(player.player_id) === String(selectedId)) || players[0]
  const spec = (data?.markets || []).find((item) => item.key === market)
  const rows = logs?.logs?.[String(selected?.player_id)]?.log || []

  useEffect(() => {
    if (!selectedId && players[0]) { setSelectedId(String(players[0].player_id)); setPlayerHash(String(players[0].player_id)) }
  }, [players, selectedId])

  const choose = (player) => { setSelectedId(String(player.player_id)); setPlayerHash(String(player.player_id)); const first = MARKETS.find(([key]) => Number.isFinite(player.scores?.[key])); if (first) setMarket(first[0]); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  if (!selected) return <div className="portal-empty">The player directory publishes with the NFL slate.</div>
  const grade = gradeFor(selected.scores?.[market])

  return <div className="stat-portal"><PlayerDirectory players={players} selected={selected} choose={choose}/><main className="portal-profile"><section className="portal-hero"><div className="portal-monogram">{selected.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div><div className="portal-identity"><small>TUDDY PLAYER FILE · {selected.player_id}</small><h1>{selected.name}</h1><p>{selected.position} · {selected.team} vs {selected.opp}{selected.questionable ? ' · QUESTIONABLE' : ''}</p><button onClick={() => watchlist.toggle(selected)} className={watchlist.isPinned(selected.player_id) ? 'saved' : ''}>{watchlist.isPinned(selected.player_id) ? '★ SAVED TO WATCHLIST' : '☆ SAVE TO WATCHLIST'}</button></div><div className="portal-primary"><small>{spec?.label || market}</small><strong style={{ color: grade.color }}>{Number.isFinite(selected.scores?.[market]) ? Math.round(selected.scores[market]) : '—'}</strong><span style={{ color: grade.color }}>{grade.label}</span></div></section><section className="portal-measurables">{/* #20: this row used to open with NUMBER "— not in current feed" and 40-YARD DASH "— combine feed pending" -- half the header blank on every player, forever, because neither field is published by nflverse in what this app fetches. A tile whose value is permanently a dash is furniture. Replaced with two facts the row already has in hand. */}<div><small>OPPONENT</small><b>{selected.opp || '—'}</b><span>{selected.team ? `${selected.team} this week` : 'team pending'}</span></div><div><small>SCORED MARKETS</small><b>{Object.values(selected.scores || {}).filter((v) => Number.isFinite(v)).length}</b><span>markets the model priced him in</span></div><div><small>STATUS</small><b>{selected.questionable ? 'Q' : 'ACTIVE'}</b><span>{selected.low_sample ? 'low sample' : 'full scored row'}</span></div><div><small>DATA MODE</small><b>{selected.carryover ? 'CARRYOVER' : data?.mode?.toUpperCase() || 'LIVE'}</b><span>{data?.stat_season || data?.season} stats</span></div></section><ScoreProfile player={selected} market={market} setMarket={setMarket}/><div className="portal-columns"><section className="portal-card"><div className="portal-card-head"><div><small>SEASON PROFILE</small><h2>Usage and production</h2></div></div><div className="portal-stat-grid">{Object.entries(selected.stats || {}).filter(([, value]) => Number.isFinite(Number(value))).map(([key, value]) => <div key={key}><small>{STAT_LABELS[key] || key}</small><b>{nice(value)}</b></div>)}</div></section><Storylines player={selected} market={market} rows={rows} matchup={matchup}/></div><div className="portal-columns"><Splits player={selected} group={splitGroup} setGroup={setSplitGroup}/><RecentGames rows={rows} market={market} bar={spec?.bar || 1} setMarket={setMarket}/></div></main><style>{`
    .stat-portal{display:grid;grid-template-columns:265px minmax(0,1fr);gap:12px;align-items:start}.portal-directory{position:sticky;top:146px;overflow:hidden;max-height:calc(100vh - 166px);border:1px solid ${C.border};border-radius:13px;background:${C.bg2}}.portal-dir-head{display:flex;align-items:center;justify-content:space-between;padding:13px 14px 9px}.portal-dir-head small{color:${C.green};font:900 8px/1 ${NUM_FONT};letter-spacing:.1em}.portal-dir-head strong{color:${C.text3};font:900 11px/1 ${NUM_FONT}}.portal-directory>input{width:calc(100% - 20px)!important;height:36px;margin:0 10px 7px;padding:0 10px;border-radius:8px}.portal-dir-filters{display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:0 10px 7px}.portal-dir-filters>span{min-width:0}.portal-dir-filters select{width:100%;height:31px;padding:0 5px;font-size:9px}.portal-dir-active{padding:0 10px 8px}.portal-card-head select{height:31px;padding:0 7px;border:1px solid ${C.border};border-radius:7px;background:#0b0b0d;color:${C.text2};font-size:9px}.portal-dir-list{overflow-y:auto;max-height:calc(100vh - 300px)}.portal-dir-list>button{display:grid;grid-template-columns:31px 1fr 32px;align-items:center;gap:7px;width:100%;min-height:50px;padding:7px 10px;border:0;border-top:1px solid ${C.border};background:transparent;color:inherit;text-align:left;cursor:pointer}.portal-dir-list>button.active{background:rgba(34,197,94,.09);box-shadow:inset 2px 0 ${C.green}}.portal-dir-list>button>span{color:${C.green};font:900 8px/1 ${NUM_FONT}}.portal-dir-list b{display:block;font-size:10px}.portal-dir-list small{display:block;margin-top:3px;color:${C.text3};font-size:8px}.portal-dir-list>button>strong{color:${C.cyan};font:900 11px/1 ${NUM_FONT};text-align:right}.portal-profile{display:flex;flex-direction:column;gap:10px}.portal-hero{display:grid;grid-template-columns:68px 1fr auto;align-items:center;gap:15px;min-height:150px;padding:22px;border:1px solid rgba(34,197,94,.28);border-radius:16px;background:radial-gradient(circle at 90% 10%,rgba(34,211,238,.14),transparent 34%),radial-gradient(circle at 8% 100%,rgba(34,197,94,.13),transparent 40%),${C.bg2}}.portal-monogram{display:grid;place-items:center;width:66px;height:66px;border:1px solid rgba(34,211,238,.35);border-radius:18px;background:linear-gradient(145deg,rgba(34,197,94,.2),rgba(34,211,238,.08));color:${C.cyan};font:900 22px/1 ${NUM_FONT}}.portal-identity small,.portal-card-head small,.portal-primary small{color:${C.green};font:900 8px/1 ${NUM_FONT};letter-spacing:.1em}.portal-identity h1{margin:6px 0 3px;font-size:clamp(28px,5vw,48px);letter-spacing:-.05em}.portal-identity p{margin:0;color:${C.text3};font:800 9px/1 ${NUM_FONT}}.portal-identity>button{margin-top:10px;padding:6px 8px;border:1px solid ${C.border};border-radius:7px;background:transparent;color:${C.text3};font:900 8px/1 ${NUM_FONT};cursor:pointer}.portal-identity>button.saved{border-color:${C.yellow}66;background:${C.yellow}12;color:${C.yellow}}.portal-primary{text-align:center;min-width:78px}.portal-primary strong{display:block;margin-top:5px;font:900 38px/1 ${NUM_FONT}}.portal-primary span{font:900 9px/1 ${NUM_FONT}}.portal-measurables,.portal-score-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.portal-measurables>div,.portal-score-grid>button{display:flex;flex-direction:column;align-items:flex-start;min-height:73px;padding:11px;border:1px solid ${C.border};border-radius:10px;background:${C.bg2};color:inherit;text-align:left}.portal-measurables small,.portal-score-grid small{color:${C.text3};font:900 8px/1 ${NUM_FONT}}.portal-measurables b{margin-top:8px;font:900 13px/1 ${NUM_FONT}}.portal-measurables span{margin-top:5px;color:${C.text3};font-size:8px}.portal-score-grid{grid-template-columns:repeat(7,1fr)}.portal-score-grid>button{position:relative;min-height:78px;cursor:pointer}.portal-score-grid>button.active{border-color:color-mix(in srgb,var(--tone) 65%,transparent);background:color-mix(in srgb,var(--tone) 8%,${C.bg2})}.portal-score-grid strong{margin-top:8px;color:var(--tone);font:900 20px/1 ${NUM_FONT}}.portal-score-grid span{position:absolute;right:9px;bottom:9px;color:var(--tone);font:900 8px/1 ${NUM_FONT}}.portal-columns{display:grid;grid-template-columns:1fr 1fr;gap:10px}.portal-card{padding:15px;border:1px solid ${C.border};border-radius:13px;background:${C.bg2}}.portal-card-head{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin-bottom:12px}.portal-card-head h2{margin:5px 0 0;font-size:17px}.portal-stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.portal-stat-grid>div{min-height:62px;padding:10px;border:1px solid ${C.border};border-radius:8px;background:rgba(255,255,255,.025)}.portal-stat-grid small{display:block;color:${C.text3};font-size:8px;line-height:1.2}.portal-stat-grid b{display:block;margin-top:8px;font:900 13px/1 ${NUM_FONT}}.portal-story article{display:flex;gap:9px;padding:7px 0;border-bottom:1px solid ${C.border}}.portal-story article span{color:${C.green};font:900 8px/1.5 ${NUM_FONT}}.portal-story article p{margin:0;color:${C.text2};font-size:10px;line-height:1.5}.portal-news{display:flex;flex-direction:column;gap:6px;margin-top:12px;padding-top:10px;border-top:1px solid ${C.border}}.portal-news small{color:${C.text3};font:900 8px/1 ${NUM_FONT}}.portal-news a{color:${C.cyan};font-size:9px;text-decoration:none}.portal-split-labels,.portal-split-row{display:grid;grid-template-columns:1fr 1.3fr 1fr;align-items:center;gap:8px;text-align:center}.portal-split-labels{margin-bottom:4px;color:${C.text3};font-size:8px;text-transform:uppercase}.portal-split-labels span{font-size:7px}.portal-split-row{padding:7px 0;border-top:1px solid ${C.border}}.portal-split-row>strong{font:900 12px/1 ${NUM_FONT}}.portal-split-row>strong small{display:block;margin-top:4px;color:${C.text3};font-size:7px}.portal-split-row>span{color:${C.text3};font:800 8px/1 ${NUM_FONT}}.portal-market-tabs{display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end}.portal-market-tabs button{padding:4px 5px;border:1px solid ${C.border};border-radius:5px;background:transparent;color:${C.text3};font:800 7px/1 ${NUM_FONT};cursor:pointer}.portal-market-tabs button.active{border-color:${C.green};color:${C.green}}.portal-trend-bars{display:flex;align-items:flex-end;gap:4px;height:86px;padding:8px 5px 0;border:1px solid ${C.border};border-radius:8px;background:rgba(255,255,255,.02)}.portal-trend-bars>div{display:flex;flex:1;height:100%;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px}.portal-trend-bars i{display:block;width:70%;min-height:3px;border-radius:3px 3px 0 0}.portal-trend-bars span{color:${C.text3};font:700 7px/1 ${NUM_FONT}}.portal-trend p{margin:5px 0 11px;color:${C.text3};font-size:8px}.portal-log-head,.portal-log-row{display:grid;grid-template-columns:72px 1fr 55px 42px;align-items:center;gap:6px}.portal-log-head{padding:5px 3px;color:${C.text3};font:800 7px/1 ${NUM_FONT}}.portal-log-row{padding:7px 3px;border-top:1px solid ${C.border}}.portal-log-row span,.portal-log-row strong,.portal-log-row em{font:800 8px/1 ${NUM_FONT};font-style:normal}.portal-log-row span{color:${C.text3}}.portal-log-row b{font-size:9px}.portal-log-row strong{text-align:right}.portal-log-row em{text-align:right}.portal-empty{padding:20px;color:${C.text3};font-size:10px;text-align:center}
    @media(max-width:900px){.stat-portal{grid-template-columns:1fr}.portal-directory{position:static;max-height:none}.portal-dir-list{display:flex;overflow-x:auto;max-height:none}.portal-dir-list>button{flex:0 0 190px;border-left:1px solid ${C.border}}.portal-columns{grid-template-columns:1fr}.portal-score-grid{grid-template-columns:repeat(4,1fr)}}
    @media(max-width:560px){.portal-hero{grid-template-columns:54px 1fr}.portal-monogram{width:52px;height:52px}.portal-primary{grid-column:1/-1;display:flex;align-items:center;gap:8px;text-align:left}.portal-primary strong{font-size:25px;margin:0}.portal-measurables{grid-template-columns:1fr 1fr}.portal-score-grid{grid-template-columns:1fr 1fr}.portal-stat-grid{grid-template-columns:1fr 1fr}.portal-log-head,.portal-log-row{grid-template-columns:60px 1fr 44px 36px}}
  `}</style></div>
}
