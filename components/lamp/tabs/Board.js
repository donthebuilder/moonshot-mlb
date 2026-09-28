'use client'
import { useHashFilter } from '../../../lib/filterHash'
import { nhlMug } from '../../../lib/nhl/format'
import { useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { chipColor } from '../../Heatmap'
import LampTable from '../LampTable'
import { AngleRow, FilterPill, Segmented, ActiveFilters } from '../../Filters'
import BoardTopBar from '../../BoardTopBar'
import GoalWatch from '../GoalWatch'
import { alpha } from '../../../lib/scales'
import { useLampBoard } from '../../../lib/nhl/useLamp'
import { TeamMark, EmptyState, DelayedBanner, Loading, SourceLine, Kicker, GameTypeChip, LampDot, StaleSeasonNote, fmtDay, fmtPuckDrop, fmtSec, zoneAbbrev, shiftDay, STATUS, CalledChip, readHashParam, writeHashParam } from '../ui'

// 🏒 THE LAMP GOAL BOARD (lamp-goal-v1) — the product's first signal page.
// Per game: every scored skater ranked, the top three CALLED, the rest ON
// THE BOARD, the unscored roster men NOT ON THE BOARD with the reason
// printed. Three words, same meaning as MOONSHOT and TUDDY.
//
// LOCKED vs PREVIEW is printed on every game in capitals: a PREVIEW is the
// same arithmetic run now, before the lock window, and is not a call; a
// LOCKED board is what the record holds (the last write before puck drop,
// app/api/lamp/tick). After the final the GOALS column fills and a hit
// lights the lamp. Every number is a field or a percentile of a field.
// The three words live in ../ui (STATUS), shared with the goal lists.
export { STATUS }

// The day is the LAMP shell's (LampDashboard, 2026-09-26): one date for the
// header's Today/Tmrw, every dated tab and the address -- this tab's day
// buttons move it for all of them.
export default function Board({ onOpenPlayer, onOpenGame, onOpenTeam, date = null, setDate = () => {} }) {
  // The market lives in the address (#...&m=sog) so a shared link opens the
  // same board; GOAL is the default and writes nothing.
  const [market, setMarketRaw] = useState(() => { const m = String(readHashParam('m') || '').toUpperCase(); return MARKETS.some((x) => x.key === m) ? m : 'GOAL' })
  const setMarket = (m) => { setMarketRaw(m); writeHashParam('m', m === 'GOAL' ? null : m.toLowerCase()) }
  const M = marketOf(market)
  const { data, error, loading } = useLampBoard(date, market)
  const games = data?.games || []
  const lockedN = games.filter((g) => g.locked).length
  const calledN = games.reduce((n, g) => n + g.rows.filter((r) => r.status === 'called').length, 0)
  const shown = data?.date || date
  // ── FILTERS, MOONSHOT'S SET (2026-09-27, board filters plan, LAMP 1-5) ──
  // BY GAME (the layout Donovan likes, unchanged) or ALL GAMES (one table,
  // every scored skater tonight ranked by score). One filter row + one Angle
  // row cut both views. Every test reads a field the row already carries.
  const [view, setView] = useState('game')
  const [q, setQ] = useState('')
  const [team, setTeam] = useHashFilter('fteam')
  const [pos, setPos] = useState('all')
  const [gameF, setGameF] = useHashFilter('fgame')
  const [calledOnly, setCalledOnly] = useState(false)
  const [angle, setAngle] = useState(null)
  const flat = useMemo(() => games.filter((g) => !g.noMarketLock).flatMap((g) => g.rows.filter((r) => r.status !== 'off').map((r) => ({ r, g }))), [games])
  const angles = useMemo(() => lampAngles(flat, market), [flat, market])
  const angleTest = angle ? angles.find((a) => a.key === angle)?.test : null
  const needle = q.trim().toLowerCase()
  const kept = flat.filter((x) => {
    const { r, g } = x
    if (team && r.team !== team) return false
    if (pos !== 'all' && (pos === 'D' ? r.pos !== 'D' : r.pos === 'D')) return false
    if (gameF && String(g.game.id) !== gameF) return false
    if (calledOnly && r.status !== 'called') return false
    if (needle && !String(r.name || '').toLowerCase().includes(needle)) return false
    if (angleTest && !angleTest(x)) return false
    return true
  })
  const keepIds = new Set(kept.map(({ r, g }) => `${g.game.id}|${r.playerId}`))
  const filtering = Boolean(team) || pos !== 'all' || Boolean(gameF) || calledOnly || Boolean(needle) || Boolean(angle)
  const teams = [...new Set(flat.map(({ r }) => r.team))].sort()
  const chips = [
    angle ? { key: 'angle', label: angles.find((a) => a.key === angle)?.label || angle, onClear: () => setAngle(null) } : null,
    pos !== 'all' ? { key: 'pos', label: pos === 'D' ? 'Defence' : 'Forwards', onClear: () => setPos('all') } : null,
    calledOnly ? { key: 'called', label: 'Called only', onClear: () => setCalledOnly(false) } : null,
  ].filter(Boolean)
  const clearAll = () => { setAngle(null); setPos('all'); setCalledOnly(false) }
  const gameOptions = games.filter((g) => !g.noMarketLock).map((g) => ({ key: String(g.game.id), label: `${g.game.away.abbrev} @ ${g.game.home.abbrev}` }))
  // MOONSHOT'S ORDER (2026-09-27, Donovan: "doesn't feel anything like the mlb
  // pages"): the search / team / game bar first, the market as the parent
  // pills under it, the day, the angle row, then the night's header and the
  // boards. Was: header, market buttons, day buttons, banner, then a row of
  // small grey selects.
  const pill = (on) => ({
    padding: '7px 16px', minHeight: 36, borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 900, fontFamily: NUM_FONT,
    whiteSpace: 'nowrap', letterSpacing: '.02em', border: `1px solid ${on ? C.ice : C.border}`,
    background: on ? alpha(C.ice, 0.14) : 'transparent', color: on ? C.ice : C.text3,
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <BoardTopBar query={q} setQuery={setQ} placeholder="Search skater or team…"
        team={team} setTeam={setTeam} teams={teams} teamLabel="🏒 All teams"
        game={gameF} setGame={setGameF} games={gameOptions} gameLabel="All games" />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
        <div role="group" aria-label="Market" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {MARKETS.map((m) => <button key={m.key} type="button" onClick={() => setMarket(m.key)} aria-pressed={m.key === market} style={pill(m.key === market)}>{m.label}</button>)}
        </div>
        {data && <span style={{ marginLeft: 'auto' }}><Segmented value={view} onChange={setView}
          options={[{ key: 'game', label: 'By game', title: 'Each game, three called on top' }, { key: 'all', label: 'All games', title: 'Every scored skater tonight, one ranked table' }]} /></span>}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <NavBtn onClick={() => setDate(shiftDay(shown, -1))} disabled={loading}>‹ Previous day</NavBtn>
        <NavBtn onClick={() => setDate(null)} disabled={loading || !date} strong>Tonight</NavBtn>
        <NavBtn onClick={() => setDate(shiftDay(shown, 1))} disabled={loading}>Next day ›</NavBtn>
        <span style={{ color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.1em' }}>{data?.modelVersion?.toUpperCase()}</span>
      </div>
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <AngleRow defs={angles} pool={flat} value={angle} onChange={setAngle} accent={C.ice} className="lamp-angle-row" hideEmpty />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Segmented label="Pos" value={pos} onChange={setPos} options={[{ key: 'all', label: 'All' }, { key: 'F', label: 'Forwards' }, { key: 'D', label: 'Defence' }]} />
            <FilterPill active={calledOnly} onClick={() => setCalledOnly((v) => !v)} title="Only the three called per game.">Called only</FilterPill>
            <span style={{ fontFamily: NUM_FONT, fontSize: 11, color: C.text2, border: `1px solid ${C.border}`, borderRadius: 999, padding: '5px 11px' }}><b style={{ color: C.text }}>{kept.length}</b> of {flat.length} on the board</span>
          </div>
          {chips.length > 0 && <ActiveFilters filters={chips} shown={kept.length} total={flat.length} onClearAll={clearAll} />}
        </div>
      )}
      {data && market === 'GOAL' && <GoalWatch flat={flat} onOpenPlayer={onOpenPlayer} />}
      {data?.season?.stale && <StaleSeasonNote label={data.season.label} opens={data.season.opens} what="legs" />}
      <DelayedBanner error={error} what="the board" />
      {loading && !data ? <Loading what="tonight’s board" /> : null}
      {data && !data.dbReady && <div style={{ color: C.amber, fontSize: 11 }}>The record is not connected on this deployment — boards will preview but nothing locks. (Supabase env missing.)</div>}
      <PageHeader eyebrow={M.eyebrow} title={shown ? fmtDay(shown) : 'Tonight'}
        note={M.note}
        theme={C} numFont={NUM_FONT} accent={C.ice}
        stats={data ? [{ value: games.length, label: 'GAMES', tone: C.text2 }, { value: `${lockedN}/${games.length}`, label: 'LOCKED', tone: lockedN === games.length && games.length ? C.teal : C.text2 }, { value: calledN, label: 'CALLED', tone: C.ice }] : null} />
      {data && games.length === 0 && <EmptyState title="NO GAMES ON THIS DATE" note="No NHL games, so nothing to call. The filters above work on any night with games; the schedule has the week." />}
      {view === 'all' && flat.length > 0 && (
        kept.length ? <AllGamesTable kept={kept} market={market} onOpenPlayer={onOpenPlayer} onOpenTeam={onOpenTeam} />
          : <EmptyState title="NOTHING MATCHES" note="Clear a filter above." />
      )}
      {view === 'game' && games.map((g) => (g.noMarketLock
        ? (filtering ? null : <EmptyState key={g.game.id} title={`${g.game.away.abbrev} @ ${g.game.home.abbrev} · NO ${M.label} LOCK`} note={`This game locked before the ${M.label} board existed, so there is no call for it. Nothing is previewed after a lock.`} />)
        : (!filtering || g.rows.some((r) => keepIds.has(`${g.game.id}|${r.playerId}`)))
          ? <GameBoard key={g.game.id} g={g} market={market} keep={filtering ? keepIds : null} onOpenPlayer={onOpenPlayer} onOpenGame={onOpenGame} onOpenTeam={onOpenTeam} />
          : null))}
      {view === 'game' && filtering && flat.length > 0 && !kept.length && <EmptyState title="NOTHING MATCHES" note="Clear a filter above." />}
      <SourceLine>Legs: NHL club-stats/{'{team}'}/{'{season}'}/2 (this season and last); population: roster/{'{team}'}/current, narrowed to the posted lineup when the league has one; grade: gamecenter/{'{id}'}/boxscore. Locked rows live in {M.log} and are never rewritten.</SourceLine>
    </div>
  )
}

// THE BOARD, MADE TO POP (lamp research step 1, 2026-09-26). Same structure
// Donovan likes -- grouped by game, three called on top -- drawn the way
// MOONSHOT's Picks reads: the table is LampTable (DenseTable), SCORE and the
// three legs heat-shaded on MOONSHOT's own heat scale (2026-09-28: was LAMP's
// ice ramp, which ended in goal-light red -- red read as bad; a high score now
// looks the same on all three boards), a called row carries a stripe
// and a filled CALLED chip, and "shots 95th · goals 96th · ice time 69th"
// is three small bars (the same three percentiles, r.pct). Nothing new is
// computed here; every cell is a field the board already had.
const PREVIEW_ROWS = 8

// A side's spot for a skater's club (mine) or tonight's opponent (!mine).
const spotOf = (g, team, mine) => {
  if (!g.spots) return null
  const home = g.game.home.abbrev === team
  return mine ? (home ? g.spots.home : g.spots.away) : (home ? g.spots.away : g.spots.home)
}
const pct1 = (v) => (v == null ? null : (v * 100).toFixed(1))
const ppVsPk = (us, them) => (pct1(us?.ppPct) && pct1(them?.pkPct) ? `${pct1(us.ppPct)} v ${pct1(them.pkPct)}` : null)
const restWord = (s) => (s?.b2b ? 'B2B' : s?.rest != null ? `${s.rest}d` : null)

// The filled CALLED chip (CalledChip, ../ui) -- pregame in STATUS, graded beside the goals -- and
// the rank itself filled on a called row, the two marks MOONSHOT's pick rows
// carry. (Beside the name it was clipped by the name cell at 390px.)
function PctBars({ r, market = 'GOAL' }) {
  if (!r.pct) return null
  const legs = market === 'SOG'
    ? [['S', r.pct.shotsPg, 'shots'], ['T', r.pct.toi, 'ice time'], ['O', r.pct.oppSaPg, 'opponent shots allowed']].filter(([, v]) => v != null)
    : [['S', r.pct.shotsPg, 'shots'], ['G', r.pct.goalsPg, 'goals'], ['T', r.pct.toi, 'ice time']]
  return (
    <span title={r.why} style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
      {legs.map(([k, v, word]) => (
        <span key={k} aria-label={`${word} ${Math.round(v)}th percentile`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          <span style={{ color: C.text3, font: `800 7.5px/1 ${NUM_FONT}` }}>{k}</span>
          <span style={{ width: 22, height: 6, borderRadius: 3, background: C.border, overflow: 'hidden', display: 'inline-block' }}>
            <span style={{ display: 'block', height: '100%', width: `${Math.max(4, Math.min(100, v))}%`, background: chipColor(v, 0, 100) }} />
          </span>
        </span>
      ))}
    </span>
  )
}

// LAMP v2 (2026-09-27): the board reads one market at a time. GOAL is the
// original; SOG is lamp-sog-v1 (3+ shots on goal). Same table, same words.
const MARKETS = [
  { key: 'GOAL', label: 'GOAL', eyebrow: 'LAMP · GOAL BOARD', note: 'Three called per game, locked before puck drop, graded after. Score = mean of three percentile ranks tonight: shots, goals, ice time per game over his last 82 NHL games.', result: 'GOALS', log: 'lamp_goal_log' },
  { key: 'SOG', label: 'SHOTS 3+', eyebrow: 'LAMP · SHOTS BOARD', note: 'Three called per game for 3+ shots on goal, locked before puck drop, graded after. Score = mean of three percentile ranks tonight: shots per game over his last 82, ice time, and how many shots his opponent allows per 60.', result: 'SOG', log: 'lamp_prop_log' },
]
const marketOf = (k) => MARKETS.find((m) => m.key === k) || MARKETS[0]

function columnsFor(g, onOpenTeam, market = 'GOAL') {
  const graded = g.graded
  const sog = market === 'SOG'
  return [
    { key: 'rank', label: '#', heat: false, mono: true, w: 28,
      fmt: (v, r) => (r.status === 'called'
        ? <span title="CALLED" style={{ display: 'inline-block', minWidth: 16, textAlign: 'center', background: C.ice, color: C.bg, font: `900 10px/16px ${NUM_FONT}`, borderRadius: 4 }}>{v}</span>
        : v) },
    { key: 'name', label: 'PLAYER', heat: false, sticky: true, bold: true, w: 170,
      fmt: (v, r) => <>{v}<span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}`, marginLeft: 6 }}>{r.pos}</span></> },
    { key: 'team', label: 'TM', heat: false, mono: true, w: 40,
      fmt: (v) => <button type="button" onClick={(e) => { e.stopPropagation(); onOpenTeam?.(v) }} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: C.text2, font: `800 10.5px/1 ${NUM_FONT}` }}>{v}</button> },
    { key: 'score', label: 'SCORE', primary: true, scale: 'seq', domain: [0, 100], w: 50 },
    { key: 'spg', label: 'S/GP', primary: true, dp: 2, w: 44 },
    ...(sog ? [] : [{ key: 'gpg', label: 'G/GP', primary: true, dp: 2, w: 44 }]),
    { key: 'toi', label: 'TOI', primary: true, w: 48, fmt: (v) => (Number.isFinite(v) ? fmtSec(v) : '—') },
    ...(sog ? [{ key: 'osa', label: 'OPP SA/60', primary: true, dp: 1, w: 62 }] : []),
    { key: 'pctl', label: 'LEGS', heat: false, w: 118, fmt: (v, r) => (r.status === 'called' ? <PctBars r={r._row} market={market} /> : null) },
    // Context columns (lamp research step 2): shown beside the score, never
    // in it. PP G is his season's power-play goals; PP v PK is his club's
    // power play against tonight's opponent's penalty kill; REST is full days
    // off before tonight (B2B = played yesterday).
    { key: 'ppg', label: 'PP G', primary: true, w: 44 },
    { key: 'ppvpk', label: 'PP v PK', heat: false, mono: true, w: 84, fmt: (v) => v || '—' },
    { key: 'rest', label: 'REST', heat: false, mono: true, w: 48, fmt: (v) => v || '—' },
    { key: 'result', label: graded ? marketOf(market).result : 'STATUS', heat: false, w: 96, fmt: (v, r) => {
      const row = r._row
      if (graded) {
        if (row.dressed === false) return <span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}` }}>VOID</span>
        const n = sog ? row.value : row.goals
        return <>{row.status === 'called' ? <CalledChip /> : null}<span style={{ color: row.hit ? C.lamp : C.text3, font: `900 12px/1 ${NUM_FONT}` }}>{row.hit && <LampDot />}{n ?? 0}</span></>
      }
      return row.status === 'called' ? <CalledChip /> : <span style={{ color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.1em' }}>{STATUS[row.status]}</span>
    } },
  ]
}

