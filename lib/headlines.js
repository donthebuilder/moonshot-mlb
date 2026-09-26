'use client'
// ── HEADLINES + LIVE SCORES, ONE SOURCE (2026-09-06) ────────────────────────
//
// Donovan: "I wanted those aspects on the header ... maybe even the scoring
// updates across the slate and NFL if possible." So the headline cards the
// front page rolls and the strip the header rolls are built by ONE function
// here, and the live scores both of them carry come from ONE hook here --
// the same MLB schedule call the score rail already makes (lib/boxscore.js,
// 30s cache) and the same ESPN scoreboard TUDDY's live page makes
// (lib/nfl/liveSlate.js). Two surfaces, zero extra requests.
//
// Every headline is a field already on the slate; nothing is computed beyond
// a sort. Order is the order a viewer opens the show for.
import { useEffect, useRef, useState } from 'react'
import { C } from './theme'
import { clean } from './player'
// buildHeadlines() moved to lib/headlinesCore.js on 2026-09-21 so the
// server-rendered /start page can build the same bites without importing
// this file's hooks. Re-exported here, so every existing caller keeps its
// import path and the two surfaces can never name different hitters.
import { buildHeadlines } from './headlinesCore'
import { scheduleFor, slateDay } from './boxscore'
import { fetchLiveSlate } from './liveSlate'
import { fetchNflLive, tdsIn } from './nfl/liveSlate'
import { teamAbbrs } from './gamelogs'

export { buildHeadlines }


// ── live scores, both sports, plus who's actually doing something ──────────
//
// MLB: the league schedule for the slate day, with linescores (30s cache in
// lib/boxscore.js). NFL: ESPN's scoreboard (TUDDY's own cache). Items are
// already strings so the ticker and the crawl can print them as-is; `col`
// says live (green) / final (grey) / pregame (dim).
//
// ── LEADERS RIDE WITH THE SCORE (2026-09-06) ────────────────────────────────
// Donovan: "the bar should show running stat line for tonight's games live
// ... best players and there stat lines. games live scoring and final with
// two players best stat line ... for best caterogy." A score alone answers
// "who's ahead"; it doesn't answer "who's doing it" — so every score item now
// carries up to two LEADER items right behind it, one per top performer in
// that game, picked by whichever category he's actually winning (homers beat
// total bases beat RBI beat runs for a hitter; touchdowns beat yards for a
// skill player).
//
// MLB LEADERS COST A REAL REQUEST. lib/liveSlate.js's fetchLiveSlate() is the
// module cache MiniWire / At the Plate / Boxes already poll — its own header
// comment says it is "never polled in the background... fired only when the
// user asks." The header is mounted on every tab, so calling it here makes
// that poll effectively always-on. Called WITHOUT {force}, so a warm cache
// (another mounted component already asked) costs nothing; a cold one still
// costs one schedule + one boxscore per started game, on this hook's own
// clock. That is a real, deliberate change to that file's cost model, not an
// accident — flagged here so the next person reading this file's git blame
// finds the reasoning, not just the diff.
//
// NFL LEADERS ARE FREE. fetchNflLive() was already polled here before this
// change; its snapshot already carries a box-score line per player in every
// LIVE game (lib/nfl/liveSlate.js). Only fetched while `state === 'in'`,
// so a game that has gone final loses its box lines on the next poll — an
// NFL final shows the score but not (yet) its stat-line leaders. Backfilling
// that needs lib/nfl/liveSlate.js to keep fetching a just-finished game's
// summary for one more cycle, which is a change to shared alert-critical
// code, not this file — left as a known gap rather than guessed at.
const inn = (g) => (g.inning ? `${/top/i.test(g.inningState) ? '▲' : '▼'}${g.inning}` : '')
const lastName = (s) => String(s || '').trim().split(/\s+/).pop() || ''

