'use client'

import PlayerFace from '../../PlayerFace'
import { useMemo, useState, useEffect } from 'react'
import { C, NUM_FONT } from '../../../lib/nfl/theme'
import NflYourPlayers from '../NflYourPlayers'
import { useResultsDigest, seasonTotals, grandTotal, lineTotals } from '../../../lib/nfl/resultsArchive'
import { ledgerTotals } from '../../../lib/nfl/myPicks'
import Fold from '../../Fold'
import TonightsCalls from '../../phone/TonightsCalls'
// Shared, sport-agnostic self-scroll hook -- components/Header.js and
// components/nfl/NflHeader.js's ticker both already use it.
// The NFL twin of MOONSHOT Home's buildHeadlines() -- same real signals
// that now also ride TUDDY's own header ticker (2026-09-16).
import NflHeadlineStrip from '../NflHeadlineStrip'
import { dayLine } from '../../../lib/dayLine'
import NflSlateRow from '../NflSlateRow'
import NetworkRow from '../../NetworkRow'
import RaceTracker from '../../RaceTracker'
import { fmtCountdown } from '../../../lib/headlines'
import HeadlinePicks from '../../headline/HeadlinePicks'
import CalledList from '../../CalledList'
import NflTable from '../NflTable'
import { kickoffFor } from '../../../lib/nfl/kickoff'
import PageHeader from '../../PageHeader'
import { NFL_NAV } from '../../../lib/routes'
import HotNumbers from '../../numerology/HotNumbers'
import { easternToday, easternDate } from '../../../lib/data'
import { boardReason } from '../../../lib/nfl/boardReason'
import { milestoneOf, milestoneCount, milestoneWords } from '../../../lib/nfl/milestones'
import { baselineFor } from '../ScoreAnatomy'
import { regradeNotes } from '../../../lib/nfl/regrades'
import NflTonight from '../../tonight/NflTonight'

const SIX = [
  ['TD', 'ATD', 'Touchdown'],
  ['REC_YDS', 'REC YDS', 'Receiving yards'],
  ['RUSH_YDS', 'RUSH YDS', 'Rushing yards'],
  ['REC', 'REC', 'Receptions'],
  ['PASS_YDS', 'PASS YDS', 'Passing yards'],
  ['KICK_PTS', 'KICK PTS', 'Kicker points'],
]

// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
// 2026-10-07 colour diet: every market wears TUDDY's one accent; the market's NAME says which it is.
const MARKET_COLOR = () => ({
  TD: C.green, REC_YDS: C.green, RUSH_YDS: C.green,
  REC: C.green, PASS_YDS: C.green, KICK_PTS: C.green,
})

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback

// `kickoff()`, formerly here, was only ever called by the local
// `nflRenderState` this round replaced with the shared `combinedRenderState`
// (lib/combinedRail.js, which carries the exact same weekday/time format) --
// removed rather than left as dead code.

// A SECOND COMPONENT CALLED PanelTitle USED TO LIVE HERE (killed 2026-09-18).
// It took eyebrow/title/action/onAction, while components/ui.js's PanelTitle
// -- the one 18 MOONSHOT pages render -- takes title/sub/right. Two different
// components, one name, one codebase. Both are components/PageHeader.js now;
// `action` is just a button in its `right` slot.
function SectionTitle({ eyebrow, title, action, onAction }) {
  return (
    <PageHeader
      eyebrow={eyebrow}
      title={title}
      theme={C}
      numFont={NUM_FONT}
      accent={C.green}
      right={action ? (
        <button className="tuddy-panel-action tap-box" onClick={onAction}>{action} →</button>
      ) : null}
    />
  )
}

