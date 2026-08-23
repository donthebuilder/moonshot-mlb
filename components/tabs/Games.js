'use client'
import { useMemo, useState, useRef, useEffect } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { roleBadge } from '../../lib/roleBadge'
import PriceBubble from '../PriceBubble'
import Boxes from './Boxes'
import { hrPerGame } from '../../lib/odds'
import { groupGames } from '../../lib/data'
import { dateText, playerId, mlbId, hrScore } from '../../lib/player'
import { PanelTitle, Empty, btnStyle } from '../ui'
import PlayerCard from '../PlayerCard'
import GameStrip from '../GameStrip'
import GameLineup from '../GameLineup'
import Heatmap from '../Heatmap'
import { pillMeta, pillStyle } from '../../lib/pills'
import { fetchLiveSlate, lineupStatus } from '../../lib/liveSlate'
import LiveAtBats from '../LiveAtBats'
import AtThePlate from './AtThePlate'
import OffBot from '../OffBot'
import GameDeepDive from '../GameDeepDive'
import LineupSlotMatchup from '../LineupSlotMatchup'
import PairTray from '../PairTray'
import MobileFold from '../MobileFold'
import { statLineFor, useSlateScale, toneFor, toneTitle, TONE_COLOR } from '../../lib/statline'
import { downloadGameCard } from '../shareCard'

// A game card's pick chip, stat-first.
//
// Own component rather than inline JSX because it reads the slate scale from
// context, and a hook cannot live inside a .map() callback.
function StatChip({ p, cat, col, score, onClick, label, odds = null }) {
  // `label` (2026-08-14): display text when it differs from the functional
  // category — a merged "TOP/HR" chip still computes its stat line and score
  // from ONE real category (the primary), but wears both names.
  const scale = useSlateScale()
  const lead = statLineFor(p, cat, 1)[0] || null
  const tone = lead ? toneFor(scale, lead) : null
  const statCol = lead ? (tone ? TONE_COLOR[tone] : C.text2) : C.text3
  return (
    <button onClick={onClick} title={lead ? toneTitle(tone, scale, lead) : undefined} style={{
      display: 'flex', flexDirection: 'column', gap: 2, cursor: 'pointer', minWidth: 0,
      border: `1px solid ${col}55`, background: `${col}10`,
      borderRadius: 7, padding: '4px 8px 5px', textAlign: 'left',
    }}>
      <span style={{ display: 'flex', gap: 5, alignItems: 'baseline', minWidth: 0 }}>
        <span style={{ fontSize: 8.5, fontWeight: 900, color: col, fontFamily: NUM_FONT, letterSpacing: '.05em', flexShrink: 0 }}>{label || cat}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: C.text, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          {String(p?.name || '').split(' ').slice(-1)[0]}
        </span>
      </span>
      <span style={{ display: 'flex', gap: 5, alignItems: 'baseline', minWidth: 0 }}>
        {lead ? (
          <span style={{ fontSize: 9.5, fontFamily: NUM_FONT, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            <b style={{ color: statCol, fontWeight: 800 }}>{lead.text}</b>
            <span style={{ color: C.text3 }}> {lead.label.toLowerCase()}</span>
          </span>
        ) : (
          // No published stat for him — say nothing rather than print a dash.
          <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>no stat yet</span>
        )}
        {/* 💸 THE PRICE, ON THE PICK (2026-08-15, Donovan: "i wanted to see
            them on the games picks like a little buble or ... glow of the
            odd"). It sits on the stat line rather than the name line because
            the name line is the one that truncates, and it glows only when
            there is a real rate to judge the number against. */}
        <PriceBubble odds={odds} player={p} cat={cat}
          rate={cat === 'HR' || cat === 'TOP' ? hrPerGame(p) : null} />
        <span title="The bot's score for this category" style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: `${col}cc`, fontFamily: NUM_FONT, flexShrink: 0 }}>
          {score.toFixed(0)}
        </span>
      </span>
    </button>
  )
}

const ROLE_CONFIG = {
  TOP:     { label: 'Top Pick',     color: '#FCD34D' },
  HR:      { label: 'HR Pick',      color: '#FB923C' },
  HIT:     { label: 'Hit Pick',     color: '#60A5FA' },
  HRR:     { label: 'HRR Pick',     color: '#34D399' },
  CONTACT: { label: 'Contact Pick', color: '#A78BFA' },
}
function getRoleDisplay(p) {
  const primary = (p?.game_pick_role || '').split('/')[0]
  if (ROLE_CONFIG[primary]) return ROLE_CONFIG[primary]
  // best_bet_type arrives with a pictograph baked in ("🏆 HR Bet"), which used
  // to be rendered verbatim as the label. roleBadge strips it and resolves the
  // colour off a semantic token instead of substring-matching the display text.
  const badge = roleBadge(p?.best_bet_type || p?.beginner_label, C)
  const label = badge.label
  const color = badge.color
  return { label, color }
}

// group games by time slot (same UTC hour)
//
// BUGFIX: previously returned `${h}:${m}` with an UNPADDED hour (e.g. "0:30"
// for a game just after midnight UTC, "16:10" for one at 16:10 UTC), then
// sorted slots with localeCompare (plain string comparison). "0:30" sorts
// BEFORE "16:10" alphabetically since "0" < "1" as the first character --
// even though 00:30 UTC the next day is chronologically LATER than 16:10
// UTC. MST evening games (5:40pm/6:45pm MST) land on single-digit UTC hours
// just after midnight UTC and were sorting to the top of the list for
// exactly this reason. Returning the actual timestamp (epoch ms, rounded to
// the 30-min bucket) makes the key directly numerically/chronologically
// sortable, with no date-rollover ambiguity.
function timeSlot(gameTime) {
  if (!gameTime) return null
  const d = new Date(gameTime)
  if (Number.isNaN(d.getTime())) return null
  const ms = d.getTime()
  const thirtyMin = 30 * 60 * 1000
  return Math.floor(ms / thirtyMin) * thirtyMin
}