// "2-4, HR, 3 RBI" — AB/H first (did he even play), then whatever's actually
// worth bragging about. A 0-4 still says so; nothing extra tacked onto a
// walk-only night, because there's nothing there to lead with.
const mlbLine = (l) => {
  const bits = [`${l.h}-${l.ab}`]
  if (l.hr) bits.push(`${l.hr}HR`)
  else if (l.d3) bits.push('3B')
  else if (l.d2) bits.push('2B')
  if (l.rbi) bits.push(`${l.rbi}RBI`)
  return bits.join(' ')
}
const mlbRank = (l) => l.hr * 100 + l.tb * 10 + l.rbi * 3 + l.r
function mlbLeaders(lines, pk) {
  const rows = Object.values(lines || {}).filter((l) => l.pk === pk && l.ab > 0)
  rows.sort((a, b) => mlbRank(b) - mlbRank(a))
  return rows.slice(0, 2)
}

const nflLine = (l) => {
  const bits = []
  const tds = tdsIn(l)
  if (tds) bits.push(`${tds}TD`)
  if (l.receiving_yards) bits.push(`${l.receiving_yards} rec yd`)
  if (l.rushing_yards) bits.push(`${l.rushing_yards} rush yd`)
  if (l.passing_yards) bits.push(`${l.passing_yards} pass yd`)
  return bits.join(' · ') || '—'
}
const nflRank = (l) => tdsIn(l) * 100 + (l.receiving_yards || 0) + (l.rushing_yards || 0) + (l.passing_yards || 0) / 2
function nflLeaders(lines, gameId) {
  const rows = [...(lines || new Map()).values()].filter((l) => l.game_id === gameId && nflRank(l) > 0)
  rows.sort((a, b) => nflRank(b) - nflRank(a))
  return rows.slice(0, 2)
}