// ── THE SIX, THREE DEEP (2026-09-27, BATCH-TUDDY-DEPTH step 3 /
// BATCH-HEADLINE-PICKS step 2). Same layout as MOONSHOT's The Four
// (components/headline/HeadlinePicks.js): one box per market, the card's #1
// big and its #2 / #3 small, all from the week's card (nfl_picks.json
// card.<MKT>.rungs -- every rung is a CALL, so nothing here is called that
// isn't). Rush attempts and DEF_TD stay on the Board. On a phone each box
// shows its #1 until tapped.
//
// FIELDS, per market, from the player's published stats (nfl_week.json
// players[].stats, labels in lib/nfl/statLabels.js):
//   TD        RZ (red-zone opp / game), TD (TD / game)
//   REC_YDS   TGT (targets / game), RECYD (rec yds / game)
//   RUSH_YDS  CAR (carries / game), RUYD (rush yds / game)
//   REC       REC (receptions / game) of TGT, catch rate = REC / TGT
//   PASS_YDS  ATT (attempts / game), PAYD (pass yds / game)
//   KICK_PTS  FGM (FG made / game), PAT (PAT / game)
//   + opponent, position, coverage_mismatch_tag when the bot set one.
// RECORD per market: the graded weekly files (the same seasonTotals() the
// Record tab uses) -- "4 of 6 over 3 wks", and a % only from 20 graded calls.
const one = (v) => (Number.isFinite(Number(v)) ? (Math.round(Number(v) * 10) / 10).toString() : null)
const PROOF = {
  TD: (s) => [one(s.RZ) && `${one(s.RZ)} RZ opp/g`, one(s.TD) && `${one(s.TD)} TD/g`],
  REC_YDS: (s) => [one(s.TGT) && `${one(s.TGT)} tgt/g`, one(s.RECYD) && `${one(s.RECYD)} rec yds/g`],
  RUSH_YDS: (s) => [one(s.CAR) && `${one(s.CAR)} car/g`, one(s.RUYD) && `${one(s.RUYD)} rush yds/g`],
  REC: (s) => [one(s.REC) && one(s.TGT) ? `${one(s.REC)} of ${one(s.TGT)} tgt/g` : one(s.REC) && `${one(s.REC)} rec/g`, Number(s.TGT) > 0 && Number.isFinite(Number(s.REC)) ? `${Math.round((100 * Number(s.REC)) / Number(s.TGT))}% catch` : null],
  PASS_YDS: (s) => [one(s.ATT) && `${one(s.ATT)} att/g`, one(s.PAYD) && `${one(s.PAYD)} pass yds/g`],
  KICK_PTS: (s) => [one(s.FGM) && `${one(s.FGM)} FG/g`, one(s.PAT) && `${one(s.PAT)} PAT/g`],
}
const MICRO = { TD: (s) => one(s.TD) && `${one(s.TD)} TD/g`, REC_YDS: (s) => one(s.RECYD) && `${one(s.RECYD)} yds/g`, RUSH_YDS: (s) => one(s.RUYD) && `${one(s.RUYD)} yds/g`, REC: (s) => one(s.REC) && `${one(s.REC)} rec/g`, PASS_YDS: (s) => one(s.PAYD) && `${one(s.PAYD)} yds/g`, KICK_PTS: (s) => one(s.FGM) && `${one(s.FGM)} FG/g` }
const recordWord = (t) => {
  if (!t?.n) return null
  return `${t.hit} of ${t.n} over ${t.weeks} wk${t.weeks === 1 ? '' : 's'}${t.n >= 20 && t.pct != null ? ` · ${Math.round(t.pct)}%` : ''}`
}

function TheSix({ picks, playersById, games = [], players = [], markets = [], onPlayerClick, onPicks, totals, logs = null }) {
  const colors = MARKET_COLOR()
  // WHY ON EACH #1 (2026-09-30, BATCH-SIGNAL-WHY S2): lib/nfl/boardReason.js,
  // the Boards card's own line -- his top component with the number behind
  // it -- against the market's FULL eligible pool and its median (the same
  // inputs Boards.js passes), so the line here and on the board can't differ.
  const whyBy = useMemo(() => {
    const out = {}
    for (const [key] of SIX) {
      const spec = markets.find((m) => m.key === key)
      if (!spec?.weights) continue
      const pool = players.filter((p) => Number.isFinite(p?.scores?.[key]))
      out[key] = { spec, pool, base: baselineFor(pool, key) }
    }
    return out
  }, [players, markets])
  const lanes = SIX.map(([key, short]) => {
    const block = picks?.card?.[key]
    return {
      key, label: short, color: colors[key],
      // the line a reader thinks in (100 / 100 / 300 yards, lib/nfl/milestones.js); the lane is still GRADED at the bot's bar, and its record says so
      blurb: milestoneOf(key) ? `${milestoneOf(key).bar}+ yds` : block?.bar != null ? `bar ${block.bar}+` : '',
      record: recordWord(totals?.[key]) && milestoneOf(key) && block?.bar != null ? `${recordWord(totals?.[key])} at ${block.bar}+` : recordWord(totals?.[key]),
      empty: 'Awaiting the card.',
      picks: (block?.rungs || []).slice(0, 3).map((call, i) => {
        const player = playersById[String(call.player_id)] || null
        const st = player?.stats || {}
        const tag = player?.coverage_mismatch_tag ? ` · ${player.coverage_mismatch_tag}` : ''
        const ms = milestoneCount(logs, call.player_id, key)
        const w = i === 0 && player && whyBy[key] ? boardReason(player, whyBy[key].spec.weights, whyBy[key].base, key, whyBy[key].pool) : null
        return {
          key: String(call.player_id), raw: { player, key }, name: call.name,
          lock: { key: String(call.player_id), time: player ? kickoffFor(games, player) : null },
          face: i === 0 && player ? <PlayerFace sport="nfl" espnId={player?.espn_id} team={player?.team} name={player?.name} size={28} /> : null,
          score: Number.isFinite(call.score) ? Math.round(call.score) : '—',
          lines: i === 0 ? [PROOF[key](st).filter(Boolean).join(' · '), `${call.team} vs ${call.opp} · ${call.position}${tag}`] : [],
          team: i === 0 ? null : call.team,
          micro: i === 0 ? null : (ms ? `${ms.bar}+: ${ms.n}/${ms.of}` : MICRO[key](st)) || null,
          chip: i === 0 && ms ? { value: `${ms.n}/${ms.of}`, label: `games at ${ms.bar}+`, heat: ms.of >= 4 && ms.n / ms.of >= 0.5 ? 2 : 0, title: milestoneWords(ms) } : null,
          ...(w ? { why: w.text, explain: { label: `Why ${call.name}`, text: w.text } } : {}),
        }
      }),
    }
  })
  return (
    <HeadlinePicks sport="nfl"
      theme={C} numFont={NUM_FONT}
      title="🏈 The Six"
      subtitle="Six markets, three deep."
      lanes={lanes}
      collapsePhone
      gridClass="tuddy-six-picks"
      foldWhy
      onPick={(pick) => pick.raw.player && onPlayerClick?.(pick.raw.player, pick.raw.key)}
      record={<button type="button" className="tuddy-panel-action tap-box" onClick={onPicks} style={{ marginLeft: 'auto' }}>Full card →</button>}
    />
  )
}