function GameBoard({ g, onOpenPlayer, onOpenGame, onOpenTeam, market = 'GOAL', keep = null }) {
  const game = g.game
  const scored = g.rows.filter((r) => r.status !== 'off' && (!keep || keep.has(`${game.id}|${r.playerId}`)))
  const off = g.rows.filter((r) => r.status === 'off')
  const [showOff, setShowOff] = useState(false)
  const live = game.state === 'live'; const done = game.state === 'final'
  const ctx = g.rows[0]?.context || {}
  const stamp = g.graded ? 'GRADED' : g.locked ? 'LOCKED' : 'PREVIEW · NOT A CALL'
  const stampTone = g.graded ? C.cream : g.locked ? C.teal : C.amber
  // Rank order as the board gives it -- no initial sort, so no "sorted by"
  // line above the table (a phone row the old table didn't spend).
  const rows = [...scored].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)).map((r) => ({
    id: r.playerId, rank: r.rank, name: r.name, pos: r.pos, team: r.team, score: r.score,
    spg: r.legs ? r.legs.shotsPg : null, gpg: r.legs ? r.legs.goalsPg : null, toi: r.legs ? r.legs.toi : null,
    osa: r.legs ? r.legs.oppSaPg ?? null : null,
    pctl: r.status === 'called' ? 1 : 0, result: r.status, status: r.status, _row: r,
    ppg: r.ppg, ppvpk: ppVsPk(spotOf(g, r.team, true), spotOf(g, r.team, false)), rest: restWord(spotOf(g, r.team, true)),
  }))
  return (
    <section aria-label={`${game.away.abbrev} at ${game.home.abbrev}`} style={{ border: `1px solid ${C.border2}`, borderRadius: 12, background: C.bg2, padding: '8px 10px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <button type="button" onClick={() => onOpenGame?.(game.id)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: C.text, font: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <TeamMark abbrev={game.away.abbrev} size={22} bold /><span style={{ color: C.text3, font: `800 10px/1 ${NUM_FONT}` }}>@</span><TeamMark abbrev={game.home.abbrev} size={22} bold />
        </button>
        {done || live
          ? <span style={{ color: live ? C.lamp : C.text, font: `900 17px/1 ${NUM_FONT}` }}>{live && <LampDot />}{game.away.score}–{game.home.score}</span>
          : null}
        <span style={{ color: live ? C.lamp : done ? C.text2 : C.text2, font: `800 10.5px/1 ${NUM_FONT}` }}>{game.statusLine || `${fmtPuckDrop(game.startUtc)} ${zoneAbbrev()}`}</span>
        <GameTypeChip label={game.gameTypeLabel} />
      </div>
      <div style={{ color: C.text3, fontSize: 10.5, lineHeight: 1.5, marginBottom: 8, fontFamily: NUM_FONT }}>
        {/* The stamp leads this line rather than wrapping the header onto a
            second one at 390px. */}
        <span style={{ color: C.bg, background: stampTone, font: `900 8px/1 ${NUM_FONT}`, letterSpacing: '.14em', borderRadius: 5, padding: '3px 6px', marginRight: 7, verticalAlign: '1px' }}>{stamp}</span>
        {g.locked ? `Locked ${new Date(g.lockedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · ${g.snapshots} snapshot${g.snapshots === 1 ? '' : 's'}` : `Locks from ${new Date(g.locksAtUtc).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}, last write before puck drop`}
        {' · '}{g.lineupKnown ? 'lineup posted — dressed skaters only' : 'lineup not posted — full roster'}
        {ctx.oppGaPg != null ? ` · opp allows ${ctx.oppGaPg.toFixed(2)} GA/GP` : ''}{ctx.b2b ? ' · 2nd of back-to-back' : ''}
        {/* The net. Pregame the feed names no starter, so nothing is printed (rule 16); once graded, who started and his line. */}
        {g.net ? ` · in net: ${g.net}` : ''}
        {/* Both clubs' rest; desktop only -- on a phone it wrapped a line and
            pushed the table down, and the REST column already carries it. */}
        {g.spots ? <span className="sm-hide">{` · rest ${game.away.abbrev} ${restWord(g.spots.away) || '—'}, ${game.home.abbrev} ${restWord(g.spots.home) || '—'}`}</span> : null}
      </div>
      {scored.length === 0 ? <EmptyState title="NOBODY SCORED YET" note="No skater on either roster has ten NHL games on file." /> : (
        <LampTable rows={rows} columns={columnsFor(g, onOpenTeam, market)} heatMode="primary"
          rowEdge={(r) => (r.status === 'called' ? C.ice : null)}
          faceOf={(r) => ({ sport: 'nhl', photo: nhlMug(game.season, r._row?.team, r._row?.playerId), name: r._row?.name })}
          dimRow={(r) => g.graded && r._row.dressed === false}
          maxRows={PREVIEW_ROWS} maxHeight={9999}
          onRowClick={(r) => onOpenPlayer?.(r.id)} />
      )}
      {off.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={() => setShowOff((v) => !v)} aria-expanded={showOff} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: C.text3, font: `800 9px/1 ${NUM_FONT}`, letterSpacing: '.1em' }}>
            NOT ON THE BOARD · {off.length} {showOff ? '▴' : '▾'}
          </button>
          {showOff && (
            <div style={{ marginTop: 6, color: C.text3, fontSize: 11, lineHeight: 1.6 }}>
              {off.map((r) => <div key={r.playerId}><b style={{ color: C.text2 }}>{r.name}</b> {r.team} · {r.reason}{g.graded && r.hit ? <span style={{ color: C.lamp, fontFamily: NUM_FONT, marginLeft: 6 }}>scored {r.goals}</span> : null}</div>)}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ── LAMP ANGLES (board filters plan, LAMP 3) ─────────────────────────────
// From fields every board row carries; each rule stated, nothing inferred.
//   Power play     his season's power-play goals > 0 (r.ppg)
//   Soft opponent  GOAL: his opponent's goals allowed per game in tonight's
//                  top third (r.context.oppGaPg); SHOTS: opponent shots
//                  allowed per 60 in the top third (r.legs.oppSaPg)
//   Rested edge    tonight's opponent is on a back-to-back (spots)
//   Big minutes    ice time per game in tonight's top quarter (r.legs.toi)
// NOT BUILT: "Hot" (a goal in his last 3) -- the board rows carry no recent-
// games field, and it is never guessed.
function cut(vals, q) { const v = vals.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) * q)] : Infinity }
function lampAngles(flat, market) {
  const soft = market === 'SOG' ? (r) => r.legs?.oppSaPg : (r) => r.context?.oppGaPg
  const softCut = cut(flat.map(({ r }) => soft(r)), 2 / 3)
  const toiCut = cut(flat.map(({ r }) => r.legs?.toi), 0.75)
  return [
    { key: 'pp', label: 'Power play', title: 'Power-play goals this season (the reports\u2019 season).', test: ({ r }) => Number(r.ppg) > 0 },
    { key: 'soft', label: 'Soft opponent', title: market === 'SOG' ? 'His opponent allows shots per 60 in tonight\u2019s top third.' : 'His opponent allows goals per game in tonight\u2019s top third.', test: ({ r }) => Number.isFinite(soft(r)) && soft(r) >= softCut },
    { key: 'rested', label: 'Rested edge', title: 'Tonight\u2019s opponent is on the second night of a back-to-back.', test: ({ r, g }) => Boolean(spotOf(g, r.team, false)?.b2b) },
    { key: 'mins', label: 'Big minutes', title: 'Ice time per game in tonight\u2019s top quarter.', test: ({ r }) => Number.isFinite(r.legs?.toi) && r.legs.toi >= toiCut },
  ]
}

// ALL GAMES (board filters plan, LAMP 1): every scored skater tonight, one
// table, ranked by score; the game is a column. Sort any header.
function AllGamesTable({ kept, market, onOpenPlayer, onOpenTeam }) {
  const sog = market === 'SOG'
  const rows = [...kept].sort((a, b) => (b.r.score ?? 0) - (a.r.score ?? 0)).map(({ r, g }, i) => ({
    id: r.playerId, rank: i + 1, name: r.name, pos: r.pos, team: r.team, game: `${g.game.away.abbrev}@${g.game.home.abbrev}`,
    score: r.score, spg: r.legs ? r.legs.shotsPg : null, gpg: r.legs ? r.legs.goalsPg : null, toi: r.legs ? r.legs.toi : null,
    osa: r.legs ? r.legs.oppSaPg ?? null : null, status: r.status, _row: r, _g: g,
  }))
  const columns = [
    { key: 'rank', label: '#', heat: false, mono: true, w: 30 },
    { key: 'name', label: 'PLAYER', heat: false, sticky: true, bold: true, w: 160, fmt: (v, r) => <>{v}<span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}`, marginLeft: 6 }}>{r.pos}</span></> },
    { key: 'team', label: 'TM', heat: false, mono: true, w: 40, fmt: (v) => <button type="button" onClick={(e) => { e.stopPropagation(); onOpenTeam?.(v) }} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: C.text2, font: `800 10.5px/1 ${NUM_FONT}` }}>{v}</button> },
    { key: 'game', label: 'GAME', heat: false, mono: true, w: 70 },
    { key: 'score', label: 'SCORE', primary: true, scale: 'seq', domain: [0, 100], w: 50 },
    { key: 'spg', label: 'S/GP', primary: true, dp: 2, w: 44 },
    ...(sog ? [{ key: 'osa', label: 'OPP SA/60', primary: true, dp: 1, w: 62 }] : [{ key: 'gpg', label: 'G/GP', primary: true, dp: 2, w: 44 }]),
    { key: 'toi', label: 'TOI', primary: true, w: 48, fmt: (v) => (Number.isFinite(v) ? fmtSec(v) : '—') },
    { key: 'status', label: 'STATUS', heat: false, w: 90, fmt: (v) => (v === 'called' ? <CalledChip /> : <span style={{ color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.1em' }}>{STATUS[v]}</span>) },
  ]
  return (
    <LampTable rows={rows} columns={columns} heatMode="primary"
      rowEdge={(r) => (r.status === 'called' ? C.ice : null)}
      faceOf={(r) => ({ sport: 'nhl', photo: nhlMug(r._g.game.season, r._row?.team, r._row?.playerId), name: r._row?.name })}
      maxRows={25} maxHeight={9999} onRowClick={(r) => onOpenPlayer?.(r.id)} />
  )
}

export function NavBtn({ children, onClick, disabled, strong = false, ...rest }) {
  return <button type="button" {...rest} onClick={onClick} disabled={disabled} style={{ height: 28, padding: '0 11px', borderRadius: 8, cursor: disabled ? 'default' : 'pointer', border: `1px solid ${strong ? C.ice : C.border2}`, background: strong ? `${C.ice}14` : C.bg2, color: strong ? C.ice : C.text2, font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.04em', opacity: disabled ? .5 : 1 }}>{children}</button>
}