export function useLiveScores({ nfl = true, nhl = true } = {}) {
  const [mlb, setMlb] = useState([])
  // LAST NIGHT, UNTIL TONIGHT SHOWS UP (2026-09-06). Donovan: "the bar
  // should show ... last night's as well until the next games start." Only
  // fetched while tonight's slate has nothing live or final yet — once one
  // real game today shows up, this stops asking and yesterday drops off.
  const [mlbYday, setMlbYday] = useState([])
  const [mlbLines, setMlbLines] = useState({})
  // TEAM ABBREVIATIONS, SEPARATELY (2026-09-06, Donovan: "where are the
  // games"). scheduleFor()'s raw MLB payload carries team.id but NOT
  // team.abbreviation -- verified live against the endpoint. This loop's
  // own `if (!g.away.abbr...) continue` guard below was therefore
  // dropping every single MLB game, live or final -- the header ticker
  // has never actually shown an MLB score since it was built. One
  // cached, fetch-once lookup (lib/gamelogs.js already solved the exact
  // same gap for gameLog opponents) fills it in without touching
  // scheduleFor() itself, which other callers already use by team name.
  const [abbrs, setAbbrs] = useState({})
  const [nflGames, setNfl] = useState([])
  const [nflLines, setNflLines] = useState(new Map())
  // NHL SCORES ON EVERY TICKER (2026-09-26, Donovan: yes -- shell-parity
  // step 1b). LAMP's own /api/lamp/scores, CDN-cached 15 s, polled once a
  // minute like the NFL snapshot. LAMP's own header passes nhl:false and
  // draws its hockey pills itself.
  const [nhlGames, setNhl] = useState([])
  useEffect(() => {
    let alive = true
    const pullMlb = () => scheduleFor(slateDay(0)).then((g) => { if (alive && Array.isArray(g)) setMlb(g) }).catch(() => {})
    const pullYday = () => scheduleFor(slateDay(-1)).then((g) => { if (alive && Array.isArray(g)) setMlbYday(g) }).catch(() => {})
    const pullLines = () => fetchLiveSlate().then((snap) => { if (alive && snap) setMlbLines(snap.lines || {}) }).catch(() => {})
    const pullNfl = () => (nfl ? fetchNflLive().then((s) => { if (alive && s?.games) { setNfl(s.games); setNflLines(s.lines || new Map()) } }).catch(() => {}) : null)
    teamAbbrs().then((a) => { if (alive && a) setAbbrs(a) }).catch(() => {})
    const pullNhl = () => (nhl ? fetch('/api/lamp/scores').then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && Array.isArray(d?.games)) setNhl(d.games) }).catch(() => {}) : null)
    pullMlb(); pullYday(); pullLines(); pullNfl(); pullNhl()
    const a = setInterval(pullMlb, 30_000)
    const y = setInterval(pullYday, 60_000)
    // A 2-MINUTE SNAPSHOT, NOT A LIVE POLL (2026-09-06). Donovan, after
    // hearing this makes fetchLiveSlate() effectively always-on sitewide:
    // "it can [be] a 2min snapshot or something if [the] api pull is the
    // issue." 20s matched the live board's own cadence; the header doesn't
    // need pitch-by-pitch, it needs "who's doing something right now," so
    // this backs off to 120s -- a sixth of the request volume for a stat
    // line nobody needed to the second.
    const c = setInterval(pullLines, 120_000)
    const b = setInterval(pullNfl, 60_000)
    const h = setInterval(pullNhl, 60_000)
    return () => { alive = false; clearInterval(a); clearInterval(y); clearInterval(c); clearInterval(b); clearInterval(h) }
  }, [nfl, nhl])

  const items = []
  const anyTonight = mlb.some((g) => g.live || g.final)
  const mlbSet = anyTonight ? mlb : [...mlb, ...mlbYday]
  const abbrOf = (side) => side?.abbr || abbrs[side?.id] || ''
  for (const g of mlbSet) {
    const awayAbbr = abbrOf(g?.away)
    const homeAbbr = abbrOf(g?.home)
    if (!awayAbbr || !homeAbbr) continue
    const isYday = !anyTonight && !mlb.includes(g)
    if (g.live) {
      items.push({ k: `mlb-${g.pk}`, kind: 'score', sport: 'mlb', icon: '⚾', text: `${awayAbbr} ${g.away.score ?? 0} – ${g.home.score ?? 0} ${homeAbbr}`, sub: inn(g), col: C.green, live: true, nav: 'scoreboard' })
      for (const l of mlbLeaders(mlbLines, g.pk)) items.push({ k: `mlb-${g.pk}-${l.name}`, kind: 'leader', sport: 'mlb', icon: '🧢', text: mlbLine(l), sub: lastName(l.name), col: C.text, live: true, nav: 'scoreboard' })
    } else if (g.final) {
      items.push({ k: `mlb-${g.pk}`, kind: 'score', sport: 'mlb', icon: '⚾', text: `${awayAbbr} ${g.away.score ?? 0} – ${g.home.score ?? 0} ${homeAbbr}`, sub: isYday ? 'last night' : 'F', col: C.text3, nav: 'scoreboard' })
      for (const l of mlbLeaders(mlbLines, g.pk)) items.push({ k: `mlb-${g.pk}-${l.name}`, kind: 'leader', sport: 'mlb', icon: '🧢', text: mlbLine(l), sub: lastName(l.name), col: C.text3, nav: 'scoreboard' })
    } else if (!isYday && g.startTime) {
      const t = new Date(g.startTime)
      if (Number.isFinite(t.getTime())) items.push({ k: `mlb-${g.pk}`, kind: 'score', sport: 'mlb', icon: '⚾', text: `${awayAbbr} @ ${homeAbbr}`, sub: t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), col: C.text3, pregame: true, nav: 'scoreboard' })
    }
  }
  for (const g of nflGames) {
    if (!g?.away || !g?.home) continue
    if (g.state === 'in') {
      items.push({ k: `nfl-${g.game_id}`, kind: 'score', sport: 'nfl', icon: '🏈', text: `${g.away} ${g.away_score ?? 0} – ${g.home_score ?? 0} ${g.home}`, sub: `${g.period ? `Q${g.period}` : ''}${g.clock ? ` ${g.clock}` : ''}`.trim(), col: C.green, live: true })
      for (const l of nflLeaders(nflLines, g.game_id)) items.push({ k: `nfl-${g.game_id}-${l.name}`, kind: 'leader', sport: 'nfl', icon: '🏈', text: nflLine(l), sub: lastName(l.name), col: C.text, live: true, nav: 'nfl' })
    } else if (g.state === 'post') {
      items.push({ k: `nfl-${g.game_id}`, kind: 'score', sport: 'nfl', icon: '🏈', text: `${g.away} ${g.away_score ?? 0} – ${g.home_score ?? 0} ${g.home}`, sub: 'F', col: C.text3 })
      for (const l of nflLeaders(nflLines, g.game_id)) items.push({ k: `nfl-${g.game_id}-${l.name}`, kind: 'leader', sport: 'nfl', icon: '🏈', text: nflLine(l), sub: lastName(l.name), col: C.text3, nav: 'nfl' })
    } else if (g.state === 'pre' && g.kickoff) {
      // THE MISSING NFL PREGAME BANNER (2026-09-16). MLB's branch above
      // (see the `else if (!isYday && g.startTime)` case) has always shown
      // an upcoming "AWAY @ HOME, kickoff time" pill even before first
      // pitch. NFL had no equivalent -- only 'in' and 'post' were handled --
      // so on any day between weeks (every day but game day, this week's
      // slate not live or final yet) TUDDY's ticker carried zero game
      // pills at all while MOONSHOT's kept showing MLB's. Donovan, side by
      // side: "the banners with the games ... not synced nor do they look
      // the same." They were not synced because one side had a pregame
      // state and the other silently dropped it. Same shape MLB's pregame
      // pill uses, minus `nav` -- the 'in'/'post' NFL branches above never
      // set one either, so this stays consistent with them rather than
      // copying MLB's own `nav: 'scoreboard'`.
      const t = new Date(g.kickoff)
      if (Number.isFinite(t.getTime())) items.push({ k: `nfl-${g.game_id}`, kind: 'score', sport: 'nfl', icon: '🏈', text: `${g.away} @ ${g.home}`, sub: t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), col: C.text3, pregame: true })
    }
  }
  // Hockey, in the same shape. A tap opens LAMP's Scores (`hash`): each
  // shell treats a hash naming another sport as a switch, and the tab rides
  // along. Fields: /api/lamp/scores games[] state, abbrevs, score,
  // periodLabel, clock, startUtc.
  for (const g of nhlGames) {
    const a = g?.away?.abbrev; const h = g?.home?.abbrev
    if (!a || !h) continue
    const base = { k: `nhl-${g.id}`, kind: 'score', sport: 'nhl', icon: '🏒', hash: 'sport=nhl&tab=scores' }
    if (g.state === 'live') items.push({ ...base, text: `${a} ${g.away.score ?? 0} – ${g.home.score ?? 0} ${h}`, sub: `${g.periodLabel || ''} ${g.clock || ''}`.trim(), col: C.green, live: true, title: 'Live on LAMP — tap to open LAMP’s scores' })
    else if (g.state === 'final') items.push({ ...base, text: `${a} ${g.away.score ?? 0} – ${g.home.score ?? 0} ${h}`, sub: 'F', col: C.text3, title: 'Final — tap to open LAMP’s scores' })
    else if (g.state === 'pre' && g.startUtc) {
      const t = new Date(g.startUtc)
      if (Number.isFinite(t.getTime())) items.push({ ...base, text: `${a} @ ${h}`, sub: t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), col: C.text3, pregame: true, title: 'Not underway yet — tap to open LAMP’s scores' })
    }
  }
  return { items, mlb: mlbSet, nfl: nflGames, nhl: nhlGames }
}