function localTime(gameTime) {
  if (!gameTime) return '—'
  const d = new Date(gameTime)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

function isPast(gameTime) {
  if (!gameTime) return false
  return new Date(gameTime) < new Date(Date.now() - 3 * 60 * 60 * 1000) // 3hr buffer for late games
}

// The five designated slots for a game — the same ones Results grades.
// Shared by the rundown cards and the expanded pick row so the two can
// never disagree about who a game's picks are.
const CAT_ORDER = ['TOP', 'HR', 'HIT', 'HRR', 'CONTACT']
const CAT_COLOR = { TOP: '#FCD34D', HR: '#FB923C', HIT: '#60A5FA', HRR: '#22d3ee', CONTACT: '#A78BFA' }
const CAT_SCORE = {
  TOP: (p) => p?.top_board_score_v2 ?? p?.overall_score ?? p?.hr_score ?? 0,
  HR: (p) => p?.hr_score ?? 0,
  HIT: (p) => p?.hit_score ?? 0,
  HRR: (p) => p?.hrr_score ?? 0,
  CONTACT: (p) => p?.contact_score ?? 0,
}
// A player can carry more than one role (e.g. "TOP/HR") -- match on any
// tag, not just the first, so a double-up shows up in every slot he holds
// (mirrors the same fix already shipped in BotPicksStrip.js's pickBuckets).
// Returns {cat, p} pairs (not bare players): a dual-slotted player can
// legitimately fill two slots with the SAME underlying player object, so
// each occurrence needs to carry its own slot forward rather than have the
// render step re-derive "which category is this" from p.game_pick_role,
// which would just return his first tag both times (2026-08-13).
const roleTags = (p) => String(p?.game_pick_role || '').split('/').map((s) => s.trim().toUpperCase()).filter(Boolean)
const picksFor = (g) => {
  const perSlot = CAT_ORDER
    .map((cat) => {
      const p = [...(g.players || [])]
        .filter((pp) => roleTags(pp).includes(cat))
        .sort((a, b) => (CAT_SCORE[cat](b) || 0) - (CAT_SCORE[cat](a) || 0))[0]
      return p ? { cat, p } : null
    })
    .filter(Boolean)
  // ONE ENTRY PER PLAYER (2026-08-14, Donovan: "if the player is the same
  // pick twice only show the player once for the top pick thing"). The
  // multi-role fix (5b95364) made a TOP/HR double-up fill BOTH slots, which
  // rendered him as two chips / two cards. Now his slots merge: one entry,
  // wearing every slot he holds (cats), with the FIRST slot in CAT_ORDER as
  // the primary — it drives the color and the score shown, so a "TOP/HR"
  // chip reads TOP's number, labelled with both names.
  const byPlayer = new Map()
  perSlot.forEach(({ cat, p }) => {
    const k = playerId(p)
    if (byPlayer.has(k)) byPlayer.get(k).cats.push(cat)
    else byPlayer.set(k, { cat, cats: [cat], p })
  })
  return [...byPlayer.values()]
}

// The two sides of a game: each team with the ARM ITS BATTERS FACE — every
// hitter row already carries his opposing pitcher, so side one's pitcher is
// just the first row's pitcher fields.
function sidesOf(g) {
  const byTeam = {}
  ;(g.players || []).forEach((p) => {
    const t = p?.team || '?'
    ;(byTeam[t] = byTeam[t] || []).push(p)
  })
  Object.values(byTeam).forEach((l) => l.sort((a, b) => (Number(a?.lineup_spot) || 99) - (Number(b?.lineup_spot) || 99)))
  const order = [g.away, g.home].filter((t) => byTeam[t])
  const teams = order.length === 2 ? order : Object.keys(byTeam)
  return teams.map((t) => {
    const lineup = byTeam[t]
    return {
      team: t,
      lineup,
      arm: lineup[0]?.pitcher_name || 'TBD',
      throws: lineup[0]?.pitcher_throws || '',
      hr9: Number(lineup[0]?.pitcher_hr9) || null,
      era: Number(lineup[0]?.pitcher_era) || null,
      projected: !!lineup[0]?.pitcher_projected,
      stars: lineup.filter((p) => p?.weak_spot_flag).length,
    }
  })
}

// slateMode / initialMode (2026-08-16, tab consolidation): both OPTIONAL with
// safe defaults because this change lands before Dashboard's rewiring does —
// the current mount passes neither and must keep rendering identically.
//   · slateMode — threaded through to the Live view's AtThePlate (which needs
//     it for Today/Tomorrow awareness); 'today' until the owner wires the real
//     one in.
//   · initialMode — lets the old #tab=atplate deep link open this tab already
//     on the Live view once routing lands. First render only: it seeds the
//     mode state and is never read again, so the pills stay in charge.
export default function Games({ players, allPlayers = [], slateDate = '', pairHistorySummary, results, odds = null, onAdd, onWatch, watchIds, onPlayerClick, slateMode = 'today', initialMode }) {
  const [gview, setGview] = useState('games')
  // ── THE LEAGUE'S LINEUP, NOT THE BOT'S (2026-08-10) ──────────────────────
  //
  // Donovan: "make sure the live wire and games can update the lineups — does
  // that work?" It didn't. Every row on this tab was ordered by the slate's
  // `lineup_spot`, which is whatever the bot last wrote — so between cron runs
  // a posted card could move a hitter three slots or scratch him entirely and
  // this tab would keep showing the old order with a green "✓ confirmed"
  // badge next to it.
  //
  // fetchLiveSlate now reads pre-game boxscores as well as in-game ones (see
  // lib/liveSlate.js — verified against a Preview game before building this),
  // so the actual card is available here. Two minutes is the right cadence: a
  // lineup posts once and then barely moves, and the module-level 15s cache
  // means a tab with the wire above it shares the same fetch anyway.
  //
  // TWO CADENCES, because this snapshot now feeds two different things. A
  // lineup card posts once and barely moves — two minutes is generous. A SCORE
  // moves every half inning, and a card showing 3-1 in the 6th when it is
  // actually 6-1 in the 8th is worse than showing nothing. So the interval
  // follows the slate: 30s while anything is live, 2 minutes otherwise. The
  // module-level 15s cache means a tab with the wire above it still shares one
  // fetch rather than doubling the requests.
  const [live, setLive] = useState(null)
  useEffect(() => {
    let alive = true
    let t = null
    const pull = () => fetchLiveSlate().then((s) => {
      if (!alive || !s) return
      setLive(s)
      const anyLive = s.games?.some((x) => x.state === 'Live')
      clearInterval(t)
      t = setInterval(() => { if (!document.hidden) pull() }, anyLive ? 30000 : 120000)
    }).catch(() => {})
    pull()
    return () => { alive = false; clearInterval(t) }
  }, [])
  // 🔗 build a pair straight off the grid (2026-08-09). Two legs max; tapping
  // a third rolls the oldest off so it always reads as "these two".
  const [pairLegs, setPairLegs] = useState([])
  const [pairMarket, setPairMarket] = useState('hr')
  const pairIds = useMemo(() => new Set(pairLegs.map((p) => Number(p?.player_id ?? p?.id))), [pairLegs])
  const togglePairLeg = (p) => {
    const id = Number(p?.player_id ?? p?.id)
    if (!id) return
    setPairLegs((cur) => {
      if (cur.some((x) => Number(x?.player_id ?? x?.id) === id)) {
        return cur.filter((x) => Number(x?.player_id ?? x?.id) !== id)
      }
      return [...cur, p].slice(-2)
    })
  }
  // useState's initializer runs once, which is exactly the contract initialMode
  // wants: it wins over 'default' on FIRST render only, then the buttons own it.
  const [mode, setMode]         = useState(initialMode || 'default')
  // 2026-08-12, Donovan: "maybe be able to order h/9 or whip and score."
  // Default stays chronological on purpose — GameStrip's own header comment
  // is explicit about why ("you read a slate chronologically -- re-ranking
  // by strength makes you hunt for the 7:05 game you're about to bet"), and
  // that's still true. This adds sorting as something you turn ON, not a
  // replacement for the default.
  const [sortBy, setSortBy]     = useState('time')
  const [activeGame, setActive] = useState(null)
  // ── WHICH SECTION OF THE OPEN GAME YOU ARE LOOKING AT (2026-08-15) ────────
  //
  // Donovan, on the lineups: "like the lineups should be just easy accessible
  // in the same game bubble when you're checking out the game inside, instead
  // of click off to lineups... just a little shift to see the pitcher weak
  // spots and what the pitcher is doing to that spot." And, separately, twice:
  // "i keep having to scroll up to scroll back down."
  //
  // Opening a game used to render, in one column: the deep dive (cockpit, air,
  // both arms, both head-to-head tables, storylines), then the full 30-column
  // lineup table, then the pick cards. Four screens of a single game, with the
  // lineup buried in the middle of it — so the lineup was easier to reach from
  // the Lineups MODE, which is exactly the trip he is asking not to make.
  //
  // One state, not one per game: only one card is open at a time. It is also
  // deliberately NOT reset when you open a different game — if you are reading
  // spot damage down the slate, the next game should open on spot damage
  // rather than making you re-pick the pill twelve times.
  const [panel, setPanel] = useState('read')
  // ── BOT OUTPUT, MERGED INTO DEFAULT (2026-08-18) ──────────────────────────
  // Donovan: "remove the bot output thing like how it has the bars just merge
  // that with the default somehow but do it suitable to like just a clickable
  // [on] the picks to see that look." Bot Output used to be a fourth whole-page
  // mode — its own button up top, its own copy of the grid — that differed
  // from Default in exactly one place: the open game's pick cards rendered as
  // five colour bars instead of the normal PlayerCard. That's a one-card
  // decision, not a whole-page one, so it's now a toggle that lives where the
  // picks actually are (the "This game's bot picks" header) instead of a mode
  // button at the top that reloads the entire grid to change one section of
  // it. `barsOn` replaces every `mode === 'botview'` check below.
  const [barsOn, setBarsOn] = useState(false)
  // Lineups mode focus (2026-08-06): clicking a bubble used to scroll the
  // page to a card buried under ten others — "flies all the way to the
  // bottom". Now it FOCUSES: the chosen game renders alone, full width, with
  // the slot-by-slot depth open; everything else steps aside until the back
  // button (or re-clicking the bubble) restores the wall.
  const [lineupFocus, setLineupFocus] = useState(null)
  const gameRefs                = useRef({})

  const games = useMemo(() => groupGames(players), [players])

  // ── LIVE STATE, JOINED ONTO THE CARDS (2026-08-18) ────────────────────────
  // Donovan: "the box-score and live-game design pass against your MLB/ESPN/
  // Apple screenshots." The single biggest gap next to those three: every one
  // of them leads a live game's card with the score and the inning. This site's
  // GameStrip cards always showed first-pitch TIME, live or not, because the
  // pregame `players` rows groupGames() builds cards from have no live score
  // on them at all — the `live` snapshot above already carries it (state,
  // awayScore/homeScore, inning, half, outs, on1/on2/on3), it just never got
  // handed to the strip. Keyed by String(pk) since groupGames' game_pk can be
  // a bot-composed string key on an unpublished game while the live snapshot's
  // pk is always the league's numeric gamePk — comparing them loosely would
  // silently match nothing on exactly the slates where "is anyone in mid-game
  // right now" matters most.
  const liveByPk = useMemo(() => {
    const m = new Map()
    ;(live?.games || []).forEach((g) => { if (g?.pk != null) m.set(String(g.pk), g) })
    return m
  }, [live])

  // Group games by time slot
  const slots = useMemo(() => {
    const map = {}
    const tbd = []
    games.forEach(g => {
      const slot = timeSlot(g.game_time)
      if (slot == null) { tbd.push(g); return }
      if (!map[slot]) map[slot] = []
      map[slot].push(g)
    })
    // Numeric keys sort correctly in actual chronological order -- no more
    // string comparison across a midnight-UTC rollover.
    const sorted = Object.entries(map).sort(([a], [b]) => Number(a) - Number(b))
    if (tbd.length) sorted.push(['TBD', tbd])
    return sorted
  }, [games])

  // Default active = first non-past game
  useEffect(() => {
    if (games.length && !activeGame) {
      const first = games.find(g => !isPast(g.game_time)) || games[0]
      setActive(first.game_pk)
    }
  }, [games])

  /* ── THE MODE ROW (2026-08-16: + ⚾ Live) ─────────────────────────────────
     One const because it now renders from two returns — the grid page and the
     Live view below — and two hand-maintained copies of a four-button row is
     how they drift. The dot on the Live pill reuses the wire's green-dot
     idiom (LiveWire.js, PitcherChips) and costs nothing new: this tab already
     polls fetchLiveSlate for the lineup card watch, so "is anything actually
     in progress" is a read off state we were holding anyway — no extra
     fetch. */
  const anyLive = !!live?.games?.some((x) => x.state === 'Live')
  const modeRow = (
    <div style={{ display: 'flex', gap: 6 }}>
      <button onClick={() => setMode('default')} style={btnStyle(C.orange, mode === 'default')}>Default</button>
      <button onClick={() => setMode('lineups')} style={btnStyle(C.green,  mode === 'lineups')}>Lineups</button>
      <button onClick={() => setMode('live')} style={{ ...btnStyle(C.green, mode === 'live'), display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        {anyLive && (
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: C.green,
            boxShadow: `0 0 6px ${C.green}`, flexShrink: 0,
          }} />
        )}
        ⚾ Live
      </button>
    </div>
  )

  /* ── ⚾ LIVE — At the Plate, as a VIEW of this tab (2026-08-16) ────────────
     Consolidation rule: a tab is a QUESTION you arrive with, a view is an
     ANSWER. "What does one game look like tonight" and "what does it look
     like RIGHT NOW" are the same question asked before and during play, so
     the live room mounts here as a fourth mode instead of holding its own
     tab. AtThePlate is mounted AS-IS — it keeps its own polling, its own
     game selection and its charts; this tab just gives it a seat.
     Above the empty-slate return ON PURPOSE: the live room names its hitters
     off the league feed, so a blank board (bot not yet published) must not
     lock the door on games already in progress. gview still wins — the Boxes
     pill keeps working from any mode. */
  // 🧾 THE HOMER LEDGER — REMOVED FROM THIS TAB (2026-08-18).
  //
  // Donovan: "tka eht hr ledger form the games page tooi doens need to be
  // there" — take the HR ledger off the Games page too, it doesn't need to
  // be there. It stays mounted on Home.js and on Combos.js (the Pairs &
  // Pools view) — see the long placement note at the Home.js mount for why
  // those two earned the slot. Games is a per-game browsing tool; the
  // ledger's job (what already happened, running the whole night) doesn't
  // belong stapled above a card grid that's mid-scroll toward a specific
  // game.

  if (mode === 'live' && gview !== 'boxes') {
    return (
      <div>
        <ViewPills views={[['games', '🏟 Games'], ['boxes', '📋 Boxes']]} view={gview} setView={setGview} />
        <PanelTitle
          title="Slate"
          sub="the live batter's room — who is standing in right now, the count, every pitch, tonight's zone and spray"
          right={modeRow}
        />
        <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.6, margin: '2px 0 12px', maxWidth: 700 }}>
          <b style={{ color: C.text2 }}>What this answers:</b>{' '}
          what tonight looks like while it is happening — every live game with the man at the plate, the at-bat pitch by pitch, and where his contact is going. It wakes up at first pitch.
        </div>

        {/* allPlayers, not players, same reason as Boxes below: the live room
            is not subject to the header's team filter — filtering it makes
            live games appear to lose their hitters. players is the fallback
            only while allPlayers still defaults to []. */}
        <AtThePlate
          players={allPlayers.length ? allPlayers : players}
          watchIds={watchIds}
          mode={slateMode}
          slateMode={slateMode}
          onPlayerClick={onPlayerClick}
        />
      </div>
    )
  }

  if (!games.length) return <Empty text="No games found yet." />

  const scrollTo = (pk) => {
    if (mode === 'lineups') {
      setActive(pk)
      // focus, don't fly — re-clicking the same bubble releases it
      setLineupFocus((cur) => (cur === pk ? null : pk))
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    // card grid: clicking a card TOGGLES its in-place deep-dive below the
    // grid — re-click closes, a new card switches and scrolls to the panel
    setActive((cur) => {
      const next = cur === pk ? null : pk
      if (next != null) setTimeout(() => {
        const el = gameRefs.current[pk]
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 60)
      return next
    })
  }

  // 📋 THE FOLD, DONE RIGHT THIS TIME. Round one injected this branch INSIDE
  // the live-poll effect — the render audit found the pill turned orange and
  // showed nothing, which is exactly what Donovan reported. It now sits at
  // the real return, after every hook, so the hook order never changes.
  // allPlayers, not players: the box score of a game is not subject to the
  // header's team filter — filtering a box makes games appear to lose their
  // roster.
  if (gview === 'boxes') {
    return (
      <div>
        <ViewPills views={[['games', '🏟 Games'], ['boxes', '📋 Boxes']]} view={gview} setView={setGview} />
        <Boxes players={allPlayers.length ? allPlayers : players} watchIds={watchIds} onPlayerClick={onPlayerClick} />
      </div>
    )
  }
  return (
    <div>
      <ViewPills views={[['games', '🏟 Games'], ['boxes', '📋 Boxes']]} view={gview} setView={setGview} />
      {/* 🌬 AirBoard used to mount here (2026-08-15, same day it was built).
          Deleted: components/ParkBoard.js — "Tonight's conditions", the
          launch-pads board on Power and behind Scoreboard's "Parks ranked" —
          has done park × weather since 08-08, richer than the duplicate was.
          Two park boards diverging is the exact two-answers disease this
          repo keeps finding; Donovan's own screenshots surfaced it within
          the hour. Park-factor work goes in ParkBoard. */}
      <PanelTitle
        title="Slate"
        sub={`${games.length} games · ${slots.length} time slots · ${
          mode === 'lineups' ? 'every batting order at once — click a game bubble for slot-by-slot depth'
          : 'the slate as game cards in first-pitch order — sort them any way below, tap one and switch between its read, its lineups, the head-to-head and the picks in place'
        }`}
        right={modeRow}
      />

      {/* ONE PLAIN LINE PER MODE (2026-08-09 spoon-feed pass). The three mode
          buttons above changed the whole page and the sub-line described them
          in shorthand ("heat-sized game cards"); this says which decision each
          mode is for, in words, and it changes when you switch. */}
      <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.6, margin: '2px 0 12px', maxWidth: 700 }}>
        <b style={{ color: C.text2 }}>What this answers:</b>{' '}
        {mode === 'lineups'
          ? 'who is actually batting where tonight — every confirmed order, 1 through 9, both teams facing each other. Use it when you want to check a hitter’s lineup spot before you back him.'
          : mode === 'live'
          ? 'what is happening right now — the hitter at the plate, his zone map and spray, and who is coming up behind him. This is the At the Plate room, in place, so you do not leave the slate to watch it.'
          // 2026-08-16: this used to say "bigger, brighter cards are the
          // matchups where the board stacks highest". The quiet-style pass
          // retired heat-sizing and heat-tinting — the cards are one size on
          // a flat surface now, and the heat is carried by the band glyph and
          // the #rank. A page describing an affordance it no longer has is
          // worse than one describing none, so this says what is actually
          // true of the grid you are looking at.
          : 'which game to spend your attention on. Each card leads with its matchup; the band glyph (🌋 / 🔥 / 🧊) and the #rank beside it are where the board stacks highest. Tap one to open it in place, then flip between its four sections — the read, the lineups with what the starter does to each spot, the head-to-head, the picks — instead of scrolling past three to reach the fourth.'}
      </div>

      {/* Sort control (2026-08-12) — not shown in Lineups mode, where the strip
          is a jump bar, not the thing you're reading. Time is the default and
          matches first pitch; the other options re-order the same cards by a
          single number instead of leaving you to eyeball the heat-sizing. */}
      {mode !== 'lineups' && (
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em' }}>Sort</span>
          {[['time', 'Time'], ['gs', 'Score'], ['air', 'Best air'], ['set', 'Lineups in'], ['hr9', 'Worst HR/9'], ['whip', 'Worst WHIP'], ['lowk', 'Lowest K']].map(([k, label]) => (
            <button key={k} onClick={() => setSortBy(k)} style={{
              padding: '3px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 10.5, fontWeight: 700,
              border: `1px solid ${sortBy === k ? C.orange : C.border}`,
              background: sortBy === k ? 'rgba(249,115,22,.12)' : 'transparent',
              color: sortBy === k ? C.orange : C.text3,
            }}>{label}</button>
          ))}
        </div>
      )}

      {/* Lineups keeps the strip as its sticky jump bar; Default and Bot
          Output render the card grid as the page itself, below. */}
      {mode === 'lineups' && (
        // top: var(--hdr-h) — NOT 0 (2026-08-16). The site header is itself
        // sticky at top:0 and 85–133px tall depending on width, so a strip
        // pinned at 0 pins UNDERNEATH it and is never visible; this jump bar
        // has never actually worked. Header.js measures itself into --hdr-h.
        // (The same pass fixed body{overflow-x:hidden}, which was breaking
        // sticky site-wide — see MobileCSS.js. Both verified by screenshot.)
        <div style={{
          position: 'sticky', top: 'var(--hdr-h, 86px)', zIndex: 20, background: C.bg,
          paddingTop: 6, paddingBottom: 8, marginBottom: 14,
          borderBottom: `1px solid ${C.border}`,
          // ── THE "PAGE BREAK" FIX (2026-08-18) ────────────────────────────
          // Donovan: "when scroll down it does the dumb page break thing."
          // Header.js condenses on scroll and its own height (--hdr-h) drops
          // by ~110px in a single frame when it does — this strip's `top`
          // reads that variable, so it used to teleport up by 110px+ in one
          // frame too, which is the jump he's describing. A `top` transition
          // glides this strip to its new offset over the same beat instead
          // of snapping to it. See Header.js's own note on why the animation
          // lives here and not on the header's height itself (that path was
          // tried first and had a worse bug: it could disable condensing
          // entirely on a short page).
          transition: 'top .18s ease',
        }}>
          <GameStrip games={games} activeGame={activeGame} onSelect={scrollTo} mode={mode} onPairPick={togglePairLeg} pairIds={pairIds} live={liveByPk} />
        </div>
      )}

      {/* The slate's blind spot: hitters batting tonight the bot never
          scored. Collapsed by default, fetches only on expand. */}
      <OffBot players={players} onPlayerClick={onPlayerClick} />

      {/* LINEUPS — every game's confirmed batting orders at once, 1 through
          9, both teams side by side. The site had lineup data on every row
          and nowhere to just READ the lineups. ✓ green = confirmed, hollow =
          projected. Click a name for his modal. */}
      {/* LINEUPS 2.0 — the matchup card, PF-inspired and then some. Each
          game is one card: weather + park header (their idea), the two
          orders facing each other around a center spine, each hitter a
          full-size row with an HR-score bar, badges, and his line vs the
          arm he faces. Chips grew — a lineup you squint at isn't a tool. */}
      {/* 📱 PHONE FOLD (2026-08-09). The lineups wall is one card per game and
          each card is two nine-man orders plus a header and a pick strip —
          call it 400px a game, so twelve games is thirty screens. It is the
          longest single scroll on the site. Folded on a phone unless a game is
          already focused, in which case there is exactly one card and folding
          it would just hide what the user asked for. Desktop is untouched. */}
      {mode === 'lineups' && (
        <MobileFold
          // remount when the focus changes so tapping a game bubble in the
          // sticky strip OPENS the fold on that game rather than silently
          // focusing a card behind a closed door
          key={lineupFocus || 'all'}
          title="⚾ Every batting order"
          summary={lineupFocus ? 'the game you picked' : `${games.length} games · tap a game bubble above for slot-by-slot depth`}
          count={lineupFocus ? 1 : games.length}
          accent={C.green}
          defaultOpen={!!lineupFocus}
        >
        {/* Compact and capped at six on this tab, deliberately. Donovan:
            "make sure it doesn't take up the full page or throw it off for the
            live at-bats on the games tab." Games is a grid of cards and this is
            a header for it, not the content — narrower tiles, a shorter cap,
            and it scrolls sideways rather than wrapping into a second row that
            would push the first game card below the fold. */}
        <LiveAtBats players={players} watchIds={watchIds} compact max={6}
          onGo={(pk) => setLineupFocus(pk)} />

        {/* ── CARD WATCH (2026-08-10) ────────────────────────────────────
            Donovan: "what would be the best way to incorporate that so we can
            see the lineups."

            Per-game annotation answers "is THIS order real" once you are
            already looking at a game. It does not answer the question you
            actually open the site with at 4pm, which is "has anything changed
            since the bot ran." That is a slate-wide question and it gets a
            slate-wide answer: how many cards are up, and the names — yours
            first — that the card disagrees with the bot about.

            It renders nothing at all when there is nothing to say. A strip
            that says "0 changes" every night trains you to stop reading it. */}
        {(() => {
          if (!live?.games?.length) return null
          const inPlay = live.games.filter((x) => !x.postponed)
          const postedN = inPlay.filter((x) => x.lineupPosted).length
          const moved = []
          const out = []
          ;(players || []).forEach((p) => {
            const st = lineupStatus(live, mlbId(p), p?.game_pk, p?.lineup_spot)
            if (st.scratched) out.push(p)
            else if (st.moved) moved.push({ p, slot: st.slot })
          })
          if (!postedN) return null
          // Picks and watchlist first — those are the ones with money or
          // attention on them; the rest are context.
          const mine = (p) => (String(p?.game_pick_role || '').trim() ? 0 : watchIds?.has(playerId(p)) ? 1 : 2)
          out.sort((a, b) => mine(a) - mine(b))
          moved.sort((a, b) => mine(a.p) - mine(b.p))
          return (
            <div style={{
              display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
              padding: '8px 12px', marginBottom: 12, borderRadius: 11,
              border: `1px solid ${out.length ? 'rgba(248,113,113,.4)' : C.border}`,
              background: out.length ? 'rgba(248,113,113,.06)' : C.bg2,
            }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: C.text3 }}>
                Lineup cards
              </span>
              <span title="Games where the league has posted all nine on both sides."
                style={{ fontFamily: NUM_FONT, fontSize: 12, fontWeight: 800, color: postedN === inPlay.length ? '#4ade80' : C.text2 }}>
                {postedN}/{inPlay.length} posted
              </span>
              {!out.length && !moved.length && (
                <span style={{ fontSize: 10, color: C.text3 }}>every posted card matches the bot&apos;s order</span>
              )}
              {out.slice(0, 6).map(({ ...p }) => (
                <button key={`o${playerId(p)}`} onClick={() => { setLineupFocus(p?.game_pk || null); onPlayerClick?.(p) }}
                  title={`Not in tonight's posted lineup — the bot had him at #${p?.lineup_spot ?? '?'}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                    padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                    border: '1px solid rgba(248,113,113,.5)', background: 'rgba(248,113,113,.12)', color: '#f87171',
                  }}>
                  🚫 {String(p?.name || '').split(' ').slice(-1)[0]} out
                </button>
              ))}
              {moved.slice(0, 6).map(({ p, slot }) => (
                <button key={`m${playerId(p)}`} onClick={() => { setLineupFocus(p?.game_pk || null); onPlayerClick?.(p) }}
                  title={`Batting ${slot} tonight — the bot had him at #${p?.lineup_spot}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                    padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                    border: `1px solid ${C.orange}66`, background: 'rgba(249,115,22,.12)', color: C.orange,
                  }}>
                  ↕ {String(p?.name || '').split(' ').slice(-1)[0]} #{p?.lineup_spot}→{slot}
                </button>
              ))}
              {(out.length > 6 || moved.length > 6) && (
                <span style={{ fontSize: 9.5, color: C.text3 }}>
                  +{Math.max(0, out.length - 6) + Math.max(0, moved.length - 6)} more
                </span>
              )}
            </div>
          )
        })()}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          {lineupFocus && (
            <button onClick={() => { setLineupFocus(null); setActive(null) }} style={{
              flex: '1 1 100%', textAlign: 'left', cursor: 'pointer',
              background: 'transparent', border: `1px dashed ${C.border2}`, borderRadius: 9,
              padding: '6px 12px', fontSize: 11, fontWeight: 700, color: C.text3,
            }}>← All lineups</button>
          )}
          {(lineupFocus ? games.filter((g) => g.game_pk === lineupFocus) : games).map((g) => {
            const byTeam = {}
            ;(g.players || []).forEach((p) => {
              const t = p?.team || '?'
              ;(byTeam[t] = byTeam[t] || []).push(p)
            })
            Object.values(byTeam).forEach((l) => l.sort((a, b) => (Number(a?.lineup_spot) || 99) - (Number(b?.lineup_spot) || 99)))

            // ── THE POSTED CARD REPLACES THE BOT'S NINE (2026-08-10) ────────
            //
            // Once the league posts, this stops being the bot's guess at an
            // order and becomes the order. Three things change:
            //
            //   · rows sort by the REAL slot, not lineup_spot
            //   · hitters in the card the bot never scored are shown anyway,
            //     dimmed, with no number — the alternative is a lineup card
            //     that is missing a man, which is how "the bot didn't have
            //     them at all" happens
            //   · slate hitters who are NOT on the card fall to the bottom,
            //     struck through, instead of quietly vanishing
            //
            // Before it posts, nothing here changes: the bot's projection is
            // still the best available answer and it is labelled as one.
            const liveG = live?.games?.find((x) => Number(x.pk) === Number(g.game_pk))
            const cardPosted = !!liveG?.lineupPosted
            if (cardPosted) {
              Object.keys(byTeam).forEach((t) => {
                const side = t === g.away ? 'away' : 'home'
                const card = liveG.lineup?.[side] || []
                if (card.length < 9) return
                // mlbId, NOT Number(playerId) — playerId is the composite row
                // key "id-gamePk" and Number() of it is NaN, which collapses
                // every slate row into one Map entry. See lib/player.js.
                const byId = new Map(byTeam[t].map((p) => [mlbId(p), p]))
                const ordered = card.map((r) => {
                  const hit = byId.get(Number(r.id))
                  if (hit) { byId.delete(Number(r.id)); return hit }
                  return {
                    name: r.name, player_id: r.id, team: t,
                    game_pk: g.game_pk, lineup_spot: r.slot, off_slate: true,
                  }
                })
                // Whoever is left was on the slate and is not on the card.
                byTeam[t] = [...ordered, ...byId.values()]
              })
            }

            const any = (g.players || [])[0] || {}
            const temp = Number(any.weather_temp_f) || 0
            const wind = Number(any.weather_wind_mph) || 0
            const wLbl = String(any.wind_direction_label || '')
            const parkF = Number(any.park_hr_factor) || Number(any.park_dist_factor) || 0
            const isSel = g.game_pk === lineupFocus
            return (
              <div key={g.game_pk}
                ref={(el) => { if (el) gameRefs.current[g.game_pk] = el }}
                style={{
                flex: isSel ? '1 1 100%' : '1 1 460px', minWidth: 0, background: C.bg2,
                border: `1px solid ${isSel ? C.orange : C.border}`, borderRadius: 13, overflow: 'hidden',
                boxShadow: isSel ? `0 0 24px -8px ${C.orange}` : 'none', scrollMarginTop: 160,
              }}>
                {/* ── HEADER IS NOW THE FOCUS HANDLE (2026-08-18) ────────────
                    Donovan: "make the lineup click side more intuitive." Before
                    this, the ONLY way to zero in on one game's lineup card was
                    the sticky bubble strip pinned to the top of the page — if
                    you were already three cards down and wanted this one full
                    width, you had to scroll all the way back up to click its
                    bubble. Default mode never had that problem: its card
                    header is the click target, right where your eyes already
                    are. Lineups mode now works the same way — click this bar
                    to bring this card to full width, click it again (or the
                    "← All lineups" link above) to go back to the grid. The
                    strip still works too; both paths land on the same state. */}
                <div
                  onClick={() => {
                    // Mirrors scrollTo()'s bubble-click branch (line ~436),
                    // minus the scroll-to-top — you're already looking at the
                    // card, so keep it in view. Setting activeGame too keeps
                    // the sticky strip's highlighted bubble in sync with
                    // whichever card is actually focused below it.
                    const next = lineupFocus === g.game_pk ? null : g.game_pk
                    setLineupFocus(next)
                    setActive(next)
                  }}
                  title={isSel ? 'Back to every lineup' : 'Focus this game — full width, slot by slot'}
                  style={{
                  display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
                  padding: '9px 14px', background: C.bg3, borderBottom: `1px solid ${C.border}`,
                  cursor: 'pointer',
                }}>
                  <span style={{ fontSize: 14, fontWeight: 900, fontFamily: NUM_FONT }}>{g.away} @ {g.home}</span>
                  {/* ── THE SCORE, WHILE IT IS HAPPENING (2026-08-10) ──────
                      liveSlate has carried homeScore/awayScore/inning/half
                      since the wire was built; this card just never asked for
                      them, so a lineup you were reading at 8pm gave no hint
                      that the game was in the 6th and 5-1. Everything needed
                      is already in the snapshot the card watch above fetched
                      — this is display cost only, no extra request. */}
                  {liveG && (liveG.state === 'Live' || liveG.state === 'Final') && (
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, fontFamily: NUM_FONT }}>
                      <span style={{
                        fontSize: 13, fontWeight: 900,
                        color: liveG.state === 'Live' ? C.text : C.text2,
                      }}>{liveG.awayScore ?? 0}–{liveG.homeScore ?? 0}</span>
                      {liveG.state === 'Live' ? (
                        <span title={liveG.delayed ? liveG.detail : `${liveG.half} ${liveG.inning}`}
                          style={{ fontSize: 10, fontWeight: 800, color: liveG.delayed ? C.yellow : '#4ade80' }}>
                          {liveG.delayed ? liveG.statusLabel
                            : `${/^top/i.test(liveG.half) ? '▲' : /^bot/i.test(liveG.half) ? '▼' : '·'}${liveG.inning ?? ''}`}
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, fontWeight: 800, color: C.text3 }}>
                          {liveG.statusLabel || 'F'}
                        </span>
                      )}
                    </span>
                  )}
                  {/* THE BADGE NOW ASKS THE LEAGUE (2026-08-10). It used to
                      read the bot's own lineup_confirmed flag, which is only
                      as fresh as the last cron run — so it could say
                      "✓ confirmed" over an order the card had already
                      changed. Live posting wins; the bot's flag is the
                      fallback for before the card is up. */}
                  {(() => {
                    const anyPk = (g.players || []).find((x) => x?.game_pk)?.game_pk
                    const posted = !!live?.games?.find((x) => Number(x.pk) === Number(anyPk))?.lineupPosted
                    const col = posted ? '#4ade80' : g.lineup_confirmed ? '#FCD34D' : C.text3
                    return (
                      <span title={posted ? 'The league has posted tonight’s card — these are the real nine.'
                        : g.lineup_confirmed ? 'The bot saw a confirmed lineup on its last run; the league hasn’t posted an update since.'
                        : 'No card posted yet — this order is the bot’s projection.'}
                        style={{ fontSize: 10, color: col, fontFamily: NUM_FONT, fontWeight: 700 }}>
                        {posted ? '✓ lineup posted' : g.lineup_confirmed ? '✓ confirmed (bot)' : '◻ projected'}
                      </span>
                    )
                  })()}
                  <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{localTime(g.game_time)}</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 9, fontSize: 10, fontFamily: NUM_FONT }}>
                    {temp > 0 && <span style={{ color: temp >= 82 ? C.orange : C.text2 }}>{Math.round(temp)}°</span>}
                    {wind > 0 && <span style={{ color: /out/i.test(wLbl) ? C.orange : C.text3 }}>{/out/i.test(wLbl) ? '↗' : /in\b/i.test(wLbl) ? '↙' : '→'}{Math.round(wind)}mph</span>}
                    {parkF > 0 && <span style={{ color: parkF >= 1.03 ? C.orange : C.text3 }}>park ×{parkF.toFixed(2)}</span>}
                    {/* Same caret language as Default mode's card header —
                        one visual grammar for "this bar opens/focuses
                        something," everywhere it's true on the site. */}
                    <span style={{ color: isSel ? C.orange : C.text3, fontWeight: 800 }}>{isSel ? '▾' : '▸'}</span>
                  </span>
                </div>
                <div className="lineup-cols" style={{ display: 'flex', gap: 0 }}>
                  {Object.entries(byTeam).map(([t, lineup], ti) => (
                    <div key={t} className="lineup-col" style={{
                      flex: 1, minWidth: 0, padding: '8px 12px',
                      borderLeft: ti ? `1px solid ${C.border}` : 'none',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 5 }}>
                        <span style={{ fontSize: 11, fontWeight: 900, fontFamily: NUM_FONT }}>{t}</span>
                        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
                          vs {String(lineup[0]?.pitcher_name || 'TBD').split(' ').slice(-1)[0]}
                          {lineup[0]?.pitcher_projected ? ' ≈' : ''}
                          {lineup[0]?.pitcher_hr9 ? ` · ${Number(lineup[0].pitcher_hr9).toFixed(2)} HR/9` : ''}
                        </span>
                      </div>
                      {lineup.slice(0, cardPosted ? 14 : 9).map((p) => {
                        const hs = hrScore(p)
                        // What the league says about him RIGHT NOW. Silent
                        // until the card is actually posted — "not in the
                        // lineup" against a hitter whose team hasn't posted
                        // yet is the same false alarm in the other direction.
                        const lu = lineupStatus(live, mlbId(p), p?.game_pk, p?.lineup_spot)
                        return (
                          <div key={playerId(p)} onClick={() => { if (!p?.off_slate) onPlayerClick?.(p) }}
                            title={lu.scratched ? 'Not in tonight’s posted lineup'
                              : lu.moved ? `Batting ${lu.slot} tonight — the bot had him at ${p?.lineup_spot}`
                              : undefined}
                            style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2.5px 0', cursor: 'pointer', minWidth: 0,
                              opacity: lu.scratched ? 0.45 : 1 }}>
                            <span style={{ fontFamily: NUM_FONT, fontSize: 10, width: 11, flexShrink: 0,
                              color: lu.moved ? C.orange : C.text3, fontWeight: lu.moved ? 800 : 400 }}>
                              {lu.posted && lu.slot ? lu.slot : (p?.lineup_spot ?? '·')}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1,
                              textDecoration: lu.scratched ? 'line-through' : 'none' }}>
                              {p?.name}
                              {lu.scratched && <span style={{ fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 800, color: '#f87171', marginLeft: 4 }}>OUT</span>}
                              {lu.moved && <span style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.orange, marginLeft: 4 }}>was #{p?.lineup_spot}</span>}
                              <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3, marginLeft: 4 }}>{p?.bats}</span>
                              {/* AVG, inline (2026-08-21, on request: "batter
                                  splits and avgs... I like all those stats to
                                  sort by"). This card is a per-game lineup
                                  view, not a table — nothing here sorts by
                                  header click, so a real sortable AVG column
                                  lives on the Rundown board and the Watchlist
                                  (same season_avg field). This is the same
                                  number, glanceable right on the man's row
                                  without leaving the game card. */}
                              {Number(p?.season_avg) > 0 && (
                                <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3, marginLeft: 4 }}>
                                  {Number(p.season_avg).toFixed(3).replace(/^0/, '')}
                                </span>
                              )}
                              {String(p?.game_pick_role || '').trim() && <span style={{ fontSize: 9, marginLeft: 3 }}>🤖</span>}
                              {p?.weak_spot_flag && <span style={{ fontSize: 9, marginLeft: 2 }}>⭐</span>}
                              {Number(p?.last5_hits) >= 6 && <span style={{ fontSize: 9, marginLeft: 2 }}>🧨</span>}
                            </span>
                            {/* A man in the card the bot never scored gets a
                                blank where his number would be, not a zero.
                                A zero is a verdict; this is an absence. */}
                            <div style={{ flex: '0 0 46px', height: 6, background: 'rgba(255,255,255,.06)', borderRadius: 3, overflow: 'hidden' }}>
                              {!p?.off_slate && (
                                <div style={{ width: `${Math.min(100, hs)}%`, height: '100%', borderRadius: 3,
                                  background: hs >= 60 ? '#f97316' : hs >= 45 ? '#FCD34D' : 'rgba(255,255,255,.2)' }} />
                              )}
                            </div>
                            <span title={p?.off_slate ? 'In the lineup, but not on the bot’s slate — no model score for him tonight.' : undefined}
                              style={{ fontFamily: NUM_FONT, fontSize: 10.5, fontWeight: 800, width: 22, textAlign: 'right', flexShrink: 0,
                                color: p?.off_slate ? C.text3 : hs >= 60 ? C.orange : hs >= 45 ? '#FCD34D' : C.text3 }}>
                              {p?.off_slate ? '–' : hs.toFixed(0)}</span>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>

                {/* The game's designated picks ride under every lineup card
                    (2026-08-06, on request) — one chip per category, the same
                    five slots Results grades. */}
                {(() => {
                  const CAT_ORDER = ['TOP', 'HR', 'HIT', 'HRR', 'CONTACT']
                  const CAT_COLOR = { TOP: '#FCD34D', HR: '#FB923C', HIT: '#60A5FA', HRR: '#22d3ee', CONTACT: '#A78BFA' }
                  const CAT_SC = {
                    TOP: (p) => p?.top_board_score_v2 ?? p?.overall_score ?? 0,
                    HR: (p) => p?.hr_score ?? 0, HIT: (p) => p?.hit_score ?? 0,
                    HRR: (p) => p?.hrr_score ?? 0, CONTACT: (p) => p?.contact_score ?? 0,
                  }
                  // A player can carry more than one role (e.g. "TOP/HR") --
                  // match on any tag, not just the first, so a double-up
                  // still holds every slot (2026-08-13; mirrors
                  // BotPicksStrip.js's pickBuckets) -- but he renders as ONE
                  // chip wearing both names, not one chip per slot
                  // (2026-08-14, Donovan: "show the player once"). Primary
                  // slot (first in CAT_ORDER) drives the colour and score.
                  const roleTags = (p) => String(p?.game_pick_role || '').split('/').map((s) => s.trim().toUpperCase()).filter(Boolean)
                  const perSlot = CAT_ORDER
                    .map((cat) => {
                      const p = (g.players || []).filter((pp) => roleTags(pp).includes(cat))
                        .sort((a, b) => (CAT_SC[cat](b) || 0) - (CAT_SC[cat](a) || 0))[0]
                      return p ? { cat, p } : null
                    })
                    .filter(Boolean)
                  const byPlayer = new Map()
                  perSlot.forEach(({ cat, p }) => {
                    const k = playerId(p)
                    if (byPlayer.has(k)) byPlayer.get(k).cats.push(cat)
                    else byPlayer.set(k, { cat, cats: [cat], p })
                  })
                  const picks = [...byPlayer.values()]
                  if (!picks.length) return null
                  return (
                    <div style={{
                      padding: '7px 12px', borderTop: `1px solid ${C.border}`, background: 'rgba(255,255,255,.015)',
                    }}>
                      {/* GRID (2026-08-06): five free-wrapping chips left one
                          orphan dangling off the line on narrow cards. Auto-
                          fit cells stretch every row edge to edge instead. */}
                      {/* ONE row of five, always (2026-08-06) — the wrapped
                          second row read as clutter. Chips squeeze instead of
                          wrapping; phones get the auto-fit fallback via CSS. */}
                      <div className="pickstrip" style={{ display: 'grid', gap: 5, gridTemplateColumns: `repeat(${picks.length}, minmax(0, 1fr))`, alignItems: 'stretch' }}>
                        {picks.map(({ cat, cats, p }) => {
                          const col = CAT_COLOR[cat] || C.text3
                          return (
                            <button key={`${cat}-${playerId(p)}`} onClick={(e) => { e.stopPropagation(); onPlayerClick?.(p) }} style={{
                              display: 'flex', gap: 5, alignItems: 'baseline', cursor: 'pointer', minWidth: 0,
                              border: `1px solid ${col}55`, background: `${col}10`,
                              borderRadius: 7, padding: '3px 8px',
                            }}>
                              <span style={{ fontSize: 8.5, fontWeight: 900, color: col, fontFamily: NUM_FONT, letterSpacing: '.05em', flexShrink: 0 }}>{(cats || [cat]).join('/')}</span>
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: C.text, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{String(p?.name || '').split(' ').slice(-1)[0]}</span>
                              {/* 💸 the price, on the pick. Glows only when
                                  there is a real rate to judge it against —
                                  see components/PriceBubble.js. */}
                              <PriceBubble odds={odds} player={p} cat={cat}
                                rate={cat === 'HR' || cat === 'TOP' ? hrPerGame(p) : null} />
                              <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 800, color: col, fontFamily: NUM_FONT, flexShrink: 0 }}>{(CAT_SC[cat](p) || 0).toFixed(0)}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}

                {/* Clicking a game bubble earns the DEPTH read (2026-08-06):
                    slot-by-slot — what this arm allows to each batting-order
                    spot (live API, b1–b9) braided with what the batter in
                    that spot does against this arm's side. 🔥 = both agree. */}
                {isSel && (
                  <div style={{ borderTop: `1px solid ${C.border}`, padding: '9px 12px', background: 'rgba(249,115,22,.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 900 }}>⚔ Slot-by-slot</span>
                      <span style={{ fontSize: 9, color: C.text3 }}>
                        bar = what the arm allows THAT spot (season OPS-against, live) · right numbers = the batter&apos;s AVG/ISO vs this arm&apos;s side
                        {' '}· 💥 slot bleeds · ⭐ side match · <b style={{ color: C.orange }}>🔥 both — the built-in mismatch</b>
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      {Object.entries(byTeam).map(([t, lineup]) => (
                        <LineupSlotMatchup key={t} team={t} lineup={lineup} onPlayerClick={onPlayerClick} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        </MobileFold>
      )}

      {/* ── THE CARD GRID (restored 2026-08-08, owner feedback) ──────────
          The rundown LIST is gone as the top level: Default and Bot Output
          open on the heat-tinted, heat-SIZED game cards (GameStrip) — the
          grid Donovan liked — now carrying each game's TOP + HR headline
          picks and both lineup ✓ marks right on the card. Clicking a card
          opens the SAME in-place deep-dive the rundown had, directly under
          the grid; clicking the card (or its header) again closes it. */}
      {mode !== 'lineups' && (
        <>
          <GameStrip games={games} activeGame={activeGame} onSelect={scrollTo} mode={mode} onPairPick={togglePairLeg} pairIds={pairIds} sortBy={sortBy} live={liveByPk} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {games.filter((g) => g.game_pk === activeGame).map((g) => {
                const picks = picksFor(g)
                const isDesignated = picks.length > 0
                const sorted = isDesignated
                  ? picks
                  : [...g.players].sort((a, b) => hrScore(b) - hrScore(a)).slice(0, 4).map((p) => ({ cat: null, cats: null, p }))
                const past = isPast(g.game_time)
                const isActive = g.game_pk === activeGame
                const sides = sidesOf(g)
                const any = (g.players || [])[0] || {}
                const temp = Number(any.weather_temp_f) || 0
                const wind = Number(any.weather_wind_mph) || 0
                const wLbl = String(any.wind_direction_label || '')
                const parkF = Number(any.park_hr_factor) || Number(any.park_dist_factor) || 0

                return (
                  <section
                    key={g.game_pk}
                    ref={(el) => { gameRefs.current[g.game_pk] = el }}
                    style={{
                      scrollMarginTop: 160, minWidth: 0,
                      background: isActive ? `linear-gradient(160deg, rgba(249,115,22,.05), ${C.bg2} 45%)` : C.bg2,
                      border: `1px solid ${isActive ? 'rgba(249,115,22,.5)' : C.border}`,
                      borderRadius: 14, overflow: 'hidden',
                      boxShadow: isActive ? '0 0 26px -10px rgba(249,115,22,.5)' : 'none',
                      opacity: past && !isActive ? 0.65 : 1,
                    }}
                  >
                    {/* ── card header: matchup + duel + conditions + picks ── */}
                    <div
                      onClick={() => setActive(isActive ? null : g.game_pk)}
                      style={{ cursor: 'pointer', padding: '11px 14px 10px' }}
                      title={isActive ? 'Collapse this game' : 'Open the full read on this game'}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
                        <span style={{ fontSize: 17, fontWeight: 900, fontFamily: NUM_FONT, letterSpacing: '-.02em', color: past ? C.text3 : C.text }}>
                          {past ? '✓ ' : ''}{g.away || '—'} <span style={{ color: C.text3, fontWeight: 400 }}>@</span> {g.home || '—'}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: NUM_FONT, color: g.lineup_confirmed ? C.green : C.text3 }}>
                          {g.lineup_confirmed ? '✓ lineups in' : '◻ projected'}
                        </span>
                        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{localTime(g.game_time)}</span>
                        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 9, fontSize: 10, fontFamily: NUM_FONT, flexShrink: 0 }}>
                          {/* Same reason as the duel below: open, the air is a
                              full sentence in GameDeepDive's AirLine. */}
                          {!isActive && temp > 0 && <span title="Game-time temperature" style={{ color: temp >= 82 ? C.orange : C.text3 }}>{Math.round(temp)}°</span>}
                          {!isActive && wind > 0 && <span title={`Wind: ${wLbl || 'direction n/a'}`} style={{ color: /out/i.test(wLbl) ? C.orange : C.text3 }}>{/out/i.test(wLbl) ? '↗' : /in\b/i.test(wLbl) ? '↙' : '→'}{Math.round(wind)}</span>}
                          {!isActive && parkF > 0 && <span title="Park HR factor — above 1.00 the yard helps hitters" style={{ color: parkF >= 1.03 ? C.orange : C.text3 }}>×{parkF.toFixed(2)}</span>}
                          {/* 📸 SHARE (2026-08-23) — this matchup's picks as a
                              PNG, zero backend. stopPropagation so it doesn't
                              also toggle the card open/closed. */}
                          <button onClick={(e) => { e.stopPropagation(); downloadGameCard(g) }}
                            title="Download this game's picks as a PNG for posting"
                            aria-label="Download game card as image"
                            style={{
                              background: 'transparent', border: `1px solid ${C.border}`, color: C.text2,
                              borderRadius: 6, padding: '1px 7px', fontSize: 11, lineHeight: 1.4,
                              cursor: 'pointer',
                            }}>📸</button>
                          <span style={{ color: isActive ? C.orange : C.text3, fontWeight: 800 }}>{isActive ? '▾' : '▸'}</span>
                        </span>
                      </div>

                      {/* ── THE HEADER STEPS BACK WHEN THE GAME IS OPEN ──────
                          (2026-08-15) This strip is a CARD SUMMARY: closed, the
                          duel and the five pick chips are the whole reason to
                          scan the grid. Open, they are said again six pixels
                          below and at length — GameDeepDive now writes both
                          arms out as a read and both sides' designated picks as
                          cards carrying their market, their bar and the book's
                          price. Two arm lines above two arm paragraphs, and a
                          cramped chip row above the same picks with more on
                          them, is the density Donovan screenshotted.
                          So: closed keeps everything, open keeps identity —
                          teams, lineup state, first pitch, the air, the caret.
                          Nothing is lost in either state. */}
                      {!isActive && (<>
                      {/* the pitcher duel — each side wears the arm ITS bats face */}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 7 }}>
                        {sides.map((s) => (
                          <div key={s.team} style={{
                            flex: '1 1 200px', minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 7,
                            background: 'rgba(255,255,255,.025)', border: `1px solid ${C.border}`,
                            borderRadius: 8, padding: '4px 10px',
                          }}>
                            <span style={{ fontSize: 10.5, fontWeight: 900, fontFamily: NUM_FONT, flexShrink: 0 }}>{s.team}</span>
                            <span style={{ fontSize: 9.5, color: C.text3, flexShrink: 0 }}>vs</span>
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: C.text2, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {s.arm}{s.throws ? ` (${s.throws})` : ''}{s.projected ? ' ≈' : ''}
                            </span>
                            <span style={{ marginLeft: 'auto', display: 'flex', gap: 7, flexShrink: 0, fontFamily: NUM_FONT, fontSize: 9.5 }}>
                              {s.hr9 != null && (
                                <span title="HR allowed per 9 innings — higher favors the bats" style={{ color: s.hr9 >= 1.3 ? C.orange : C.text3, fontWeight: 700 }}>
                                  {s.hr9.toFixed(2)} HR/9
                                </span>
                              )}
                              {/* Bars speak (owner feedback 2026-08-08): the
                                  duel's HR/9 gets one too, scaled 0–2.00 like
                                  the pen board reads, when the bar toggle
                                  (below, on the picks) is on. */}
                              {barsOn && s.hr9 != null && (
                                <span style={{ width: 44, height: 5, background: 'rgba(255,255,255,.07)', borderRadius: 3, overflow: 'hidden', alignSelf: 'center' }}>
                                  <span style={{ display: 'block', width: `${Math.min(100, (s.hr9 / 2) * 100)}%`, height: '100%', background: s.hr9 >= 1.3 ? '#f87171' : s.hr9 >= 1.05 ? '#22d3ee' : '#4ade80' }} />
                                </span>
                              )}
                              {s.stars > 0 && (
                                <span title={`${s.stars} weak lineup spot${s.stars > 1 ? 's' : ''} this order can reach`} style={{ color: '#FCD34D', fontWeight: 800 }}>★{s.stars}</span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* pick chips — the bot's five slots, always visible */}
                      {picks.length > 0 && (
                        <div className="pickstrip" style={{ display: 'grid', gap: 5, gridTemplateColumns: `repeat(${picks.length}, minmax(0, 1fr))`, alignItems: 'stretch', marginTop: 8 }}>
                          {picks.map(({ cat, cats, p }) => {
                            const col = CAT_COLOR[cat] || C.text3
                            return (
                              // THE CHIP NOW CARRIES A REASON (2026-08-09).
                              // It used to read "HR · Alonso · 82" — a name and
                              // a number with nothing behind it, which is the
                              // exact complaint about our boards versus theirs.
                              // Second line is the single stat that most drives
                              // THIS category for him, in slate-relative colour;
                              // the bot's score stays beside it, smaller. Both
                              // numbers, one glance, and the stat leads.
                              // A dual-slotted player is ONE chip wearing both
                              // names (2026-08-14) — see picksFor.
                              <StatChip key={`${cat}-${playerId(p)}`} p={p} cat={cat} col={col}
                                label={(cats || [cat]).join('/')}
                                score={CAT_SCORE[cat](p) || 0}
                                odds={odds}
                                onClick={(e) => { e.stopPropagation(); onPlayerClick?.(p) }} />
                            )
                          })}
                        </div>
                      )}
                      </>)}
                    </div>

                    {/* ── expanded: the full read, in place, ONE SECTION AT A
                        TIME (2026-08-15). The four sections all still exist and
                        all still render the same components with the same
                        props — they are simply no longer stacked four screens
                        deep. See the `panel` state above for why. */}
                    {isActive && (
                      <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 14px 14px', background: 'rgba(0,0,0,.15)' }}>
                        <GamePanelPills
                          panel={panel}
                          setPanel={setPanel}
                          gamePk={g.game_pk}
                          weakSpots={(g.players || []).filter((p) => p?.weak_spot_flag).length}
                          pickCount={sorted.length}
                          arm={sides.map((s) => s.arm).filter(Boolean).join(' / ')}
                        />

                        {/* ── EVERYTHING OPENS AT ONCE (2026-08-17) ────────
                            Donovan: "honestly just have everything open up
                            when you click on the game instead. it's a lot of
                            clicking thru to look at the stats." The four
                            panels were a switcher; now they stack — read,
                            lineups (table first), head-to-head, picks — and
                            the pills scroll to their section instead of
                            swapping content. One click opens the whole game. */}
                        <div id={`gp-read-${g.game_pk}`} />
                        <GameDeepDive game={g} allPlayers={players} slateDate={slateDate} results={results} odds={odds} onPlayerClick={onPlayerClick} section="read" />

                        {/* THE LINEUPS, WHERE HE ASKED FOR THEM. Same component
                            the Lineups mode uses — it now opens on its spot
                            read (what this arm does to each batting-order slot,
                            in sentences) with the full dense table one pill
                            further in. Nothing about it is a Games-tab-only
                            copy, so the two surfaces cannot drift. */}
                        <div id={`gp-lineups-${g.game_pk}`} style={{ borderTop: `1px solid ${C.border}`, marginTop: 14, paddingTop: 12 }}>
                          <GameLineup players={g.players} onPlayerClick={onPlayerClick} />
                        </div>

                        <div id={`gp-h2h-${g.game_pk}`} style={{ borderTop: `1px solid ${C.border}`, marginTop: 14, paddingTop: 12 }}>
                          <GameDeepDive game={g} allPlayers={players} slateDate={slateDate} results={results} odds={odds} onPlayerClick={onPlayerClick} section="h2h" />
                        </div>

                        <div id={`gp-picks-${g.game_pk}`} style={{ borderTop: `1px solid ${C.border}`, marginTop: 14, paddingTop: 12 }} />
                        {(<>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '12px 0 8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11.5, fontWeight: 800 }}>
                            {isDesignated ? '🎯 This game’s bot picks' : 'Top by HR score'}
                          </span>
                          <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
                            {isDesignated
                              ? 'one per category, the same five slots Results grades'
                              : 'no designated picks published for this game yet'}
                          </span>
                          {/* THE BAR TOGGLE (2026-08-18) — replaces the old
                              Bot Output mode button. Click it to flip these
                              cards to the five-category bar view in place;
                              click again for the normal card back. Lives on
                              the picks themselves, not a page-wide mode. */}
                          <button
                            onClick={(e) => { e.stopPropagation(); setBarsOn((v) => !v) }}
                            title={barsOn ? 'Back to the normal pick cards' : "See the bot's five category bars per card"}
                            style={{
                              marginLeft: 'auto', padding: '3px 10px', borderRadius: 999, cursor: 'pointer',
                              fontSize: 10, fontWeight: 800, fontFamily: NUM_FONT,
                              border: `1px solid ${barsOn ? C.cyan : C.border}`,
                              background: barsOn ? 'rgba(34,211,238,.14)' : 'transparent',
                              color: barsOn ? C.cyan : C.text3,
                            }}
                          >📊 {barsOn ? 'Bars on' : 'Bars'}</button>
                        </div>

                        {/* FLEX, NOT GRID, on purpose — the last row stretches to
                            fill, no orphan card beside empty cells. Each card wears
                            its category as a ring + tag: one object, labelled. */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'stretch' }}>
                          {sorted.map(({ cat: slotCat, cats: slotCats, p }) => {
                            // A dual-slotted player is ONE card (2026-08-14,
                            // see picksFor) — the badge wears both names in
                            // the primary slot's colour.
                            const roleInfo = slotCat
                              ? (slotCats && slotCats.length > 1
                                ? { label: `${slotCats.join('/')} Pick`, color: (ROLE_CONFIG[slotCat] || {}).color || C.text3 }
                                : ROLE_CONFIG[slotCat])
                              : null
                            const wrap = (inner) => (
                              <div key={slotCat ? `${slotCat}-${playerId(p)}` : playerId(p)} style={{
                                flex: '1 1 240px', minWidth: 0, position: 'relative',
                                display: 'flex', flexDirection: 'column',
                                marginTop: roleInfo ? 9 : 0,
                                minHeight: 170,
                              }}>
                                {roleInfo && (
                                  <span style={{
                                    position: 'absolute', top: -8, left: 13, zIndex: 2,
                                    background: '#09090b',
                                    border: `1px solid ${roleInfo.color}99`,
                                    color: roleInfo.color, borderRadius: 6, padding: '1px 9px',
                                    fontSize: 9, fontWeight: 900, letterSpacing: '.08em',
                                    textTransform: 'uppercase', fontFamily: NUM_FONT,
                                    boxShadow: `0 0 10px ${roleInfo.color}33`,
                                  }}>{roleInfo.label}</span>
                                )}
                                <div style={{
                                  flex: 1, display: 'flex', flexDirection: 'column',
                                  borderRadius: 14,
                                  boxShadow: roleInfo
                                    ? `0 0 0 1px ${roleInfo.color}66, 0 0 16px ${roleInfo.color}1c`
                                    : 'none',
                                }}>{inner}</div>
                              </div>
                            )
                            if (barsOn) {
                  const { color: lcolor } = getRoleDisplay(p)
                  const pills = Array.isArray(p?.signal_pills) ? p.signal_pills : []
                  // Each bar in its category's site-wide colour, and the bar
                  // for the category THIS CARD IS HERE FOR renders at full
                  // weight while the rest sit dimmed — so the card answers
                  // "why is he here" at a glance instead of five identical
                  // bars. Uses the slot(s) this card was picked for (slotCat/
                  // slotCats, carried from picksFor) rather than re-reading
                  // his first tag off game_pick_role — and since a dual-slot
                  // player is ONE merged card now (2026-08-14), a TOP/HR
                  // double-up lights BOTH his bars on that one card.
                  const scores = [
                    { k: 'hr_score',      l: 'HR',  c: '#FB923C', cat: 'HR' },
                    { k: 'hrr_score',     l: 'HRR', c: '#22d3ee', cat: 'HRR' },
                    { k: 'hit_score',     l: 'HIT', c: '#60A5FA', cat: 'HIT' },
                    { k: 'contact_score', l: 'CTG', c: '#A78BFA', cat: 'CONTACT' },
                    { k: 'overall_score', l: 'OVR', c: '#FCD34D', cat: 'TOP' },
                  ]
                  return wrap(
                    <div
                      onClick={() => onPlayerClick?.(p)}
                      style={{
                        background: C.bg2, border: `1px solid ${C.border}`,
                        borderRadius: 10,
                        padding: '11px 14px', cursor: 'pointer', flex: 1,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2, minWidth: 0 }}>
                        {/* same rule as PlayerCard: long names shrink, never clip */}
                        <span title={p?.name || ''} style={{
                          fontSize: String(p?.name || '').length > 18 ? 11.5 : 13,
                          fontWeight: 700, lineHeight: 1.25, minWidth: 0,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{p?.name || '—'}</span>
                      </div>
                      <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginBottom: 8 }}>
                        {p?.team} #{p?.lineup_spot ?? '?'} · vs {p?.pitcher_name || '?'} ({p?.pitcher_throws || '?'})
                      </div>
                      {scores.map(({ k, l, c, cat }) => {
                        const val = Math.min(100, Math.max(0, p?.[k] || 0))
                        // Every slot he holds lights its own bar (2026-08-14)
                        // — a merged TOP/HR card highlights OVR and HR both.
                        const isHis = slotCats ? slotCats.includes(cat) : cat === slotCat
                        return (
                          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, opacity: isHis || !slotCat ? 1 : 0.5 }}>
                            <span style={{ width: 26, fontSize: 9, color: isHis ? c : C.text3, fontWeight: isHis ? 800 : 400, fontFamily: NUM_FONT, textTransform: 'uppercase' }}>{l}</span>
                            <div style={{ flex: 1, height: isHis ? 6 : 4, background: 'rgba(255,255,255,0.07)', borderRadius: 3 }}>
                              <div style={{ width: `${val}%`, height: '100%', background: c, borderRadius: 3, boxShadow: isHis ? `0 0 8px ${c}66` : 'none' }} />
                            </div>
                            <span style={{ width: 24, fontSize: 10, fontWeight: isHis ? 800 : 400, color: isHis ? c : 'rgba(255,255,255,0.6)', fontFamily: NUM_FONT, textAlign: 'right' }}>{val.toFixed(0)}</span>
                          </div>
                        )
                      })}
                      {/* MORE BARS (owner feedback 2026-08-08): Bot Output is
                          the graph view — the card's remaining numbers join
                          the bar language instead of sitting as text. Same
                          row grammar as the five categories, dimmer voice.
                          ARM is the opposing starter's HR/9 on a 0–2.00 bar
                          (higher = the arm bleeds homers, good for the bat). */}
                      {(() => {
                        const extras = [
                          { l: 'HRW', v: Number(p?.hrw_score) || 0, max: 100, c2: '#f472b6', txt: (Number(p?.hrw_score) || 0).toFixed(0), tip: 'HR Watch score' },
                          { l: 'DMG', v: Number(p?.damage_conversion_score) || 0, max: 100, c2: '#34d399', txt: (Number(p?.damage_conversion_score) || 0).toFixed(0), tip: 'Damage conversion score' },
                          { l: 'ARM', v: Number(p?.pitcher_hr9) || 0, max: 2, c2: '#f87171', txt: (Number(p?.pitcher_hr9) || 0).toFixed(2), tip: 'Opposing starter HR/9 — bar runs 0 to 2.00, higher favors the bat' },
                        ].filter((e) => e.v > 0)
                        if (!extras.length) return null
                        return (
                          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 5 }}>
                            {extras.map((e) => (
                              <div key={e.l} title={e.tip} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, opacity: 0.85 }}>
                                <span style={{ width: 26, fontSize: 9, color: C.text3, fontFamily: NUM_FONT, textTransform: 'uppercase' }}>{e.l}</span>
                                <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 3 }}>
                                  <div style={{ width: `${Math.min(100, (e.v / e.max) * 100)}%`, height: '100%', background: e.c2, borderRadius: 3 }} />
                                </div>
                                <span style={{ width: 30, fontSize: 10, color: 'rgba(255,255,255,0.6)', fontFamily: NUM_FONT, textAlign: 'right' }}>{e.txt}</span>
                              </div>
                            ))}
                          </div>
                        )
                      })()}
                      {pills.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                          {pills.map((pill, i) => (
                            <span key={i} title={pillMeta(pill).title} style={pillStyle(pill, NUM_FONT)}>{pill}</span>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); onAdd?.(p, p?.best_bet_type) }}
                        style={{ width: '100%', marginTop: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)', borderRadius: 8, padding: '6px 10px', fontSize: 11, cursor: 'pointer' }}
                      >
                        + Add to Slip
                      </button>
                    </div>
                  )
                }
                            return wrap(
                              <PlayerCard
                                p={p} type="hr"
                                onAdd={onAdd} onWatch={onWatch}
                                watched={watchIds.has(playerId(p))}
                                onClick={() => onPlayerClick?.(p)}
                              />
                            )
                          })}
                        </div>
                        </>)}
                      </div>
                    )}
                  </section>
                )
              })}
          </div>
        </>
      )}

      {/* ProjectedOutput moved to the Scoreboard/Rundown tab 2026-08-18 — see
          components/tabs/Scoreboard.js for the note. Donovan: "put the
          projected output on the scoreboard page." */}

      {/* sticky at the bottom while you shop the grid */}
      <PairTray
        legs={pairLegs}
        market={pairMarket}
        onMarket={setPairMarket}
        onRemove={togglePairLeg}
        onClear={() => setPairLegs([])}
        pairHistorySummary={pairHistorySummary}
        onPlayerClick={onPlayerClick}
      />
    </div>
  )
}