// "Full board" opens the Board hub on THAT market (2026-09-26): the hub
// reads m= / view= off the hash, and setTab keeps them.


export default function Home({ data, picks, results, matchup, logs, onPlayerClick, onOpenTeam = null, setTab, liveSnap = null }) {
  // THE RECORD, ON THE FRONT PAGE (2026-09-05). MOONSHOT's Home leads with
  // "graded x% over N nights"; TUDDY's had a player-pool count in that slot,
  // which nobody bets on. Season to date from the harvested weekly files,
  // and your own week against the bot from the device-local ledger.
  const { archive, keys, loading: recLoading, failed: recFailed } = useResultsDigest(results, data?.season)
  const record = grandTotal(seasonTotals(keys.map((k) => archive[k])))
  const bookLine = lineTotals(keys, archive)   // the same rungs against the book's line; only the weeks that stored one
  // THE RECORD, SAID PLAINLY (2026-09-29, queue batch 7): the big number is
  // every market's rungs blended, each graded against its OWN bar -- so the
  // tile says that, puts Anytime TD's own rate beside it, and opens the
  // per-market breakdown (The record). Not the report card's backtest figure.
  const tdRec = seasonTotals(keys.map((k) => archive[k]))?.TD || null
  const [mine, setMine] = useState(null)
  useEffect(() => { try { setMine(ledgerTotals()) } catch { setMine(null) } }, [results?.graded_at])
  const games = data?.games || []
  // The next game day this week, on the game's own (Eastern) date -- what the numbers line reads.
  const nextGameDay = useMemo(() => { const t0 = easternToday(); const ds = games.map((g) => easternDate(Date.parse(g?.kickoff || ''))).filter(Boolean).sort(); return ds.find((d) => d >= t0) || ds.at(-1) || null }, [games])
  const players = data?.players || []
  const playersById = useMemo(() => Object.fromEntries(players.map((player) => [String(player.player_id), player])), [players])

  const live = games.filter((game) => game.state === 'in').length
  const final = games.filter((game) => game.completed || game.state === 'post').length
  const topTd = [...players].filter((player) => Number.isFinite(player.scores?.TD)).sort((a, b) => b.scores.TD - a.scores.TD)[0]
  // THE GREETING (2026-09-28 DAY-AWARE-OPENERS-PLAN; back 2026-10-22, Donovan: "I still want a greeting ... the headlines and the stuff
  // kind of still need to be all in a greeting"): today's games by their own ET date, the week's label, the next game day; lib/dayLine says it.
  const todayET = easternToday()
  const nick = (full, abbr) => String(full || '').trim().split(/\s+/).pop() || abbr   // 'Chicago Bears' -> 'Bears'
  const normGame = (g) => ({ away: g.away, home: g.home, awayNick: nick(g.away_name, g.away), homeNick: nick(g.home_name, g.home), start: Date.parse(g.kickoff || ''), state: g.state === 'in' ? 'live' : (g.completed || g.state === 'post') ? 'final' : g.state === 'postponed' ? 'postponed' : 'pre' })
  const weekGames = games.map(normGame).filter((g) => Number.isFinite(g.start))
  const todays = weekGames.filter((g) => easternDate(g.start) === todayET)
  const laterDays = [...new Set(weekGames.map((g) => easternDate(g.start)).filter((d) => d > todayET))].sort()
  const nextDay = laterDays[0] ? { date: laterDays[0], games: weekGames.filter((g) => easternDate(g.start) === laterDays[0]) } : null
  const dl = dayLine(todays, { sport: 'nfl', date: todayET, label: data?.label || '', next: nextDay })
  const todayLive = todays.filter((g) => g.state === 'live').length
  // THE NEXT KICKOFF (2026-10-22, Donovan: "where it has the game ... logos and then time to kick off"): the week's next game not yet on,
  // its two clubs as logos and a clock to kickoff (ticks every 30 s). Its day's other games ride as "+N more that day".
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id) }, [])
  const nextKick = weekGames.filter((g) => g.state === 'pre' && g.start > now).sort((a, b) => a.start - b.start)[0] || null
  const sameDay = nextKick ? weekGames.filter((g) => g !== nextKick && g.state === 'pre' && easternDate(g.start) === easternDate(nextKick.start)).length : 0
  const kickWord = nextKick ? (nextKick.start - now < 48 * 3600e3 ? `kicks off in ${fmtCountdown(nextKick.start - now)}` : new Date(nextKick.start).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })) : ''

  // ── THE LINKS (2026-10-22, Donovan: "this needs to be a home page, not some random shit"): what used to stack on Home is one tap
  // away, three across. Offense ranked, Super Bowl odds and Award races live on Leaders (MOONSHOT keeps its odds and awards there).
  const LINKS = [
    { tab: 'research', sub: 'every player, by TD score' }, { tab: 'games', sub: 'each matchup' }, { tab: 'leaders', sub: 'offense, odds, awards' },
    { tab: 'ledger', sub: 'who scored' }, { tab: 'matchups', sub: 'defenses that leak' }, { tab: 'explosive', sub: '20+ yard plays' },
    { tab: 'accountability', sub: 'every call graded' }, { tab: 'players', sub: 'find anyone' }, { tab: 'storylines', sub: 'every story' },
  ].filter((l) => NFL_NAV[l.tab])

  return (
    <div className="tuddy-home">
      {/* THE NUMBERS OF THE DAY, FIRST (2026-10-22, Donovan: "the numbers need to be at the top") */}
      <HotNumbers compact sport="nfl" date={nextGameDay} theme={C} numFont={NUM_FONT} accent={C.green} onOpen={() => setTab('numerology')} eventWord="TDs" />

      {/* THE GREETING (2026-10-22): the day and what is on, the record tiles, then the headlines and the week's storylines as one strip -- one block */}
      <section aria-label="This week on TUDDY" className="tuddy-greeting">
        <div className="tuddy-greeting-eyebrow"><span aria-hidden="true">🏈</span><span>{dl.eyebrow}</span>{todayLive ? <b>● LIVE</b> : null}</div>
        {nextKick && !todayLive ? (
          <h2 className="tuddy-kick"><span>{nextKick.awayNick} at {nextKick.homeNick}</span>
            <span style={{ color: C.green }}>{kickWord}</span>{sameDay ? <small>+{sameDay} more that day</small> : null}</h2>
        ) : (
          <h2>{dl.lead}{dl.accent ? <span style={{ color: C.green }}>{' '}{String(dl.accent).replace(/^(Next: [A-Za-z]+): /, '$1, ')}</span> : null}</h2>
        )}
      <section className="tuddy-snapshot">
        <button onClick={() => setTab('accountability')} title={recLoading ? 'Loading the season record' : recFailed ? "The season record could not be loaded. Tap to open the record page." : record.n ? `${record.hit} of ${record.n} card rungs this season cleared their own bar — every market blended, ${keys.length} graded week${keys.length === 1 ? '' : 's'}. Anytime TD on its own: ${tdRec?.hit ?? 0} of ${tdRec?.n ?? 0}.${bookLine.n ? ` Against the book's own line (weeks ${bookLine.from}–${bookLine.to}): ${bookLine.hit} of ${bookLine.n}.` : ''} Tap for every market's record.${regradeNotes(keys).map((t) => ` ${t}`).join('')}` : undefined}><small>RECORD · ALL</small><strong style={{ color: recLoading || recFailed || record.pct == null ? C.text3 : record.pct >= 55 ? C.green : record.pct < 45 ? C.text3 : C.text }}>{recLoading || recFailed || record.pct == null ? '—' : `${record.pct}%`}</strong><span>{recLoading ? 'loading' : recFailed ? "couldn't load" : record.n ? <>{record.hit}/{record.n} · own bar</> : 'nothing graded yet'}</span></button>
        <button onClick={() => topTd && onPlayerClick?.(topTd, 'TD')}><small>TOP TD SCORE</small><strong>{topTd ? Math.round(topTd.scores.TD) : '—'}</strong><span>{topTd?.name || 'awaiting slate'}</span></button>
        <div><small>{live ? 'LIVE' : final ? 'FINAL' : 'SLATE'}</small><strong>{live || final || games.length}</strong><span>{live ? 'games on now' : final ? `of ${games.length} games` : 'games this week'}</span></div>
      </section>
        <NflHeadlineStrip players={players} games={games} markets={data?.markets} matchup={matchup} logs={logs} week={data}
          onPlayerClick={onPlayerClick} setTab={setTab} stories extras={false} />
      </section>

      {/* THE CALLED LIST (2026-10-25): the locked Card as a table, three rows and a link to the full list; silent until a card is locked */}
      <CalledList sport="nfl" theme={C} numFont={NUM_FONT} accent={C.green} Table={NflTable} preview={3} onOpenList={() => setTab('calledlist')}
        onOpenPlayer={(e) => { const p = players.find((x) => String(x.player_id) === String(e.playerId)); if (p) onPlayerClick?.(p, 'TD') }} />

      <TheSix picks={picks} playersById={playersById} games={data?.games || []} players={players} markets={data?.markets || []} onPlayerClick={onPlayerClick} onPicks={() => setTab('picks')} totals={seasonTotals(keys.map((k) => archive[k]))} logs={logs} />

      {/* TONIGHT (2026-10-04): who went, who lines up, who's still to go (components/tonight/NflTonight.js) */}
      <NflTonight data={data} picks={picks} results={results} liveSnap={liveSnap} onPlayerClick={onPlayerClick} setTab={setTab} />
      <NflYourPlayers players={players} onPlayerClick={onPlayerClick} />

      {/* THIS WEEK'S CALLS AS CARDS (2026-10-18, PHONE-PARITY 9a): MOONSHOT's swipe deck (components/phone/TonightsCalls.js), shut by default: one 44px row, no request until opened */}
      <Fold id="tuddy-calls" title="🃏 This week's calls" meta="swipe the real cards"><TonightsCalls sport="nfl" /></Fold>

      {/* THE RACES (2026-10-22): who leads the Super Bowl race and the first three awards; the full races are on Leaders */}
      <RaceTracker sport="nfl" theme={C} numFont={NUM_FONT} onOpen={() => setTab('leaders')} />

      {/* THE SLATE (2026-10-22): every game's expected touchdowns, lower down (the header and Slate tab reach the games anywhere) */}
      <NflSlateRow week={data} logs={logs} />

      <section aria-label="More on TUDDY" className="tuddy-links">
        {LINKS.map((l) => (
          <button type="button" key={l.tab} data-tile="link" onClick={() => setTab(l.tab)}>
            <b>{NFL_NAV[l.tab].icon ? `${NFL_NAV[l.tab].icon} ` : ''}{NFL_NAV[l.tab].label}</b><span>{l.sub}</span>
          </button>
        ))}
      </section>

      <NetworkRow sport="nfl" theme={C} numFont={NUM_FONT} />

      <style>{`
        .tuddy-home{display:flex;flex-direction:column;gap:12px}.tuddy-hero{position:relative;display:flex;align-items:center;justify-content:space-between;min-height:220px;padding:28px;border:1px solid rgba(0,245,173,.32);border-radius:18px;overflow:hidden;background:radial-gradient(circle at 82% 18%,rgba(0,245,173,.16),transparent 30%),radial-gradient(circle at 8% 100%,rgba(0,245,173,.14),transparent 38%),${C.bg2}}.tuddy-hero:after{content:'';position:absolute;inset:auto -8% -44% 42%;height:190px;border:1px solid rgba(0,245,173,.18);border-radius:50%}.tuddy-hero>div:first-child{position:relative;z-index:1}.tuddy-hero small,.tuddy-six-head small{font:900 8px/1 ${NUM_FONT};letter-spacing:.14em;color:${C.green}}.tuddy-hero h1{max-width:760px;margin:10px 0 9px;font-size:clamp(34px,6vw,67px);line-height:.95;letter-spacing:-.06em}.tuddy-hero p{margin:0;color:${C.text2};font-size:12px}.tuddy-hero-mark{position:relative;z-index:1;display:flex;align-items:center;gap:12px;padding:15px 19px;border:1px solid rgba(0,245,173,.28);border-radius:18px;background:rgba(7,13,12,.66)}.tuddy-hero-mark span{font:900 58px/.8 ${NUM_FONT};color:${C.green}}.tuddy-hero-mark small{color:${C.text2};line-height:1.35}.tuddy-slate-strip{display:flex;gap:6px;overflow-x:auto;padding:2px 0 4px;scrollbar-width:none}.tuddy-slate-strip>div{flex:0 0 150px;padding:9px 11px;border:1px solid ${C.border};border-radius:10px;background:${C.bg2}}.tuddy-slate-strip>div.is-live{border-color:rgba(0,245,173,.45);box-shadow:inset 0 0 22px rgba(0,245,173,.05)}.tuddy-slate-strip span{display:block;color:${C.text3};font:800 8px/1 ${NUM_FONT}}.tuddy-slate-strip .is-live span{color:${C.green}}.tuddy-slate-strip b{display:inline-block;margin-top:6px;color:${C.text};font:900 10px/1 ${NUM_FONT}}.tuddy-slate-strip b i{color:${C.text3};font-style:normal}.tuddy-slate-strip em{margin-left:5px;color:${C.text};font:900 10px/1 ${NUM_FONT};font-style:normal}.tuddy-snapshot{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.tuddy-snapshot>div,.tuddy-snapshot>button{display:flex;flex-direction:column;align-items:flex-start;min-height:58px;padding:8px 10px;border:1px solid ${C.border};border-radius:10px;background:${C.bg2};color:inherit;text-align:left;min-width:0}.tuddy-snapshot>button{cursor:pointer}.tuddy-snapshot small{color:${C.text3};font:900 8px/1 ${NUM_FONT};letter-spacing:.08em}.tuddy-snapshot strong{margin-top:5px;color:${C.green};font:900 18px/1 ${NUM_FONT}}.tuddy-snapshot span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}.tuddy-greeting{display:grid;grid-template-columns:minmax(0,1fr);min-width:0;gap:10px;padding:12px;border:1px solid ${C.border};border-radius:14px;background:${C.bg2}}.tuddy-greeting-eyebrow{display:flex;align-items:center;gap:8px;color:${C.text3};font:700 11px/1 ${NUM_FONT};letter-spacing:.06em;text-transform:uppercase}.tuddy-greeting-eyebrow b{color:${C.green};font-weight:900}.tuddy-greeting h2{margin:0;font-size:20px;font-weight:900;line-height:1.25;letter-spacing:-.01em;color:${C.text}}.tuddy-links{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.tuddy-links>button{position:relative;overflow:hidden;display:grid;gap:3px;align-content:center;min-height:60px;padding:9px 8px;border:1px solid color-mix(in srgb,${C.green} 22%,${C.border});border-radius:12px;background:linear-gradient(160deg,color-mix(in srgb,${C.green} 9%,transparent),${C.bg2} 65%);color:inherit;text-align:center;cursor:pointer;min-width:0;transition:border-color .15s,transform .15s}.tuddy-links>button:hover{border-color:${C.green};transform:translateY(-1px)}.tuddy-links>button:after{content:'›';position:absolute;right:8px;top:6px;color:${C.green};font-weight:900;font-size:12px}.tuddy-links b{font-size:12px;font-weight:900;color:${C.text}}.tuddy-links span{font-size:11px;color:${C.text3}}.tuddy-kick{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.tuddy-kick>span:first-of-type{color:${C.text}}.tuddy-kick small{flex-basis:100%;font:700 11px/1 ${NUM_FONT};color:${C.text3}}.tuddy-snapshot span{margin-top:5px;color:${C.text2};font-size:10px}.tuddy-six{overflow:hidden;border:1px solid rgba(0,245,173,.25);border-radius:16px;background:linear-gradient(155deg,rgba(0,245,173,.06),rgba(0,245,173,.025)),${C.bg2}}.tuddy-six-head{display:flex;align-items:flex-end;justify-content:space-between;padding:19px 20px;border-bottom:1px solid ${C.border}}.tuddy-six-head h2{margin:5px 0 2px;font-size:30px;letter-spacing:-.04em}.tuddy-six-head p{margin:0;color:${C.text3};font-size:10px}.tuddy-six-head button,.tuddy-panel-action,.tuddy-receipts button{border:0;background:transparent;padding:8px 6px;margin:-8px -6px;color:${C.green};font:900 9px/1 ${NUM_FONT};cursor:pointer}.tuddy-six-grid{display:grid;grid-template-columns:repeat(3,1fr)}.tuddy-six-grid>button{position:relative;display:grid;grid-template-columns:28px 1fr auto;align-items:center;gap:9px;min-height:94px;padding:14px;border:0;border-right:1px solid ${C.border};border-bottom:1px solid ${C.border};background:transparent;color:inherit;text-align:left;cursor:pointer}.tuddy-six-grid>button:disabled{cursor:default}.tuddy-six-grid>button:hover:not(:disabled){background:color-mix(in srgb,var(--market) 7%,transparent)}.tuddy-six-number{color:var(--market);font:900 10px/1 ${NUM_FONT}}.tuddy-six-grid small{display:block;color:var(--market);font:900 8px/1 ${NUM_FONT}}.tuddy-six-grid strong{display:block;margin-top:6px;font-size:13px}.tuddy-six-grid em{display:block;margin-top:4px;color:${C.text3};font-size:9px;font-style:normal}.tuddy-six-score{text-align:center}.tuddy-six-score b{display:block;font:900 20px/1 ${NUM_FONT}}.tuddy-six-score span{font:900 8px/1 ${NUM_FONT}}.tuddy-six-headliner{position:relative;display:grid;grid-template-columns:1fr auto;align-items:center;gap:16px;width:calc(100% - 40px);margin:14px 20px 0;padding:16px 20px;overflow:hidden;border:1px solid color-mix(in srgb,var(--market) 40%,transparent);border-radius:13px;background:linear-gradient(155deg,color-mix(in srgb,var(--market) 12%,transparent),${C.bg2} 62%);color:inherit;text-align:left;cursor:pointer}.tuddy-six-headliner:disabled{cursor:default}.tuddy-six-ghost{position:absolute;right:6px;top:50%;transform:translateY(-50%);font:900 96px/1 ${NUM_FONT};color:color-mix(in srgb,var(--market) 10%,transparent);pointer-events:none;z-index:0}.tuddy-six-headliner-body{position:relative;z-index:1;min-width:0}.tuddy-six-headliner-body small{display:block;color:var(--market);font:900 9px/1 ${NUM_FONT};letter-spacing:.1em}.tuddy-six-headliner-body strong{display:block;margin-top:6px;font-size:20px;font-weight:900;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tuddy-six-headliner-body em{display:block;margin-top:4px;color:${C.text3};font-size:10.5px;font-style:normal}.tuddy-six-headliner-score{position:relative;z-index:1;text-align:right;flex-shrink:0}.tuddy-six-headliner-score b{display:block;font:900 34px/1 ${NUM_FONT}}.tuddy-six-headliner-score span{font:900 9px/1 ${NUM_FONT}}.tuddy-home-split,.tuddy-board-split{display:grid;grid-template-columns:1fr 1fr;gap:10px}.tuddy-panel,.tuddy-angles,.tuddy-mini-board{padding:15px;border:1px solid ${C.border};border-radius:13px;background:${C.bg2}}.tuddy-ledger-total{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid rgba(0,245,173,.18);border-radius:10px;background:rgba(0,245,173,.04)}.tuddy-ledger-total strong{color:${C.green};font:900 36px/1 ${NUM_FONT}}.tuddy-ledger-total span{color:${C.text3};font-size:9px;line-height:1.4}.tuddy-ledger-list{margin-top:8px}.tuddy-ledger-list>div{display:grid;grid-template-columns:36px 1fr auto;align-items:center;gap:8px;padding:7px 3px;border-bottom:1px solid ${C.border}}.tuddy-ledger-list span,.tuddy-ledger-list em{color:${C.text3};font:800 8px/1 ${NUM_FONT};font-style:normal}.tuddy-ledger-list b{font-size:11px}.tuddy-ledger-list p,.tuddy-leaks p,.tuddy-milestones p{color:${C.text3};font-size:10px;line-height:1.5}.tuddy-lookout h3{margin:13px 0 6px;color:${C.text2};font:900 9px/1 ${NUM_FONT};letter-spacing:.08em;text-transform:uppercase}.tuddy-leaks>div,.tuddy-milestones>div{display:grid;grid-template-columns:44px 1fr auto;gap:7px;padding:6px 0;border-bottom:1px solid ${C.border};align-items:center}.tuddy-leaks b{color:${C.text3};font:900 10px/1 ${NUM_FONT}}.tuddy-leaks span,.tuddy-milestones b{font-size:10px}.tuddy-leaks em,.tuddy-milestones em{color:${C.text3};font:700 8px/1 ${NUM_FONT};font-style:normal}.tuddy-milestones>div{grid-template-columns:1fr auto auto}.tuddy-milestones span{color:${C.yellow};font-size:9px}.tuddy-angles>div:last-child{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.tuddy-angles article{display:flex;gap:9px;padding:12px;border:1px solid ${C.border};border-radius:10px;background:rgba(255,255,255,.025)}.tuddy-angles article>span{color:${C.green};font:900 9px/1 ${NUM_FONT}}.tuddy-angles article small{color:${C.text3};font:800 8px/1 ${NUM_FONT}}.tuddy-angles article b{display:block;margin-top:7px;font-size:11px}.tuddy-angles article p{margin:4px 0 0;color:${C.text3};font-size:9px}.tuddy-mini-board>button{display:grid;grid-template-columns:20px 24px 1fr auto 34px;align-items:center;gap:8px;width:100%;min-height:44px;padding:7px 4px;border:0;border-top:1px solid ${C.border};background:transparent;color:inherit;text-align:left;cursor:pointer}.tuddy-mini-board>button>span{color:${C.text3};font:800 9px/1 ${NUM_FONT}}.tuddy-mini-board>button>b{font-size:11px}.tuddy-mini-board>button>em{color:${C.text3};font:700 8px/1 ${NUM_FONT};font-style:normal}.tuddy-mini-board>button>strong{text-align:right;font:900 13px/1 ${NUM_FONT}}.tuddy-receipts{display:flex;align-items:center;justify-content:space-between;padding:20px 22px;border:1px solid rgba(167,139,250,.28);border-radius:14px;background:radial-gradient(circle at 90% 20%,rgba(167,139,250,.11),transparent 35%),${C.bg2}}.tuddy-receipts small{color:${C.text2};font:900 8px/1 ${NUM_FONT};letter-spacing:.1em}.tuddy-receipts h2{margin:6px 0 4px;font-size:21px}.tuddy-receipts p{margin:0;color:${C.text3};font-size:10px}.tuddy-receipts button{color:${C.text2}}
        @media(max-width:800px){.tuddy-hero{min-height:190px;padding:22px}.tuddy-six-ghost{font-size:72px}.tuddy-hero-mark{display:none}.tuddy-six-grid{grid-template-columns:1fr 1fr}.tuddy-home-split,.tuddy-board-split{grid-template-columns:1fr}.tuddy-angles>div:last-child{grid-template-columns:1fr 1fr}}
        @media(max-width:520px){.tuddy-hero h1{font-size:36px}.tuddy-six-headliner{grid-template-columns:1fr;width:calc(100% - 24px);margin:12px 12px 0;padding:14px}.tuddy-six-headliner-score{text-align:left}.tuddy-six-ghost{display:none}.tuddy-six-grid{grid-template-columns:1fr}.tuddy-six-head{align-items:flex-start;gap:12px}.tuddy-six-head button{max-width:90px}.tuddy-angles>div:last-child{grid-template-columns:1fr}.tuddy-receipts{align-items:flex-start;gap:16px}.tuddy-receipts button{max-width:90px}.tuddy-leaks>div,.tuddy-milestones>div{grid-template-columns:42px 1fr}.tuddy-leaks em,.tuddy-milestones em{grid-column:2}}

        .tuddy-six-picks{grid-template-columns:repeat(3,minmax(0,1fr))!important}@media(max-width:800px){.tuddy-six-picks{grid-template-columns:repeat(2,minmax(0,1fr))!important}}@media(max-width:560px){.tuddy-six-picks{grid-template-columns:repeat(2,minmax(0,1fr))!important}}@media(max-width:380px){.tuddy-six-picks{grid-template-columns:1fr!important}}
        .tuddy-six-dot{display:inline-block;width:6px;height:6px;margin-right:6px;border-radius:50%;background:var(--market);vertical-align:middle;animation:tuddyPulseDot 2s infinite}
        .tuddy-six-pulse{position:absolute;right:38px;top:50%;width:64px;height:64px;margin-top:-32px;border-radius:50%;border:1.5px solid var(--market);opacity:0;pointer-events:none;z-index:0;animation:tuddyPulseRing 2.6s ease-out infinite}
        @keyframes tuddyPulseDot{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes tuddyPulseRing{0%{transform:scale(.55);opacity:.55}100%{transform:scale(1.25);opacity:0}}
        @media(prefers-reduced-motion:reduce){.tuddy-six-dot{animation:none}.tuddy-six-pulse{display:none}}
        @media(max-width:520px){.tuddy-six-pulse{display:none}}
      `}</style>
    </div>
  )
}