// The next first pitch, live: which game, when, and how long until it. Once
// everything has started it says so and names the last one to go.
export function nextPitch(games = [], now = Date.now()) {
  const list = games.map((g) => ({ g, t: new Date(g.game_time || g.startTime || 0).getTime() })).filter((x) => x.t > 0).sort((a, b) => a.t - b.t)
  if (!list.length) return null
  const up = list.find((x) => x.t > now)
  if (up) return { kind: 'next', at: new Date(up.t), ms: up.t - now, label: `${clean(up.g.away, '')} @ ${clean(up.g.home, '')}`.trim(), remaining: list.filter((x) => x.t > now).length }
  const last = list[list.length - 1]
  return { kind: 'all', at: new Date(last.t), ms: 0, label: `${clean(last.g.away, '')} @ ${clean(last.g.home, '')}`.trim(), remaining: 0 }
}

export function fmtCountdown(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}

// ── SELF-MOVING AND SCROLLABLE (2026-09-06) ─────────────────────────────────
// A CSS translateX loop cannot be scrolled by hand -- the track is painted
// inside an overflow:hidden box. Donovan: "make it so you can scroll it too
// along with it moving on its own." So the motion is scrollLeft, driven by
// requestAnimationFrame at a steady px/s; the strip renders its set twice and
// wraps scrollLeft when it passes the first copy, so both the motion and a
// thumb-drag or wheel land on the same seamless loop. Motion pauses while
// the pointer is over it or a finger is on it, and for ~2.5s after a manual
// scroll so it does not fight you; reduced-motion users get no motion at all.
export function useAutoScroll(ref, { speed = 22, paused = false } = {}) {
  const idle = useRef(0)
  useEffect(() => {
    // READ ref.current FRESH EVERY FRAME, NOT ONCE AT SETUP (2026-09-06).
    // Donovan: the header's ticker never moved on its own at all, while
    // Home's headline strip (same hook) moved, just slowly. The bug: this
    // effect used to grab `el = ref.current` ONCE and bail for good if it
    // was null. Scorebug calls this hook BEFORE its own `if (!stats) return
    // <span>loading the slate…</span>` -- so on Scorebug's very first
    // render, before the slate payload has arrived, the ticker <div> this
    // ref points to hasn't mounted yet, `ref.current` is null, and the
    // effect returned immediately WITHOUT starting the animation loop.
    // React does not re-run an effect just because `ref.current` later
    // changed (only `ref`, `speed`, `paused` are dependencies, and the ref
    // OBJECT never changes) -- so once that one look came up empty, the
    // ticker was never going to move, for the rest of the page's life. The
    // headline strip on Home dodges this by dumb luck: by the time it
    // mounts, `players`/`results` are usually already loaded, so its ref is
    // already attached the one time this effect runs. Fix: don't cache `el`
    // outside the loop -- look up `ref.current` fresh on every animation
    // frame, so whenever the element actually shows up, the very next frame
    // picks it up and starts scrolling.
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let raf = 0, last = 0, hold = false, bound = null
    const onScroll = () => { idle.current = Date.now() + 2500 }   // a manual scroll parks the motion briefly
    const enter = () => { hold = true }
    const leave = () => { hold = false }
    const onTouchEnd = () => { hold = false; idle.current = Date.now() + 2500 }
    // The element behind the ref can change (Scorebug swaps in its real
    // <div> once the loading state clears) -- (de)register listeners on
    // whichever one is actually live instead of on a stale, detached node.
    const attach = (el) => {
      if (bound === el) return
      if (bound) {
        bound.removeEventListener('wheel', onScroll)
        bound.removeEventListener('touchstart', enter)
        bound.removeEventListener('touchend', onTouchEnd)
        bound.removeEventListener('mouseenter', enter)
        bound.removeEventListener('mouseleave', leave)
      }
      bound = el
      if (el) {
        el.addEventListener('wheel', onScroll, { passive: true })
        el.addEventListener('touchstart', enter, { passive: true })
        el.addEventListener('touchend', onTouchEnd, { passive: true })
        el.addEventListener('mouseenter', enter)
        el.addEventListener('mouseleave', leave)
      }
    }
    const step = (t) => {
      raf = requestAnimationFrame(step)
      const el = ref.current
      attach(el)
      if (!el) { last = 0; return }
      if (!last) { last = t; return }
      const dt = Math.min(64, t - last); last = t
      if (reduce || paused || hold || Date.now() < idle.current) return
      const half = el.scrollWidth / 2
      if (half <= el.clientWidth) return                      // everything fits: nothing to roll
      let next = el.scrollLeft + (speed * dt) / 1000
      if (next >= half) next -= half
      el.scrollLeft = next
    }
    raf = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(raf); attach(null) }
  }, [ref, speed, paused])
}