// ── THE OPEN GAME'S SEGMENTED CONTROL (2026-08-15) ──────────────────────────
//
// Four sections of one game, four buttons, no scrolling between them. The
// counts on the pills are the point of putting them here rather than in a
// dropdown: "Lineups ★2" says there is something in there worth the tap
// BEFORE you tap it, which a bare label cannot do.
//
// The line underneath is the same "what this answers" sentence the mode
// buttons at the top of the tab already carry — a control that changes the
// whole panel should say what it just did in words.
const GAME_PANELS = [
  ['read',    'The read'],
  ['lineups', 'Lineups'],
  ['h2h',     'Head-to-head'],
  ['picks',   'Picks'],
]
const PANEL_SUB = {
  read: 'tonight’s air, both starters written out, and this game’s storylines.',
  // Caption updated 2026-08-17 with the default flip: the table leads now, the
  // spot read is the pill. A caption promising the old order would send people
  // hunting for a click that no longer exists.
  lineups: 'both batting orders 1 through 9 as the full stat table — every column sortable, with the spot read (what this arm has done to each slot, in words) one pill over.',
  h2h: 'what these hitters have done against tonight’s starter across their careers, both sides.',
  picks: 'the bot’s designated slots for this game as full cards — score bars, pills, add to slip.',
}
// JUMP LINKS NOW, NOT A SWITCHER (2026-08-17). All four sections render
// stacked — "just have everything open up when you click on the game" — so a
// pill's job is to scroll you there, not to swap content. gamePk scopes the
// anchor ids so two open cards can't collide.
function GamePanelPills({ panel, setPanel, weakSpots = 0, pickCount = 0, arm = '', gamePk = '' }) {
  const badge = { lineups: weakSpots ? `★${weakSpots}` : '', picks: pickCount ? String(pickCount) : '' }
  const jump = (k) => {
    setPanel(k)
    try {
      document.getElementById(`gp-${k}-${gamePk}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch { /* ignore */ }
  }
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {GAME_PANELS.map(([k, label]) => {
          const on = panel === k
          return (
            <button
              key={k}
              onClick={(e) => { e.stopPropagation(); jump(k) }}
              title={PANEL_SUB[k]}
              style={{
                padding: '4px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 10.5,
                fontWeight: 800, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
                border: `1px solid ${on ? C.orange : C.border}`,
                background: on ? 'rgba(249,115,22,.14)' : 'transparent',
                color: on ? C.orange : C.text3,
              }}
            >
              {label}
              {badge[k] && (
                <span style={{ marginLeft: 5, color: on ? C.orange : C.yellow, fontWeight: 900 }}>{badge[k]}</span>
              )}
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.6, marginTop: 5, maxWidth: 720 }}>
        {PANEL_SUB[panel]}
        {panel === 'lineups' && arm && (
          <span style={{ color: C.text3 }}> Tonight: {arm}.</span>
        )}
      </div>
    </div>
  )
}

// A view pill row — the fold pattern (2026-08-15). The folded page keeps its
// own tab key alive for deep links; this is just its seat at the host's table.
function ViewPills({ views, view, setView }) {
  return (
    <div style={{ display: 'flex', gap: 5, marginBottom: 10, flexWrap: 'wrap' }}>
      {views.map(([k, label]) => (
        <button key={k} onClick={() => setView(k)} style={{
          padding: '4px 13px', borderRadius: 999, cursor: 'pointer', fontSize: 10.5,
          fontWeight: 800, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
          border: `1px solid ${view === k ? C.orange : C.border}`,
          background: view === k ? 'rgba(249,115,22,.14)' : 'transparent',
          color: view === k ? C.orange : C.text3,
        }}>{label}</button>
      ))}
    </div>
  )
}
