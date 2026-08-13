'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { nameOf, teamOf, oppOf, clean, n, hrScore } from '../../lib/player'
import { fetchLiveSlate } from '../../lib/liveSlate'
import { teamAbbrs } from '../../lib/gamelogs'
import {
  fetchLiveGame, parseLiveGame, atBatOf, priorPAs, timesFacing, arsenalTonight,
  pitchColor, PITCH_NAMES, KIND_WORD,
} from '../../lib/livePitches'
import { Empty, Band } from '../ui'
import LiveAtBats from '../LiveAtBats'
import BattedBallLog from '../BattedBallLog'
import JustNow from '../JustNow'
import ZoneMap from '../ZoneMap'
import SprayField from '../SprayField'

// 🎤 AT THE PLATE — the live batter's room.
//
// WHAT THIS ANSWERS: the man batting RIGHT NOW — where he does damage in the
// zone against this arm, where tonight's pitches have actually gone, and where
// the ball is leaving the bat — while the pitch is still in the pitcher's
// hand. And then: who's coming after him.
//
// 2026-08-10 rebuild (Donovan: "there's no way to just use the spray and
// strike map we already have as the live ones as well? ... also maybe be able
// to look at other players in the game who are coming up. but visually it
// looks bad"). Three changes:
//
//   1. ONE VISUAL LANGUAGE. The standalone live plot is gone. The live feed is
//      parsed once in lib/livePitches and handed to the SAME ZoneMap and
//      SprayField the player card uses, which now draw tonight's dots on their
//      own grid and their own field.
//   2. THE WHOLE LINEUP. On deck, in the hole, and the rest of the batting
//      order as the boxscore actually has it, each with his slate score and
//      his line tonight. Tap any of them and the two charts follow him —
//      without leaving the page.
//   3. LAYOUT. Labelled sections, one card treatment, room to breathe.
//
// 2026-08-09 — THE AT-BAT ITSELF (Donovan: "build this into the best thing
// smoking"). The page knew WHO was up and could draw where his night's contact
// went. It could not tell you what was happening in the at-bat you were
// watching: no count, no pitch sequence, no idea whether he was ahead 3-1 or
// buried 0-2. That is the only information here with a shelf life measured in
// seconds, and it was the piece that was missing.
//
// Now the hero card carries the live count, every pitch of the at-bat in order
// with its type / velocity / outcome, how many times he has faced this arm
// tonight, what he did in his earlier trips, and the arm's ACTUAL mix this
// game. All of it derived in lib/livePitches from the feed already verified
// for the dots — the count is walked from the pitch sequence rather than read
// off a separate object, so it cannot disagree with the pitches beside it.
//
// Only possible since 2026-08-09: the schedule `fields` whitelist had been
// stripping `offense.batter` out of every response, so "who's up" was null
// league-wide.

const primaryRole = (p) => String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()

// ── 🎬 THE AT-BAT (2026-08-09) ───────────────────────────────────────────────
//
// Donovan: "build the At the Plate page into the best thing smoking."
//
// The page could already tell you WHO was up and draw where his night's
// contact went. It could not tell you what was happening in the at-bat you
// were watching — no count, no pitch sequence, no idea whether he was ahead
// 3-1 or down 0-2. That is the only information on this page with a shelf
// life measured in seconds, and it was the one piece missing.
//
// Everything here is derived in lib/livePitches from the same verified feed
// the dots come from. The count especially: it is WALKED from the pitch
// sequence rather than read off a separate `count` object, so it can never
// disagree with the pitches drawn beside it.

const COUNT_COL = (b, s) => (b > s ? '#4ade80' : s > b ? '#f87171' : C.text2)

function CountDots({ balls, strikes }) {
  const dot = (on, col) => ({
    width: 9, height: 9, borderRadius: '50%',
    background: on ? col : 'transparent',
    border: `1.5px solid ${on ? col : 'rgba(255,255,255,.22)'}`,
    boxShadow: on ? `0 0 7px ${col}80` : 'none',
  })
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}
      title={`The count, walked from tonight's pitch sequence: ${balls} ball${balls === 1 ? '' : 's'}, ${strikes} strike${strikes === 1 ? '' : 's'}.`}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <span style={{ fontSize: 7.5, color: C.text3, fontFamily: NUM_FONT, letterSpacing: '.08em', width: 8 }}>B</span>
        {[0, 1, 2].map((i) => <span key={i} style={dot(i < balls, '#4ade80')} />)}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <span style={{ fontSize: 7.5, color: C.text3, fontFamily: NUM_FONT, letterSpacing: '.08em', width: 8 }}>S</span>
        {[0, 1].map((i) => <span key={i} style={dot(i < strikes, '#f87171')} />)}
      </div>
      <span style={{
        fontFamily: NUM_FONT, fontSize: 17, fontWeight: 900, letterSpacing: '-.02em',
        color: COUNT_COL(balls, strikes), marginLeft: 2,
      }}>{balls}–{strikes}</span>
    </div>
  )
}

/**
 * The pitch sequence, in order, as pills. Colour is the pitch type (the same
 * map the zone map and spray chart use, so a slider is the same cyan
 * everywhere); the ring says what the pitch DID.
 */
function Sequence({ pitches }) {
  if (!pitches?.length) return null
  return (
    <div className="atplate-seq" style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'stretch' }}>
      {pitches.map((p, i) => {
        const col = pitchColor(p.type)
        const missed = p.kind === 'whiff'
        const took = p.kind === 'ball'
        return (
          <div key={i}
            title={`Pitch ${p.seq} of the at-bat, on ${p.cnt}. ${PITCH_NAMES[p.type] || p.typeName || p.type || 'pitch'}${p.velo != null ? ` at ${p.velo.toFixed(1)} mph` : ''} — ${p.call || KIND_WORD[p.kind] || p.kind}.`}
            style={{
              minWidth: 54, cursor: 'help',
              border: `1px solid ${missed ? '#f87171' : took ? 'rgba(255,255,255,.14)' : `${col}66`}`,
              background: missed ? 'rgba(248,113,113,.12)' : `${col}12`,
              borderRadius: 9, padding: '4px 8px 5px', textAlign: 'center',
            }}>
            <div style={{ fontSize: 7.5, color: C.text3, fontFamily: NUM_FONT, lineHeight: 1.2 }}>
              {p.seq} · {p.cnt}
            </div>
            <div style={{ fontSize: 11, fontWeight: 900, color: col, fontFamily: NUM_FONT, lineHeight: 1.25 }}>
              {p.type || '—'}
            </div>
            <div style={{ fontSize: 8.5, color: C.text2, fontFamily: NUM_FONT, lineHeight: 1.25 }}>
              {p.velo != null ? p.velo.toFixed(0) : '·'}
            </div>
            <div style={{
              fontSize: 7.5, lineHeight: 1.25, whiteSpace: 'nowrap',
              color: missed ? '#f87171' : took ? '#4ade80' : C.text3,
            }}>{KIND_WORD[p.kind] === 'swing & miss' ? 'whiff' : KIND_WORD[p.kind] || p.kind}</div>
          </div>
        )
      })}
    </div>
  )
}

/** What this arm has actually thrown tonight — live, not a season table. */
function Arsenal({ rows, pitcherName }) {
  if (!rows?.length) return null
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontSize: 8, color: C.text3, fontFamily: NUM_FONT, letterSpacing: '.07em', textTransform: 'uppercase' }}>
        Tonight&apos;s mix
      </span>
      {rows.slice(0, 6).map((r) => (
        <span key={r.code}
          title={`${pitcherName || 'He'} has thrown ${r.n} ${PITCH_NAMES[r.code] || r.code}${r.n === 1 ? '' : 's'} tonight — ${r.pct.toFixed(0)}% of his pitches${r.velo != null ? `, averaging ${r.velo.toFixed(1)} mph` : ''}${r.swings ? `. ${r.whiffs} whiff${r.whiffs === 1 ? '' : 's'} on ${r.swings} swing${r.swings === 1 ? '' : 's'}` : ''}. Counted from this game only.`}
          style={{
            fontSize: 9, fontFamily: NUM_FONT, cursor: 'help', whiteSpace: 'nowrap',
            color: pitchColor(r.code), border: `1px solid ${pitchColor(r.code)}44`,
            background: `${pitchColor(r.code)}10`, borderRadius: 999, padding: '1px 8px',
          }}>
          {PITCH_NAMES[r.code] || r.code} <b>{r.pct.toFixed(0)}%</b>
          {r.velo != null && <span style={{ color: C.text3 }}> {r.velo.toFixed(0)}</span>}
        </span>
      ))}
    </div>
  )
}

/** Every arm that's thrown tonight, in the order each one took the mound —
 * so "starter" is always first and each new arrival reads left to right in
 * the order it actually happened. Picking one points the mix line below (and
 * the zone map's live dots, for whoever's selected) at that specific pitcher
 * instead of whoever's live right now — the only way to compare a reliever's
 * stuff to what the starter was throwing two innings ago.
 * 2026-08-13, Donovan: "pitchers toggle able like strike and szone... so we
 * can see wherer the pitcher is[,] and if there['s] mult[iple] pitcher[s]...
 * make able to view those aswell." Hidden entirely on a one-pitcher game —
 * nothing new to look at yet, so nothing new on screen. */
function PitcherChips({ pitchers, viewId, onPick }) {
  if (pitchers.length < 2) return null
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
      <span style={{ fontSize: 8, color: C.text3, fontFamily: NUM_FONT, letterSpacing: '.07em', textTransform: 'uppercase' }}>
        Pitchers tonight
      </span>
      {pitchers.map((p) => {
        const on = viewId ? viewId === p.id : p.live
        return (
          <button key={p.id} onClick={() => onPick(viewId === p.id ? null : p.id)}
            title={`${p.name} — ${p.n} tracked pitch${p.n === 1 ? '' : 'es'} tonight${p.live ? '. Currently on the mound.' : '. No longer in the game — tap to view his night.'}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
              fontSize: 9.5, fontFamily: NUM_FONT, fontWeight: 800,
              border: `1px solid ${on ? '#4ade80' : C.border}`,
              background: on ? 'rgba(74,222,128,.12)' : 'rgba(255,255,255,.02)',
              color: on ? '#4ade80' : C.text2,
              borderRadius: 999, padding: '3px 10px',
            }}>
            {p.live && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 5px #4ade80', flexShrink: 0 }} />}
            {String(p.name || '?').split(' ').slice(-1)[0]}
            <span style={{ color: on ? '#4ade80' : C.text3, fontWeight: 700 }}>{p.n}p</span>
          </button>
        )
      })}
    </div>
  )
}

const ROLE_COLOR = { TOP: '#FCD34D', HR: '#FB923C', HIT: '#60A5FA', HRR: '#22d3ee', CONTACT: '#A78BFA' }
const LIVE = '#4ade80'

const CARD = {
  background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.025))`,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  padding: '13px 15px',
  marginBottom: 14,
}
const LABEL = {
  fontSize: 8.5, fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase',
  color: C.text3, fontFamily: NUM_FONT,
}

export default function AtThePlate({ players = [], watchIds, mode = 'today', slateMode, onPlayerClick }) {
  const [snap, setSnap] = useState(null)
  // Team abbreviations for the box score header. One cached /teams call,
  // shared with the timeline that already uses it.
  const [abbrs, setAbbrs] = useState(null)
  useEffect(() => { let a = true; teamAbbrs().then((m) => { if (a && m) setAbbrs(m) }).catch(() => {}); return () => { a = false } }, [])
  const [pinnedGame, setPinnedGame] = useState(null)   // gamePk the user locked onto
  const [pinnedHitter, setPinnedHitter] = useState(null)   // mlb id driving the charts
  // 2026-08-13, Donovan: Pick a game "needs to be different... a drop down
  // type thing." A row of N full buttons scaled badly — eight live games
  // meant eight buttons competing with the room below for attention.
  // Collapsed to the current pick + a toggle, same pattern as the Games
  // page legend: the full list is a tap away, not permanently on screen.
  const [gamePickerOpen, setGamePickerOpen] = useState(false)
  const [auto, setAuto] = useState(true)
  const [feed, setFeed] = useState(undefined)   // undefined = loading, null = failed
  const timer = useRef(null)
  const feedTimer = useRef(null)

  const isTomorrow = mode === 'tomorrow'

  const pullSlate = async (force = false) => {
    // The shared 15s snapshot cache in lib/liveSlate.js collapses this against
    // MiniWire, which is mounted right above this tab and pulls the identical
    // schedule + boxscores. `force` is for the user's own refresh button.
    const s = await fetchLiveSlate({ force })
    if (s) setSnap(s)
  }
  useEffect(() => {
    if (isTomorrow) return undefined
    pullSlate()
    clearInterval(timer.current)
    // 25s: an at-bat runs ~3-4 minutes, so this lands inside it comfortably
    // while a hidden tab does nothing.
    if (auto) timer.current = setInterval(() => { if (!document.hidden) pullSlate() }, 25000)
    return () => clearInterval(timer.current)
  }, [auto, isTomorrow])

  const byId = useMemo(
    () => new Map(players.map((p) => [Number(p?.player_id ?? p?.id), p])),
    [players],
  )

  // every live game that has somebody at the plate, joined back to the slate
  const liveGames = useMemo(() => {
    if (!snap?.games) return []
    return snap.games
      .filter((g) => g.state === 'Live' && g.upBatter)
      .map((g) => {
        const p = byId.get(Number(g.upBatter)) || null
        return {
          g,
          p,
          pk: g.pk,
          pid: Number(g.upBatter),
          name: p ? nameOf(p) : clean(g.upBatterName, `#${g.upBatter}`),
          role: p ? primaryRole(p) : '',
          watched: p ? watchIds?.has(`${clean(p?.player_id || p?.id, '')}-${clean(p?.game_pk || p?.team, '')}`) : false,
        }
      })
      // your skin first: picks, then watchlist, then everyone else
      .sort((a, b) => (b.role ? 2 : 0) + (b.watched ? 1 : 0) - ((a.role ? 2 : 0) + (a.watched ? 1 : 0)))
  }, [snap, byId, watchIds])

  const active = useMemo(() => {
    if (pinnedGame) {
      const hit = liveGames.find((x) => x.pk === pinnedGame)
      if (hit) return hit
    }
    return liveGames[0] || null
  }, [liveGames, pinnedGame])

  const gamePk = active?.pk || null

  // ── the live feed for the one game on screen ──────────────────────────────
  // One call, one parse, both charts. Scoped to this game only, refreshed on
  // the same cadence as the slate and only while the tab is visible.
  const pullFeed = async (pk) => {
    if (!pk) return
    const j = await fetchLiveGame(pk)
    setFeed(j ? parseLiveGame(j) : null)
  }
  useEffect(() => {
    setFeed(undefined)
    if (!gamePk) return undefined
    pullFeed(gamePk)
    clearInterval(feedTimer.current)
    // 15s, not 25 (2026-08-09). A pitch is thrown roughly every twenty
    // seconds, so a 25-second poll could miss one entirely and show a count
    // that jumped two — which on a live sequence reads as a broken panel.
    // This is ONE game's feed, not the whole slate, so the cost is one
    // request; the slate poll above stays at 25s and shares its snapshot with
    // MiniWire through the cache in lib/liveSlate.
    if (auto) feedTimer.current = setInterval(() => { if (!document.hidden) pullFeed(gamePk) }, 15000)
    return () => clearInterval(feedTimer.current)
  }, [gamePk, auto])

  // the current batter of the selected game resets the hitter selection
  useEffect(() => { setPinnedHitter(null) }, [gamePk])

  const refresh = () => { pullSlate(true); pullFeed(gamePk) }

  // ── the batting order, as the boxscore has it right now ───────────────────
  const lineup = useMemo(() => {
    const g = active?.g
    if (!g?.lineup) return []
    const sides = ['away', 'home']
    // Which side is hitting: the one whose lineup contains the man at the
    // plate. Derived rather than inferred from inningState, which says
    // "Middle" between halves and would name the wrong dugout.
    const side = sides.find((s) => (g.lineup[s] || []).some((r) => Number(r.id) === Number(g.upBatter)))
      || sides.find((s) => (g.lineup[s] || []).length && (s === 'away' ? g.awayId : g.homeId) === g.battingTeamId)
      || null
    if (!side) return []
    return (g.lineup[side] || []).map((r) => {
      const p = byId.get(Number(r.id)) || null
      return {
        ...r,
        p,
        name: p ? nameOf(p) : clean(r.name, `#${r.id}`),
        role: p ? primaryRole(p) : '',
        score: p ? hrScore(p) : null,
        line: snap?.lines?.[Number(r.id)] || null,
        isUp: Number(r.id) === Number(g.upBatter),
        isDeck: Number(r.id) === Number(g.onDeck),
        isHole: Number(r.id) === Number(g.inHole),
      }
    })
  }, [active, byId, snap])

  // Who the charts are pointed at: the pinned hitter if he's still in this
  // game, otherwise whoever is at the plate.
  const selectedId = useMemo(() => {
    if (pinnedHitter && lineup.some((r) => Number(r.id) === pinnedHitter)) return pinnedHitter
    return active?.pid || null
  }, [pinnedHitter, lineup, active])

  const selected = useMemo(
    () => lineup.find((r) => Number(r.id) === Number(selectedId)) || null,
    [lineup, selectedId],
  )
  const selP = selected?.p || (Number(selectedId) === active?.pid ? active?.p : null) || null
  const selName = selected?.name || active?.name || ''
  const selLine = snap?.lines?.[Number(selectedId)] || null

  // The plate appearance on screen — the count, the sequence, who's throwing.
  // Derived for whoever is SELECTED, so tapping a man in the on-deck circle
  // shows his last at-bat rather than blanking the panel.
  const atBat = useMemo(() => atBatOf(feed, selectedId), [feed, selectedId])
  const prior = useMemo(
    () => priorPAs(feed, selectedId, atBat?.pi ?? Infinity),
    [feed, selectedId, atBat],
  )
  const facing = useMemo(
    () => timesFacing(feed, selectedId, atBat?.pitcherId),
    [feed, selectedId, atBat],
  )

  // ── EVERY ARM THAT'S THROWN TONIGHT (2026-08-13) ─────────────────────────
  // Donovan: "pitchers toggle able... so we can see where the pitcher is, and
  // if there's mult[iple] pitcher[s]... make able to view those as well."
  // feed.pitches is already every tracked pitch of the game, in game order —
  // no new fetch, just grouped by who threw it. The LAST pitch in that array
  // is whoever is live right now (plays arrive in game order), which is a
  // sturdier answer than the slate's pregame pitcher_name after a change.
  const pitchersTonight = useMemo(() => {
    const pitches = feed?.pitches || []
    if (!pitches.length) return []
    const order = []
    const byPid = new Map()
    pitches.forEach((p) => {
      const pid = Number(p.pitcherId)
      if (!pid) return
      if (!byPid.has(pid)) { byPid.set(pid, { id: pid, name: p.pitcherName, n: 0 }); order.push(pid) }
      byPid.get(pid).n += 1
    })
    const liveId = Number(pitches[pitches.length - 1]?.pitcherId) || null
    return order.map((pid) => ({ ...byPid.get(pid), live: pid === liveId }))
  }, [feed])
  const [viewPitcherId, setViewPitcherId] = useState(null)
  // a pin from a pitcher who's since left the game, or a switch to a new
  // game entirely, both fall back to "whoever's actually live" rather than
  // silently pointing at a stale id
  useEffect(() => { setViewPitcherId(null) }, [gamePk])
  const viewPitcher = viewPitcherId && pitchersTonight.some((x) => x.id === viewPitcherId)
    ? viewPitcherId
    : null

  const arsenal = useMemo(
    () => arsenalTonight(feed, viewPitcher || atBat?.pitcherId),
    [feed, viewPitcher, atBat],
  )

  const livePitchesFor = useMemo(() => {
    const mine = (feed?.pitches || []).filter((p) => Number(p.batterId) === Number(selectedId))
    // Default is unchanged — every pitch he's seen tonight, any arm. Only
    // narrows once a specific pitcher chip is picked, so a pitching change
    // never quietly shrinks the map for someone who hasn't touched a chip.
    return viewPitcher ? mine.filter((p) => Number(p.pitcherId) === Number(viewPitcher)) : mine
  }, [feed, selectedId, viewPitcher])
  // memoized so the spray chart isn't handed a fresh array every render
  const liveBalls = useMemo(() => feed?.balls || [], [feed])

  if (isTomorrow) {
    return <Empty text="At the Plate is a tonight instrument — flip back to Today once games start." />
  }
  if (!snap) return <Empty text="Finding tonight's live at-bats…" />
  if (!liveGames.length) {
    return (
      <div>
        <Header auto={auto} setAuto={setAuto} refresh={refresh} count={0} />
        <Empty text={snap.games?.some((g) => g.state === 'Live')
          ? 'Games are live but nobody is at the plate this second — between innings. It refreshes on its own.'
          : 'No games in progress. This page wakes up at first pitch.'} />
      </div>
    )
  }

  const a = active
  const bats = String(selP?.bats || '').toUpperCase().slice(0, 1)
  const watchingSomeoneElse = Number(selectedId) !== Number(a.pid)

  return (
    <div>
      <Header auto={auto} setAuto={setAuto} refresh={refresh} count={liveGames.length} />

      {/* ── 0 · THE WHOLE SLATE, BEFORE THE ROOM ──────────────────────────
          This page is a ROOM: one batter, deep. That is right for the man you
          care about and wrong for "what is happening right now", which is
          about all eight games and none of them in particular — and which you
          had to answer by picking a game first, which is exactly what you
          cannot do when you don't yet know where to look. The strip answers it
          in one glance and then hands you the room. No extra request; every
          field is already in the snapshot this page polls.

          2026-08-13, Donovan, on this whole stack: "a whole new
          reconstruction... i don't like how the top of the page looks right
          before the lineups." The three rails below now each answer exactly
          ONE question and say so in their own header, instead of one rail
          quietly switching meaning under a toggle: who's up (this one) → the
          loudest contact anywhere on the slate (BattedBallLog) → what
          happened to YOUR guys specifically (JustNow). */}
      <LiveAtBats
        players={players}
        watchIds={watchIds}
        onGo={(pk) => setPinnedGame(pk)}
      />

      {/* ── 0b · THE LOUDEST CONTACT, EVERYONE'S ───────────────────────────
          "i'd like to see hh deep fly out barrels distance and ev... like the
          live spray the live ev... bbes from the game." Slate-wide on
          purpose — see fetchBattedBallLog() in lib/livePitches.js for the
          three gates (hard-hit / barrel / deep fly out) and why this used to
          be a toggle mode on JustNow and now has its own header instead. */}
      <BattedBallLog players={players} onPlayerClick={onPlayerClick} />

      {/* ── 0c · AND HOW YOUR OWN GUYS' AT-BATS ENDED ──────────────────────
          The strip above is who is up; this is how it finished, for the names
          you have skin on. Scoped to picks + watchlist on purpose — see
          fetchSkinEvents() for the cost reasoning. Renders nothing when
          nothing of yours has completed a plate appearance. */}
      <JustNow players={players} watchIds={watchIds} onPlayerClick={onPlayerClick} />

      {/* ── 1 · WHICH GAME ─────────────────────────────────────────────
          2026-08-13, Donovan: "pick a game like it actually needs the games
          instead of the players. i should be able to see all the previous ab
          for the other players as well." Two separate fixes:
          1. The label. This picked a GAME but named it by whoever happened
             to be up, so scanning the closed list read as a list of eight
             hitters, not eight games — you couldn't tell which two teams
             you'd be looking at until after you picked. Matchup-first now,
             same abbr+score shape LiveAtBats already uses above; who's up
             is still here, just demoted to the line under it.
          2. The other players. This part already existed and didn't need
             new code — tap any row in Coming up or the box score below and
             the whole room, prior at-bats included, points at him instead,
             same game. "Pick a game" only ever picked the GAME; it was never
             connected to that, so the capability was real but not findable
             from here. The line under the toggle says so now instead of
             leaving you to discover it three sections down. */}
      {liveGames.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <Band note={`${liveGames.length} games have someone at the plate — your picks first`}>Pick a game</Band>
          <button onClick={() => setGamePickerOpen((v) => !v)} className="tap-row" style={{
            display: 'flex', width: '100%', gap: 8, alignItems: 'center', cursor: 'pointer', textAlign: 'left',
            border: `1px solid ${C.border}`, background: 'rgba(255,255,255,.02)',
            borderRadius: 10, padding: '7px 12px',
          }}>
            <span style={{ fontSize: 11 }}>⚾</span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }}>
              <span style={{
                fontSize: 12, fontWeight: 900, color: C.text, fontFamily: NUM_FONT,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {abbrs?.[a.g.awayId] || 'Away'} {a.g.awayScore ?? 0}–{a.g.homeScore ?? 0} {abbrs?.[a.g.homeId] || 'Home'}
              </span>
              <span style={{
                fontSize: 9.5, color: C.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                🎤 {a.name}{a.role ? ` · 🤖 ${a.role}` : a.watched ? ' · ★' : ''} at the plate
              </span>
            </span>
            <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>
              {String(a.g.half || '').slice(0, 3)}{a.g.inning}
            </span>
            <span style={{ fontSize: 9, color: C.text3 }}>{gamePickerOpen ? '▴' : `▾ ${liveGames.length} games`}</span>
          </button>
          {gamePickerOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 6 }}>
              {liveGames.map((x) => {
                const on = x.pk === a.pk
                const col = ROLE_COLOR[x.role] || (x.watched ? '#a78bfa' : C.border2)
                return (
                  <button key={x.pk} onClick={() => { setPinnedGame(x.pk); setGamePickerOpen(false) }} className="tap-row" style={{
                    display: 'flex', gap: 7, alignItems: 'center', cursor: 'pointer', textAlign: 'left',
                    border: `1px solid ${on ? col : C.border}`,
                    background: on ? `${col}1c` : 'rgba(255,255,255,.02)',
                    borderRadius: 10, padding: '6px 12px',
                    boxShadow: on ? `0 0 14px ${col}30` : 'none',
                  }}>
                    <span style={{ fontSize: 10 }}>⚾</span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 800, color: on ? C.text : C.text2, fontFamily: NUM_FONT }}>
                        {abbrs?.[x.g.awayId] || 'Away'} {x.g.awayScore ?? 0}–{x.g.homeScore ?? 0} {abbrs?.[x.g.homeId] || 'Home'}
                      </span>
                      <span style={{ fontSize: 9, color: C.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        🎤 {x.name}{x.role ? ` · 🤖 ${x.role}` : x.watched ? ' · ★' : ''}
                      </span>
                    </span>
                    <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0 }}>
                      {String(x.g.half || '').slice(0, 3)}{x.g.inning}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          <div style={{ fontSize: 9, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
            This picks the game. Once you&apos;re in it, tap anyone in Coming up or the box score
            below to see his at-bats — the charts and the log follow him, not just whoever&apos;s up.
          </div>
        </div>
      )}

      {/* ── 2 · NOW BATTING ────────────────────────────────────────────── */}
      <div style={{
        ...CARD,
        background: `linear-gradient(155deg, ${C.bg2}, rgba(74,222,128,.05))`,
        border: '1px solid rgba(74,222,128,.28)',
        marginBottom: 12,
      }}>
        {/* ── THE LOWER THIRD ────────────────────────────────────────────
            Read like a broadcast: the situation on one line, then the name
            at a size you can see from across the room, then the count as a
            scoreboard tile on the right where a scoreboard tile belongs.
            Everything else is one quiet line of context underneath. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', background: LIVE,
            boxShadow: `0 0 9px ${LIVE}`, animation: 'atpPulse 1.8s ease-in-out infinite',
          }} />
          <style>{'@keyframes atpPulse{0%,100%{opacity:1}50%{opacity:.3}}'}</style>
          <span style={{ ...LABEL, color: LIVE }}>Now batting</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'baseline', fontFamily: NUM_FONT }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: LIVE }}>
              {String(a.g.half || '').slice(0, 3)} {a.g.inning}
            </span>
            {a.g.awayScore != null && a.g.homeScore != null && (
              <span style={{ fontSize: 11, color: C.text2, fontWeight: 700 }}>
                {a.g.awayScore}<span style={{ color: C.text3 }}>–</span>{a.g.homeScore}
              </span>
            )}
          </span>
        </div>

        <div className="atplate-hero" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* the name block */}
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <div
              onClick={() => a.p && onPlayerClick?.(a.p)}
              className={a.p ? 'tap-row' : undefined}
              style={{
                fontSize: a.name.length > 18 ? 22 : 27, fontWeight: 900, letterSpacing: '-.025em',
                lineHeight: 1.05, cursor: a.p ? 'pointer' : 'default',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >{a.name}</div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
              {a.role && (
                <span style={{
                  fontSize: 9, fontWeight: 900, fontFamily: NUM_FONT, letterSpacing: '.06em',
                  color: '#0b0b0d', background: ROLE_COLOR[a.role],
                  borderRadius: 5, padding: '2px 8px',
                }}>{a.role} PICK</span>
              )}
              {a.p && (
                <span style={{ fontSize: 9.5, fontFamily: NUM_FONT, color: C.text3 }}>
                  {teamOf(a.p)} · #{clean(a.p?.lineup_spot, '?')} · {String(a.p?.bats || '?').toUpperCase().slice(0, 1)}HB
                </span>
              )}
              {a.p && (
                <span title="The bot's HR score for him tonight" style={{ fontSize: 9.5, fontFamily: NUM_FONT, color: C.text3, cursor: 'help' }}>
                  board <b style={{ color: C.orange }}>{hrScore(a.p).toFixed(0)}</b>
                </span>
              )}
            </div>

            {/* one quiet line: the arm, and his night so far */}
            <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginTop: 5, lineHeight: 1.6 }}>
              {a.p ? <>vs <b style={{ color: C.text2 }}>{clean(a.p?.pitcher_name, 'TBD')}</b>
                {a.p?.pitcher_throws ? ` (${a.p.pitcher_throws})` : ''}
                {n(a.p?.pitcher_hr9, 0) > 0 && <span style={{ color: n(a.p.pitcher_hr9, 0) >= 1.4 ? '#f87171' : C.text3 }}> · {n(a.p.pitcher_hr9, 0).toFixed(2)} HR/9</span>}
              </> : 'Not on tonight’s published slate — no board card for him.'}
              {snap.lines?.[a.pid]
                ? <> · tonight <b style={{ color: C.text2 }}>{snap.lines[a.pid].h}-{snap.lines[a.pid].ab}</b>
                  {snap.lines[a.pid].hr ? <b style={{ color: C.orange }}> {snap.lines[a.pid].hr} HR</b> : ''}
                  {snap.lines[a.pid].k ? ` · ${snap.lines[a.pid].k} K` : ''}</>
                : <> · first trip tonight</>}
            </div>
          </div>

          {/* THE COUNT, as its own tile. It's the number your eye should find
              first on a live page, so it gets a box, a border and real size
              instead of sitting inline with everything else. */}
          {atBat && (
            <div style={{
              flexShrink: 0, borderRadius: 12, padding: '8px 14px 9px',
              border: `1px solid ${COUNT_COL(atBat.balls, atBat.strikes)}44`,
              background: `${COUNT_COL(atBat.balls, atBat.strikes)}0e`,
              textAlign: 'center', minWidth: 118,
            }}>
              <div style={{ ...LABEL, fontSize: 7.5, marginBottom: 3 }}>
                {atBat.live ? 'The count' : 'Final count'}
              </div>
              <CountDots balls={atBat.balls} strikes={atBat.strikes} />
              {facing > 0 && (
                <div
                  title={`Plate appearance number ${facing} against this arm tonight. Hitters historically do better the third time through — the pitcher has shown them everything by then.`}
                  style={{
                    fontSize: 8.5, fontFamily: NUM_FONT, marginTop: 5, cursor: 'help',
                    color: facing >= 3 ? C.orange : C.text3, fontWeight: facing >= 3 ? 800 : 400,
                  }}>
                  {facing === 1 ? '1st look at him' : facing === 2 ? '2nd look' : `${facing}${facing === 3 ? 'rd' : 'th'} time through`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── THE AT-BAT ITSELF ──────────────────────────────────────────
            The count, then every pitch of it in order. This is the only
            thing on the page you can still act on, so it gets the space. */}
        {atBat && (
          <div style={{
            marginTop: 11, paddingTop: 10, borderTop: `1px solid ${C.border}`,
          }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 7 }}>
              <span style={{ ...LABEL, fontSize: 7.5 }}>
                {atBat.live ? 'Pitch by pitch' : 'How it ended'}
              </span>
              {!atBat.live && atBat.event && (
                <span style={{
                  fontSize: 9.5, fontWeight: 900, fontFamily: NUM_FONT,
                  color: /home run/i.test(atBat.event) ? C.orange : C.text3,
                  border: `1px solid ${/home run/i.test(atBat.event) ? C.orange : C.border2}`,
                  borderRadius: 999, padding: '2px 9px',
                }}>{atBat.event.toUpperCase()}</span>
              )}
              {prior.length > 0 && (
                <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}
                  title={prior.map((x) => `${x.inning ? `inning ${x.inning}: ` : ''}${x.event}`).join(' · ')}>
                  earlier: {prior.map((x) => x.event).join(' · ')}
                </span>
              )}
            </div>

            <Sequence pitches={atBat.pitches} />

            {(pitchersTonight.length > 1 || arsenal.length > 0) && (
              <div style={{ marginTop: 8 }}>
                <PitcherChips pitchers={pitchersTonight} viewId={viewPitcherId} onPick={setViewPitcherId} />
                {arsenal.length > 0 && (
                  <Arsenal
                    rows={arsenal}
                    pitcherName={pitchersTonight.find((x) => x.id === (viewPitcher || atBat.pitcherId))?.name || atBat.pitcherName}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* No pitches yet is a real state on this page — he steps in before
            the first one is thrown. Say so rather than showing an empty box. */}
        {feed && !atBat && (
          <div style={{ marginTop: 9, fontSize: 10, color: C.text3, lineHeight: 1.6 }}>
            He hasn&apos;t seen a pitch yet — the count and the sequence fill in from the first one.
          </div>
        )}
      </div>

      {/* ── 3 · COMING UP ──────────────────────────────────────────────── */}
      <ComingUp
        game={a.g}
        lineup={lineup}
        selectedId={Number(selectedId)}
        onPick={(id) => setPinnedHitter(Number(id))}
        onOpen={(p) => onPlayerClick?.(p)}
      />

      {/* ── 3b · BOX SCORE ─────────────────────────────────────────────
          Everything this needs was already in the snapshot; the page just
          never showed it. See BoxScore below. */}
      <BoxScore
        g={a.g}
        lines={snap?.lines}
        byId={byId}
        watchIds={watchIds}
        abbrs={abbrs}
        selectedId={Number(selectedId)}
        onPick={(id) => setPinnedHitter(Number(id))}
      />

      {/* ── 4 · THE CHARTS ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{
          fontSize: 8.5, fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase',
          color: C.text2, fontFamily: NUM_FONT,
        }}>Zone &amp; spray</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{selName || '—'}</span>
        {watchingSomeoneElse && (
          <button onClick={() => setPinnedHitter(null)} style={{
            fontSize: 9, fontWeight: 800, fontFamily: NUM_FONT, cursor: 'pointer', borderRadius: 999,
            padding: '2px 10px', border: `1px solid ${LIVE}66`, background: 'rgba(74,222,128,.10)', color: LIVE,
          }}>← back to the hitter at the plate</button>
        )}
        {selLine && (
          <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
            tonight {selLine.h}-{selLine.ab}{selLine.hr ? ` · ${selLine.hr} HR` : ''}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          {feed === undefined ? 'loading tonight’s feed…'
            : feed === null ? 'live feed unavailable — nothing to plot'
            : `${feed.pitches.length} pitches · ${feed.balls.length} balls in play this game`}
        </span>
      </div>

      {feed && livePitchesFor.length === 0 && (
        <div style={{ fontSize: 10, color: C.text3, marginBottom: 8, lineHeight: 1.6 }}>
          {viewPitcher ? (
            <>{selName || 'He'} hasn&apos;t faced{' '}
              <b style={{ color: C.text2 }}>{pitchersTonight.find((x) => x.id === viewPitcher)?.name || 'that pitcher'}</b>{' '}
              tonight — showing nothing rather than another arm&apos;s pitches under his name.{' '}
              <button onClick={() => setViewPitcherId(null)} style={{
                fontSize: 10, fontWeight: 700, color: LIVE, background: 'none', border: 'none',
                padding: 0, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit',
              }}>see every pitcher instead</button>.
            </>
          ) : (
            <>{selName || 'He'} hasn&apos;t seen a tracked pitch tonight yet, so the zone map below has no dots
              on it — just the heat and the starter&apos;s usage as background. They appear the moment he
              steps in.</>
          )}
        </div>
      )}

      {/* .chart-cols: the two charts sit side by side from ~700px up. Their
          320px flex basis already wraps them on a phone, but only because the
          basis happens to exceed the viewport — an implicit stack that a wider
          phone or a landscape turn would silently undo, putting two dense
          charts in 180px columns. The class makes the stack explicit. */}
      <div className="chart-cols" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          {/* liveOnly (2026-08-10, Donovan: "for the spray and the strike map I
              want those to be at-the-plate specific, no outside data on those.
              Besides like percents and heat matches and such — I like where
              it's at"). The heat, the percentages and the matchup shading stay
              as background; the season value inside each cell is off, so the
              only markers are tonight's pitches. */}
          <ZoneMap
            playerId={Number(selectedId)}
            bats={bats}
            liveOnly
            livePitches={livePitchesFor}
            liveLabel={selName}
          />
        </div>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div style={{
            background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.03))`,
            border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 13px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800 }}>🗺 Spray chart</span>
              {liveBalls.length > 0 && (
                <span title={`${liveBalls.length} tracked balls in play in this game, plotted on the same field`} style={{
                  fontSize: 8.5, fontWeight: 900, fontFamily: NUM_FONT, letterSpacing: '.08em',
                  color: LIVE, border: `1px solid ${LIVE}70`, background: 'rgba(74,222,128,.10)',
                  borderRadius: 999, padding: '2px 8px',
                }}>● LIVE {liveBalls.length}</span>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>
                tonight only
              </span>
            </div>
            {/* liveOnly — same request as the zone map above. The field, the
                real wall, the arcs and the result colours stay; the season
                batted balls, the window chips and the lane shares are off, so
                the only dots on the field are the ones hit in this game. */}
            <SprayField
              player={selP}
              slateMode={slateMode}
              height={320}
              liveOnly
              liveBalls={liveBalls}
              liveFocusId={Number(selectedId)}
              liveLabel={selName}
            />
          </div>
        </div>
      </div>

      <div style={{ fontSize: 9.5, color: C.text3, marginTop: 10, lineHeight: 1.65, maxWidth: 760 }}>
        The same zone map and spray chart the player card uses, in their <b style={{ color: C.text2 }}>tonight-only</b>{' '}
        skin: every dot on this page comes from this game and nothing else. Tonight&apos;s pitches are the
        feed&apos;s own pX/pZ laid on the zone grid; tonight&apos;s batted balls are its own hit coordinates
        laid on this park&apos;s real wall. The zone cells keep their heat, the starter&apos;s usage
        percentages and the matchup shading as background, and the season number that normally sits
        inside each cell is one hover away rather than painted over the dots. Tap anyone in the batting
        order above to point both charts at him without leaving the page. Refreshes every 25s while this
        tab is visible.
      </div>
    </div>
  )
}

// ── who's coming ────────────────────────────────────────────────────────────
//
// On deck and in the hole come from the linescore's own offense block; the
// rest of the order comes from the boxscore's `battingOrder`, which is the
// lineup as it actually stands after every substitution. Nobody is invented:
// a slot with no published hitter simply isn't drawn, and a hitter who isn't
// on tonight's slate shows his name with an honest dash where the score goes.
function ComingUp({ game, lineup, selectedId, onPick, onOpen }) {
  const deck = lineup.find((r) => r.isDeck) || null
  const hole = lineup.find((r) => r.isHole) || null

  if (!lineup.length) {
    return (
      <div style={{ ...CARD, padding: '11px 13px' }}>
        <div style={{ ...LABEL, marginBottom: 5 }}>Coming up</div>
        <div style={{ fontSize: 10.5, color: C.text3, lineHeight: 1.6 }}>
          {game?.onDeckName || game?.inHoleName ? <>
            On deck <b style={{ color: C.text2 }}>{clean(game.onDeckName, '—')}</b>
            {game?.inHoleName && <> · in the hole <b style={{ color: C.text2 }}>{clean(game.inHoleName, '—')}</b></>}.
            {' '}The full batting order hasn&apos;t come back from this game&apos;s boxscore yet.
          </> : 'No batting order published for this game yet.'}
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <Band note="tap anyone to point the charts at him">Coming up</Band>

      {/* The two that matter most, given their own row.
          .atplate-deck is a phone hook: these two cards are minWidth 168, so at
          a 390px portrait viewport they total 345px inside 346px of card — they
          "fit" by one pixel, and then the text inside them (name + "board 87 ·
          🤖 HR") has nowhere to go. On a phone they get a row each. */}
      {(deck || hole) && (
        <div className="atplate-deck" style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginBottom: 10 }}>
          {[['ON DECK', deck, '#FCD34D'], ['IN THE HOLE', hole, '#a78bfa']].map(([tag, row, col]) => (
            row ? (
              <button key={tag} onClick={() => onPick(row.id)} className="tap-row" style={{
                display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start',
                cursor: 'pointer', textAlign: 'left', minWidth: 168,
                border: `1px solid ${Number(row.id) === selectedId ? col : C.border}`,
                background: Number(row.id) === selectedId ? `${col}18` : 'rgba(255,255,255,.02)',
                borderRadius: 10, padding: '7px 12px',
              }}>
                <span style={{ ...LABEL, color: col, fontSize: 7.5 }}>{tag}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{row.name}</span>
                <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
                  {row.slot ? `${row.slot} hole` : ''}
                  {row.score != null ? ` · board ${row.score.toFixed(0)}` : ' · not on the slate'}
                  {row.role ? ` · 🤖 ${row.role}` : ''}
                </span>
              </button>
            ) : null
          ))}
        </div>
      )}

      {/* the whole order, in order */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {lineup.map((r) => {
          const on = Number(r.id) === selectedId
          const tag = r.isUp ? ['AT BAT', LIVE] : r.isDeck ? ['ON DECK', '#FCD34D'] : r.isHole ? ['IN HOLE', '#a78bfa'] : null
          return (
            <div key={r.id} className="tap-row" onClick={() => onPick(r.id)} style={{
              display: 'flex', gap: 9, alignItems: 'center', cursor: 'pointer', minWidth: 0,
              padding: '5px 9px', borderRadius: 8,
              background: on ? 'rgba(249,115,22,.10)' : 'transparent',
              border: `1px solid ${on ? 'rgba(249,115,22,.45)' : 'transparent'}`,
              borderLeft: `2px solid ${tag ? tag[1] : 'transparent'}`,
            }}>
              <span style={{ width: 14, flexShrink: 0, fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{r.slot || '—'}</span>
              <span style={{
                fontSize: 11.5, fontWeight: on ? 800 : 600, color: on ? C.text : C.text2,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '1 1 auto',
              }}>
                {r.name}
                {r.sub && <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}> (sub)</span>}
              </span>
              {tag && (
                <span style={{ fontSize: 7.5, fontWeight: 900, letterSpacing: '.08em', color: tag[1], fontFamily: NUM_FONT, flexShrink: 0 }}>
                  {tag[0]}
                </span>
              )}
              {r.role && (
                <span style={{ fontSize: 8.5, fontWeight: 900, fontFamily: NUM_FONT, color: ROLE_COLOR[r.role] || C.text3, flexShrink: 0 }}>
                  🤖 {r.role}
                </span>
              )}
              <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0, minWidth: 62, textAlign: 'right' }}>
                {r.line ? `${r.line.h}-${r.line.ab}${r.line.hr ? ` ${r.line.hr}HR` : ''}` : '—'}
              </span>
              <span
                onClick={(e) => { e.stopPropagation(); if (r.p) onOpen(r.p) }}
                title={r.p ? `Open ${r.name}'s card` : 'Not on tonight’s published slate'}
                style={{
                  fontSize: 10.5, fontWeight: 900, fontFamily: NUM_FONT, flexShrink: 0,
                  minWidth: 30, textAlign: 'right',
                  color: r.score != null ? C.orange : C.text3,
                  cursor: r.p ? 'pointer' : 'default',
                }}
              >{r.score != null ? r.score.toFixed(0) : '—'}</span>
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 9, color: C.text3, marginTop: 8, lineHeight: 1.55 }}>
        The order is the boxscore&apos;s own <code>battingOrder</code> as it stands after substitutions;
        on deck and in the hole are the linescore&apos;s. The number on the right is his board score
        tonight — a dash means he isn&apos;t on the published slate, and tapping his name still points
        the charts at him. The middle column is his line so far tonight.
      </div>
    </div>
  )
}

// 📋 BOX SCORE — the whole game, not just the man in the box.
//
// 2026-08-10, Donovan: "any way to add boxscores to the at the plate page."
//
// NOTHING NEW IS FETCHED. lib/liveSlate.js already pulls one boxscore per
// started game and keeps every batter's line in `snap.lines`, plus both
// batting orders in `g.lineup` and the two starters' pitch counts in
// `g.starters`. The Coming-up list above shows ONE side of that, filtered to
// who bats next. This is the same data, both dugouts, in the shape you'd
// glance at to answer "what has actually happened in this game" — which the
// page could not answer at all before, despite holding every number needed.
//
// Sorted by the order, not by production: a box score's job is to be scannable
// in the same shape every time. Bot picks and watchlist keep their marks so
// your side of the game is findable without reading names.
function BoxScore({ g, lines, byId, watchIds, selectedId, onPick, abbrs }) {
  // Which slot leads off when a fielding team comes back up. g.onDeck/g.inHole
  // only exist for whoever is CURRENTLY batting — the linescore has no such
  // field for the other dugout, so there's no direct way to answer "where are
  // they in their order." The honest fix is to remember the last man who
  // batted for each team and take the next slot after him; this just watches
  // g.upBatter go by and keeps one id per team, updated every poll.
  // 2026-08-13, Donovan: "i also lose track of where we are on the other
  // side... a little more to show for them when they're on defense... to
  // know where their batting order is." Needs no new fetch — g.battingTeamId
  // and g.upBatter are already in the same snapshot this whole page polls.
  const lastUpRef = useRef({})
  useEffect(() => {
    if (g?.battingTeamId != null && g?.upBatter != null) {
      lastUpRef.current[Number(g.battingTeamId)] = Number(g.upBatter)
    }
  }, [g?.battingTeamId, g?.upBatter])

  if (!g?.lineup) return null
  // liveSlate carries team IDs, not abbreviations — the schedule endpoint does
  // not return `abbreviation` on its team object (checked: it comes back as
  // {"id":121} and nothing else). teamAbbrs() is the existing cached /teams
  // lookup the timeline already uses; until it resolves the header shows the
  // side rather than an id-shaped placeholder.
  const sides = [['away', g.awayId, abbrs?.[g.awayId] || 'Away'], ['home', g.homeId, abbrs?.[g.homeId] || 'Home']]
  if (!sides.some(([sd]) => (g.lineup[sd] || []).length)) return null

  const H = ({ children, w = 19 }) => (
    <span style={{ width: w, textAlign: 'right', flexShrink: 0, fontSize: 8, color: C.text3, fontFamily: NUM_FONT }}>{children}</span>
  )

  return (
    <div style={{ marginTop: 14 }}>
      <Band note="every batter in this game, tonight's line">Box score</Band>
      <div className="lineup-cols" style={{ display: 'flex', gap: 0, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        {sides.map(([side, teamId, abbr], si) => {
          const rows = g.lineup[side] || []
          const starter = (g.starters || []).find((x) => x.side !== side) || null
          const runs = side === 'away' ? g.awayScore : g.homeScore
          // Team totals are SUMMED FROM THE ROWS shown, not taken from
          // anywhere else, so the column and its total can never disagree.
          const tot = rows.reduce((a, r) => {
            const l = lines?.[Number(r.id)]
            if (l) { a.ab += l.ab; a.h += l.h; a.d2 += l.d2; a.d3 += l.d3; a.hr += l.hr; a.rbi += l.rbi; a.k += l.k }
            return a
          }, { ab: 0, h: 0, d2: 0, d3: 0, hr: 0, rbi: 0, k: 0 })
          // On defense right now — where their order picks back up. See
          // lastUpRef above; before they've batted at all this game there's
          // no history yet, so this only appears once they've had a turn.
          const isBattingSide = Number(teamId) === Number(g.battingTeamId)
          let nextUpRow = null
          if (!isBattingSide && rows.length) {
            const lastId = lastUpRef.current[Number(teamId)]
            const idx = lastId != null ? rows.findIndex((r) => Number(r.id) === lastId) : -1
            if (idx >= 0) nextUpRow = rows[(idx + 1) % rows.length]
          }
          return (
            <div key={side} className="lineup-col" style={{
              flex: 1, minWidth: 0, padding: '8px 11px',
              borderLeft: si ? `1px solid ${C.border}` : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 5 }}>
                <span style={{ fontSize: 12, fontWeight: 900, fontFamily: NUM_FONT }}>{abbr || side}</span>
                <span style={{ fontFamily: NUM_FONT, fontSize: 14, fontWeight: 900, color: C.text }}>{runs ?? 0}</span>
                {starter && (
                  <span title={`${starter.name} has thrown ${starter.pitches} pitches — the bullpen door`}
                    style={{ marginLeft: 'auto', fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>
                    vs {String(starter.name).split(' ').slice(-1)[0]} · {starter.pitches}p
                  </span>
                )}
              </div>
              {nextUpRow && (
                <div style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT, marginBottom: 4, lineHeight: 1.4 }}>
                  on defense · leads off next: <b style={{ color: '#FCD34D' }}>
                    {(() => { const p = byId?.get(Number(nextUpRow.id)) || null; return p ? nameOf(p) : clean(nextUpRow.name, `#${nextUpRow.id}`) })()}
                  </b>
                </div>
              )}
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', paddingBottom: 3, borderBottom: `1px solid ${C.border}` }}>
                <span style={{ width: 11, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 8, color: C.text3, fontFamily: NUM_FONT }}>BATTER</span>
                <H>AB</H><H>H</H><H>2B</H><H>3B</H><H>HR</H><H>RBI</H><H>K</H>
              </div>
              {rows.map((r) => {
                const l = lines?.[Number(r.id)] || null
                const p = byId?.get(Number(r.id)) || null
                const on = Number(r.id) === Number(selectedId)
                const up = Number(r.id) === Number(g.upBatter)
                const isNext = !!nextUpRow && Number(r.id) === Number(nextUpRow.id)
                return (
                  <div key={r.id} onClick={() => onPick?.(r.id)} className="tap-row" style={{
                    display: 'flex', gap: 5, alignItems: 'center', padding: '2.5px 0',
                    cursor: 'pointer', minWidth: 0,
                    borderLeft: `2px solid ${up ? '#4ade80' : on ? C.orange : isNext ? '#FCD34D' : 'transparent'}`,
                    paddingLeft: 4, marginLeft: -6,
                  }}>
                    <span style={{ width: 11, flexShrink: 0, fontFamily: NUM_FONT, fontSize: 9.5, color: C.text3 }}>{r.slot}</span>
                    <span style={{
                      flex: 1, minWidth: 0, fontSize: 11, fontWeight: on || up ? 800 : 600,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      color: up ? '#4ade80' : isNext ? '#FCD34D' : C.text2,
                    }}>
                      {p ? nameOf(p) : clean(r.name, `#${r.id}`)}
                      {r.sub && <span title="Substitute — he replaced the man in this slot" style={{ fontSize: 8, color: C.text3, marginLeft: 3 }}>sub</span>}
                      {p && String(p?.game_pick_role || '').trim() ? <span style={{ fontSize: 8.5, marginLeft: 3 }}>🤖</span> : null}
                      {isNext && <span title="Leads off when this team bats next" style={{ fontSize: 7.5, fontWeight: 900, color: '#FCD34D', marginLeft: 3, letterSpacing: '.04em' }}>NEXT</span>}
                      {/* watchIds is keyed \`playerId-gamePk\`, not by bare id —
                          the same composite the live-games list above builds.
                          Testing the raw id here would have silently starred
                          nobody, forever. */}
                      {p && watchIds?.has(`${clean(p?.player_id || p?.id, '')}-${clean(p?.game_pk || p?.team, '')}`)
                        ? <span style={{ fontSize: 8.5, marginLeft: 2 }}>★</span> : null}
                    </span>
                    {/* A man with no line has not batted yet. That is a blank,
                        not a row of zeros — zeros read as "0 for 3". */}
                    <H>{l ? l.ab : '·'}</H>
                    <H>{l ? l.h : '·'}</H>
                    <H>{l ? l.d2 : '·'}</H>
                    <H>{l ? l.d3 : '·'}</H>
                    <H>{l?.hr ? <b style={{ color: C.orange }}>{l.hr}</b> : l ? 0 : '·'}</H>
                    <H>{l ? l.rbi : '·'}</H>
                    <H>{l ? l.k : '·'}</H>
                  </div>
                )
              })}
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', paddingTop: 3, marginTop: 2, borderTop: `1px solid ${C.border}` }}>
                <span style={{ width: 11, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT, textTransform: 'uppercase', letterSpacing: '.05em' }}>Team</span>
                <H>{tot.ab}</H><H>{tot.h}</H><H>{tot.d2}</H><H>{tot.d3}</H><H>{tot.hr}</H><H>{tot.rbi}</H><H>{tot.k}</H>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 9, color: C.text3, marginTop: 7, lineHeight: 1.55 }}>
        Straight off the league&apos;s boxscore for this game — the same pull the rest of this page
        runs on, so it costs no extra request. A dot means he hasn&apos;t batted yet; the green name is
        the man at the plate. The <b style={{ color: '#FCD34D' }}>yellow NEXT</b> tag is the fielding
        team&apos;s own order — it remembers the last man who batted for them and marks whoever leads
        off once they&apos;re back up, since the feed only ever names an on-deck hitter for whichever
        side is currently hitting. Team rows are summed from the lines above them, so the column and
        its total can&apos;t disagree.
      </div>
    </div>
  )
}

function Header({ auto, setAuto, refresh, count }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 19, fontWeight: 900, letterSpacing: '-.01em' }}>🎤 At the Plate</span>
        <span style={{ fontSize: 10.5, color: C.text3 }}>
          {count > 0 ? `${count} hitter${count === 1 ? '' : 's'} batting right now` : 'live batters, as they step in'}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={() => setAuto((v) => !v)} style={{
            fontSize: 9, fontWeight: 700, fontFamily: NUM_FONT, cursor: 'pointer', borderRadius: 7, padding: '3px 10px',
            border: `1px solid ${auto ? LIVE : C.border}`, background: auto ? 'rgba(74,222,128,.12)' : 'transparent',
            color: auto ? LIVE : C.text3,
          }}>{auto ? '● auto 25s' : '○ auto'}</button>
          <button onClick={refresh} style={{
            fontSize: 9, fontWeight: 700, fontFamily: NUM_FONT, cursor: 'pointer', borderRadius: 7, padding: '3px 10px',
            border: `1px solid ${C.border}`, background: 'transparent', color: C.text3,
          }}>↻</button>
        </span>
      </div>
      <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.65, marginTop: 4, maxWidth: 760 }}>
        <b style={{ color: C.text2 }}>What this answers:</b> the man hitting right now — where he does
        damage in the zone, where tonight&apos;s pitches have actually gone, and where the ball is
        leaving the bat — plus who is coming up behind him.
      </div>
    </div>
  )
}
