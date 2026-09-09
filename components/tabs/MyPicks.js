'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { nameOf, teamOf, txt } from '../../lib/player'
import { groupGames } from '../../lib/data'
import { alpha } from '../../lib/scales'
import { CATEGORIES } from '../BotPicksStrip'
import OddsLine from '../OddsLine'
import { WhatThis } from '../ui'
import VerdictHero from '../VerdictHero'
import { quoteFor, fmtOdds } from '../../lib/odds'
import {
  BAR, isLocked, getPicks, savePick, clearPick, setConviction, setWhy, slotKey,
  CONVICTION, WHY, WHY_LABEL, DEPTH_LABEL, DEPTH_ORDER, MIN_TELL,
  gradeSlate, recordNight, ledgerTotals, readLedger, nightVerdict,
  sliceRows, strongest, exportStore, importStore, clearAll,
} from '../../lib/myPicks'

// 🎫 MY PICKS — put your guy in the bot's slot, get graded on it.
//
// 2026-08-14, Donovan: "mainly for me to hep me figure what i think goes and
// thien to compare hit rate to the bot to update scoing."
//
// The four categories, one slot per game, exactly the slots the bot fills.
// Swap whoever you want in; at first pitch the slot freezes; overnight it
// grades on the same bar the bot's own pick had to clear.
//
// TWO NUMBERS, AND THEY ANSWER DIFFERENT QUESTIONS. The headline is the
// head-to-head on slots you actually CONTESTED — that's the only figure with
// any claim on the scoring, because it holds the game, the category and the
// bar fixed and varies exactly one thing: the name. The full-card rate is
// underneath, softer on purpose: most of your card is the bot's own picks, so
// the two rates converge toward each other no matter who's right.
//
// The category list is imported, not re-declared. Two surfaces naming
// different hitters as "the bot's pick" is a failure this project has had.
//
// ── A GAME, AND AN INSTRUMENT (2026-08-16) ───────────────────────────────────
//
// Donovan: "my picks is supposed to be like a game, you vs the bot, so make it
// interactive. but it's also supposed to help fine tune it."
//
// WHAT MAKES IT A GAME, concretely, and none of it a new way to win a slot:
//
//   1. TONIGHT LEADS THE PAGE, as a scoreboard. It opens 0–0 before first
//      pitch with what you have riding and when the first slot freezes, and it
//      ends with tonight's result in the same two numerals. That is the
//      question you actually open the tab with at 6pm, and the page used to
//      answer it third, in a paragraph, under the season record.
//   2. A SWAP IS A MOVE. The <select> is gone. You open the bot's own board
//      for that category — ranked, priced, its designated pick marked — and
//      take a name off it. The row then tells you what you just did: "you took
//      its #7 of 24". Giving the slot back is one tap on the same board.
//   3. YOU DECLARE SOMETHING. Conviction was already there; a reason is new
//      and optional. Both are frozen with the slot at first pitch.
//
// WHAT MAKES IT AN INSTRUMENT. "Where do I beat it" is now four slices of the
// SAME contested set — category, reason, how deep you reached, conviction —
// with one plain sentence on top naming the most lopsided of them. A slice
// with fewer than MIN_TELL slots is printed but gets no opinion attached to
// it. The reason slice is the one that can actually change scoring: it names
// the TERM you were re-weighting when you were right.
//
// TILES LOSE TO SENTENCES — said five separate times, so the only things on
// this page allowed to be big are the two scorelines. Every rate is a k/n.
//
// GONE THIS PASS: the coin-flip line. Correct, and he read it and said he
// didn't know what it was, so it was decoration with a footnote. Nothing
// statistical replaced it; the 25-slot bar and the printed denominators were
// already carrying that weight. Nothing else was removed.

const pctTxt = (v) => (v == null ? '—' : `${v.toFixed(1)}%`)

// A category's colour and label, from the one CATEGORIES list the whole site
// ranks on — never a second table of role names in this file.
const ROLE_META = Object.fromEntries(CATEGORIES.map((c) => [c.role, c]))
const roleColor = (r) => ROLE_META[r]?.color || C.text2
const roleLabel = (r) => ROLE_META[r]?.label || r

// Ledger dates are YYYY-MM-DD. Noon avoids the timezone slip that makes a
// midnight-parsed date render as the day before west of UTC.
const shortDate = (d) => {
  const t = new Date(`${d}T12:00:00`)
  return Number.isFinite(t.getTime())
    ? t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : String(d || '')
}

// Takes anything Date takes — an ISO string off the slate or the epoch ms the
// freeze clock is computed in.
const clockOf = (v) => {
  const t = v ? new Date(v) : null
  return t && Number.isFinite(t.getTime())
    ? t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null
}

// How deep you reached, said as a phrase that fits inside a sentence. The
// labels in lib/myPicks.js are column headings; these are prose, and the two
// jobs are different enough that jamming one into the other reads wrong.
const DEPTH_PHRASE = {
  top: 'from its own top three',
  down: 'from down its board, fourth through tenth',
  off: 'from off its board, eleventh or deeper',
}

// A slot is cleared or it isn't — there is no margin in a binary outcome. So
// the reel ranks by the only size a call carries: how sure you said you were
// before first pitch. Said out loud in the UI rather than left to be guessed.
const CONV_WEIGHT = { lock: 3, strong: 2, lean: 1 }
const callRank = (c) => (CONV_WEIGHT[c?.c] || 2)

const panel = (accent) => ({
  background: C.bg2,
  border: `1px solid ${C.border}`,
  borderLeft: `3px solid ${accent}`,
  borderRadius: 14,
  padding: '16px 18px',
  marginBottom: 14,
})

// The progress rail toward the 25-slot bar. A rail, not a tile: it's one fact
// (how far along you are) and it belongs on the same line as the sentence that
// explains it.
function Rail({ value, max, color }) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0))
  return (
    <span style={{
      display: 'inline-block', width: 120, height: 5, borderRadius: 999,
      background: 'rgba(255,255,255,.08)', overflow: 'hidden', verticalAlign: 'middle',
    }}>
      <span style={{
        display: 'block', width: `${pct * 100}%`, height: '100%',
        borderRadius: 999, background: color,
      }} />
    </span>
  )
}

// 🟩 YOUR NIGHTS, AS A STRIP (2026-08-15, "make the my pick page fun and
// interactive"). Each square is one graded night of head-to-head: green you
// beat the bot on contested slots, red it beat you, grey a push or a night
// you didn't contest.
//
// The verdict rule moved to lib/myPicks.js (nightVerdict) — this strip used to
// carry its own inline copy, and a second definition of "a night you won" is
// exactly the kind of drift that makes two surfaces disagree. The streak
// LABEL that used to sit here also moved, into the standing sentence below,
// which can say both the current run and the longest one; the glow on the
// trailing squares still marks the run itself.
function NightStrip({ bump }) {
  const rows = useMemo(() => readLedger().slice(-20), [bump])
  if (rows.length < 2) return null
  let streak = 0
  const last = nightVerdict(rows[rows.length - 1])
  if (last !== 0) {
    for (let i = rows.length - 1; i >= 0 && nightVerdict(rows[i]) === last; i--) streak += 1
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
      <span style={{ display: 'inline-flex', gap: 2 }}>
        {rows.map((r, i) => {
          const v = nightVerdict(r)
          return (
            <span key={r.date || i}
              title={`${r.date} — you ${r.mw ?? 0}, bot ${r.bw ?? 0} on ${r.n ?? 0} contested (${r.w ?? 0}–${r.l ?? 0}–${r.t ?? 0})`}
              style={{
                width: 7, height: 7, borderRadius: 1.5,
                background: v > 0 ? C.green : v < 0 ? `${C.red}cc` : 'rgba(255,255,255,.14)',
                boxShadow: i >= rows.length - streak && last !== 0 && v === last
                  ? `0 0 4px ${last > 0 ? `${C.green}99` : `${C.red}88`}` : 'none',
              }} />
          )
        })}
      </span>
    </span>
  )
}

function Pill({ tone, children, title }) {
  const col = tone === 'won' ? C.green
    : tone === 'lost' ? C.red
      : C.text3
  return (
    <span title={title} style={{
      fontFamily: NUM_FONT, fontSize: 9, fontWeight: 800, letterSpacing: '.04em',
      padding: '1.5px 7px', borderRadius: 999, whiteSpace: 'nowrap',
      border: `1px solid ${col}66`, background: `${col}1a`, color: col,
    }}>{children}</span>
  )
}

// Three outcomes plus "nothing yet" — see the verdict block in lib/myPicks.js.
function outcomePill(out, pending) {
  if (out === true) return <Pill tone="won">HIT</Pill>
  if (out === false) return <Pill tone="lost">MISS</Pill>
  if (out === null) return <Pill tone="void" title="Tracked, but never batted — void, not a miss. Dropped from both sides.">VOID</Pill>
  if (pending) return null
  return (
    <Pill tone="void" title="The graded file has no line for him — he isn't one of the ~90 candidates the bot tracks, so there's nothing to score him against.">
      UNTRACKED
    </Pill>
  )
}

// One line of the standing. Not a tile — a sentence with a leading glyph, so
// the block reads top to bottom as a story instead of scanning as a grid.
function Line({ icon, children, color, dim }) {
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'baseline',
      fontSize: dim ? 11 : 12, color: dim ? C.text3 : C.text2,
      lineHeight: 1.75, marginTop: 8,
    }}>
      <span style={{ flex: '0 0 auto', color: color || C.text3 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    </div>
  )
}

// A number in the middle of a sentence still gets the numeral font — that's
// the house rule, and it's what makes a k/n readable at 11px.
function Num({ children, color }) {
  return <b style={{ fontFamily: NUM_FONT, color: color || C.text }}>{children}</b>
}

// A quiet section rule. The page is long and it has three jobs (tonight, the
// standing, the card); a small caps line and air between them beats a border.
function Heading({ children, note, top = 20 }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap',
      marginTop: top, marginBottom: 2,
    }}>
      <span style={{
        fontSize: 10, fontWeight: 900, letterSpacing: '.13em',
        textTransform: 'uppercase', color: C.text3,
      }}>{children}</span>
      {note && <span style={{ fontSize: 10.5, color: C.text3 }}>{note}</span>}
    </div>
  )
}

// One tap-sized declaration: conviction, or a reason. Renders as static text
// when there's no handler, which is what a frozen slot gets.
function Chip({ on, color, onClick, title, children }) {
  const col = color || C.text2
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={!onClick}
      style={{
        fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 900, letterSpacing: '.06em',
        padding: '2.5px 8px', borderRadius: 999, textTransform: 'uppercase',
        cursor: onClick ? 'pointer' : 'default', whiteSpace: 'nowrap',
        border: `1px solid ${on ? `${col}88` : C.border}`,
        background: on ? `${col}1f` : 'transparent',
        color: on ? col : C.text3,
      }}
    >{children}</button>
  )
}

// A slice of the contested set, as sentences. Every row prints its own k/n —
// a 2–0 is two slots and it says so — and the tail is where a slice is allowed
// to have an opinion, only once it has cleared MIN_TELL.
function Slice({ rows, labelOf, colorOf, tail, minWidth = 58 }) {
  return rows.map((r) => {
    const col = r.lead > 0 ? C.green : r.lead < 0 ? C.red : C.text2
    const chipCol = colorOf ? colorOf(r.k) : C.text2
    return (
      <div key={r.k} style={{
        display: 'flex', gap: 9, alignItems: 'baseline', flexWrap: 'wrap',
        fontSize: 11.5, color: C.text2, lineHeight: 1.9, marginLeft: 22,
      }}>
        <b style={{
          fontFamily: NUM_FONT, fontSize: 9, fontWeight: 900,
          color: chipCol, border: `1px solid ${chipCol}55`,
          background: `${chipCol}14`, borderRadius: 6,
          padding: '1px 7px', minWidth, textAlign: 'center',
        }}>{labelOf(r.k)}</b>
        <span>
          <Num color={col}>{r.w}–{r.l}{r.push ? `–${r.push}` : ''}</Num> on{' '}
          <Num>{r.n}</Num> contested — you <Num color={C.green}>{r.mw}/{r.n}</Num>,
          it <Num color={C.purple}>{r.bw}/{r.n}</Num>
          {tail?.(r)}
        </span>
      </div>
    )
  })
}

// ══ THE GAME RAIL ═══════════════════════════════════════════════════════════
//
// One sideways row of games, one open at a time. It is the same idiom as the
// Games tab's own switcher (components/GameSwitcher.js) and deliberately not
// that component: that one is a PHONE-ONLY sticky bar that publishes its
// height into --gsw-h so the section pills can stack under it. Mounting it
// here would put a second bar at the same sticky offset on every page that
// renders both, which is exactly the overlap its own notes describe fixing.
// So: same chip, same ‹ › steppers, same auto-centring, in flow, on every
// screen size, with one thing that switcher has no business knowing — how
// YOUR card is doing in each game.
//
// The chip carries three things and no more: the matchup, the clock (or 🔒
// once it is frozen, since a first-pitch time you have passed is no longer a
// fact you can act on), and your own state — how many of the four slots you
// have taken, and the head-to-head in that game once anything has settled.
function GameRail({ games = [], active, onSelect, stateOf = {}, now }) {
  const railRef = useRef(null)
  const onRef = useRef(null)

  // Keep the open game inside the rail, including when ‹ › moved it — the
  // case that would otherwise walk the lit chip straight off the edge.
  useEffect(() => {
    const el = onRef.current
    if (el && el.scrollIntoView) {
      try { el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }) } catch { /* older Safari */ }
    }
  }, [active])

  if (!games.length) return null
  const idx = games.findIndex((g) => g.game_pk === active)
  const step = (d) => { const nx = games[idx + d]; if (nx) onSelect(nx.game_pk) }

  const arrow = (label, d, off) => (
    <button
      onClick={off ? undefined : () => step(d)}
      aria-label={d < 0 ? 'Previous game' : 'Next game'}
      style={{
        flexShrink: 0, width: 28, height: 28, borderRadius: 9, lineHeight: 1,
        cursor: off ? 'default' : 'pointer', border: `1px solid ${C.border}`,
        background: 'transparent', color: off ? C.border2 : C.text2,
        fontSize: 15, fontWeight: 900,
      }}
    >{label}</button>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
      {arrow('‹', -1, idx <= 0)}
      <div
        ref={railRef}
        className="game-switcher-rail"
        style={{
          flex: 1, minWidth: 0, display: 'flex', gap: 6, overflowX: 'auto',
          WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', padding: '2px 0',
        }}
      >
        {games.map((g) => {
          const on = g.game_pk === active
          const st = stateOf[g.game_pk] || null
          const locked = isLocked(g.game_time, now)
          const t = g.game_time ? new Date(g.game_time) : null
          const clock = locked ? '🔒' : (t
            ? t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '')
            : 'TBD')
          const lead = st && st.contested ? st.w - st.l : null
          return (
            <button
              key={g.game_pk}
              ref={on ? onRef : undefined}
              onClick={() => onSelect(g.game_pk)}
              title={`${g.away || '—'} @ ${g.home || '—'}`}
              style={{
                flexShrink: 0, cursor: 'pointer', borderRadius: 999, padding: '5px 11px',
                display: 'flex', alignItems: 'baseline', gap: 6,
                border: `1px solid ${on ? C.orange : C.border}`,
                background: on ? alpha(C.orange, 0.14) : 'transparent',
              }}
            >
              <span style={{
                fontSize: 11, fontWeight: 900, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
                letterSpacing: '-.02em', color: on ? C.orange : C.text2,
              }}>{g.away || '—'}<span style={{ opacity: .5, fontWeight: 400 }}>@</span>{g.home || '—'}</span>
              <span style={{
                fontSize: 8.5, fontFamily: NUM_FONT, fontWeight: 700, whiteSpace: 'nowrap',
                color: on ? C.text2 : C.text3,
              }}>{clock}</span>
              {/* YOUR STATE IN THIS GAME. The dot is how many slots you took;
                  once something in it has settled the dot gives way to the
                  head-to-head, because a result outranks a count. */}
              {st && st.mine > 0 && (
                lead == null ? (
                  <span style={{
                    fontSize: 8.5, fontFamily: NUM_FONT, fontWeight: 900, whiteSpace: 'nowrap',
                    color: C.cyan,
                  }}>●{st.mine}</span>
                ) : (
                  <span style={{
                    fontSize: 8.5, fontFamily: NUM_FONT, fontWeight: 900, whiteSpace: 'nowrap',
                    color: lead > 0 ? C.green : lead < 0 ? C.red : C.text3,
                  }}>{st.w}–{st.l}</span>
                )
              )}
            </button>
          )
        })}
      </div>
      {arrow('›', 1, idx < 0 || idx >= games.length - 1)}
    </div>
  )
}

// ══ BOT VS YOU ══════════════════════════════════════════════════════════════
//
// Donovan, 2026-08-24: "add aspect on bot pick vs user pick."
//
// The old row said it with a strike-through: its name crossed out, an arrow,
// then yours. That tells you a swap happened and nothing about whether it was
// a good one. This is the comparison drawn as a comparison — two columns, the
// SAME three facts on each side, so the eye does the work:
//
//   the name · that category's own score · the book's price on the same bar
//
// and, once the night grades, what each of them actually did.
//
// TWO MEASURES, AND THEY ARE NOT THE SAME MEASURE. The score is the model's
// ranking and the price is the market's — when they disagree about your man
// that disagreement is the most useful thing on the card, and it is only
// visible because both are printed on both sides. A price appears only when
// the book is quoting the bar this slot is graded on (quoteFor's `matches`),
// so a 2+ TB quote can never sit under a 1+ pick.
//
// NEITHER COLUMN IS LIT BEFORE THE NIGHT DECIDES IT. A higher score is not a
// win; the whole page exists because the score is sometimes wrong. The wash
// only goes on once a slot is contested and graded.
function Versus({
  cat, bot, botScore, botPrice, botOut,
  mine, mineScore, minePrice, mineOut,
  contested, pending, locked, boardOpen,
  onOpenBoard, onClear, onBot, onMine,
}) {
  const decided = contested && !pending
  const youWon = decided && mineOut && !botOut
  const botWon = decided && !mineOut && botOut

  const col = (won) => ({
    flex: 1, minWidth: 0, borderRadius: 12, padding: '8px 10px',
    border: `1px solid ${won ? alpha(C.green, .45) : C.border}`,
    background: won ? alpha(C.green, .09) : C.glass,
    display: 'flex', flexDirection: 'column', gap: 3,
  })
  const head = { fontSize: 8, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase', fontFamily: NUM_FONT }
  const nameStyle = (dim) => ({
    background: 'none', border: 'none', padding: 0, textAlign: 'left', minWidth: 0,
    fontSize: 12.5, fontWeight: 800, color: dim ? C.text3 : C.text,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 7 }}>
        {/* ── THE BOT ── */}
        <span style={col(botWon)}>
          <span style={{ ...head, color: C.text3 }}>The bot</span>
          <button onClick={onBot} disabled={!bot} style={{ ...nameStyle(Boolean(mine)), cursor: bot ? 'pointer' : 'default' }}>
            {bot ? nameOf(bot) : 'no pick'}
          </button>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
            {bot && <span style={{ fontSize: 9.5, fontFamily: NUM_FONT, color: C.text3 }}>{teamOf(bot)}</span>}
            {botScore != null && (
              <b style={{ fontSize: 13, fontFamily: NUM_FONT, color: cat.color }}>{botScore}</b>
            )}
            {botPrice && (
              <span style={{ fontSize: 9.5, fontFamily: NUM_FONT, fontWeight: 700, color: C.text3 }}>{botPrice}</span>
            )}
          </span>
          {bot && <span style={{ marginTop: 2 }}>{outcomePill(botOut, pending)}</span>}
        </span>

        {/* ── YOU ── */}
        <span style={col(youWon)}>
          <span style={{ ...head, color: mine ? cat.color : C.text3 }}>You</span>
          {mine ? (
            <>
              <button onClick={onMine} style={{ ...nameStyle(false), cursor: 'pointer' }}>{mine.name}</button>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
                {mine.team && <span style={{ fontSize: 9.5, fontFamily: NUM_FONT, color: C.text3 }}>{mine.team}</span>}
                {mineScore != null && (
                  <b style={{ fontSize: 13, fontFamily: NUM_FONT, color: cat.color }}>{mineScore}</b>
                )}
                {minePrice && (
                  <span style={{ fontSize: 9.5, fontFamily: NUM_FONT, fontWeight: 700, color: C.text3 }}>{minePrice}</span>
                )}
              </span>
              <span style={{ marginTop: 2 }}>{outcomePill(mineOut, pending)}</span>
            </>
          ) : (
            <span style={{ fontSize: 11.5, color: C.text3, lineHeight: 1.5 }}>
              {locked ? 'You left it with the bot.' : 'Empty — this slot is still its pick.'}
            </span>
          )}
        </span>
      </div>

      {/* THE VERDICT LINE. Only a contested, graded slot gets a call; an
          uncontested one says why there is nothing to call rather than
          printing a quiet dash that reads like a loss. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {decided ? (
          <Pill tone={youWon ? 'won' : botWon ? 'lost' : 'void'}>
            {youWon ? 'YOU WIN' : botWon ? 'BOT WINS' : 'PUSH'}
          </Pill>
        ) : (
          <span style={{ fontSize: 10, color: C.text3 }}>
            {!mine ? 'not contested' : pending ? 'riding — nothing back yet' : locked ? 'locked, waiting' : 'open to change'}
          </span>
        )}
        {!locked && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
            {mine && (
              <button onClick={onClear} style={{ ...btn(), color: C.text3 }}>Give it back</button>
            )}
            <button
              onClick={onOpenBoard}
              style={{
                ...btn(),
                color: mine ? cat.color : C.text2,
                borderColor: mine ? `${cat.color}77` : C.border,
                background: mine ? `${cat.color}1a` : 'rgba(255,255,255,.035)',
              }}
            >
              {mine ? 'Change' : 'Take someone else'} <span style={{ fontSize: 9, opacity: .8 }}>{boardOpen ? '▲' : '▼'}</span>
            </button>
          </span>
        )}
      </div>
    </div>
  )
}

export default function MyPicks({ players = [], results, odds, slateDate, onPlayerClick }) {
  const [picks, setPicks] = useState({})
  const [now, setNow] = useState(() => Date.now())
  const [msg, setMsg] = useState('')
  const [bump, setBump] = useState(0)          // forces a ledger re-read
  const [openSlot, setOpenSlot] = useState(null)   // which board is open
  const [showAll, setShowAll] = useState({})       // per slot: whole pool, not the top 8
  const [openGame, setOpenGame] = useState(null)   // which game the card is showing
  const fileRef = useRef(null)

  // localStorage is client-only — read after mount, never during render.
  useEffect(() => { setPicks(getPicks(slateDate)) }, [slateDate])

  // Lock state is a function of wall-clock, so it has to tick on its own or a
  // slot stays editable until something else happens to re-render the page.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const games = useMemo(() => groupGames(players), [players])

  // The whole card: one entry per game per category, with the bot's designated
  // pick and your override if you made one.
  const slots = useMemo(() => {
    const out = []
    games.forEach((g) => {
      CATEGORIES.forEach((cat) => {
        const pool = g.players.filter((p) => String(p?.game_pick_role || '')
          .split('/').map((s) => s.trim()).includes(cat.role))
        // Supposed to be exactly one per role per game since the bot's
        // 2026-08-06 fix. If an older payload has two, rank by the category's
        // own score rather than taking whichever came first out of the file.
        const bot = pool.sort((a, b) => cat.score(b) - cat.score(a))[0] || null
        out.push({
          game_pk: g.game_pk,
          game_time: g.game_time,
          away: g.away, home: g.home,
          role: cat.role,
          bot,
          mine: picks[slotKey(g.game_pk, cat.role)] || null,
          pool: g.players,
          // ITS BOARD FOR THIS CATEGORY, in its own order. This is what the
          // chooser shows and what the stored rank counts against — the same
          // sort, computed once, so "its #7" on screen and "#7" in the ledger
          // can never be two different sevens.
          ranked: [...g.players].sort((a, b) => cat.score(b) - cat.score(a)),
        })
      })
    })
    return out
  }, [games, picks])

  const graded = useMemo(() => gradeSlate(slots, results), [slots, results])
  const byKey = useMemo(
    () => Object.fromEntries(graded.rows.map((r) => [slotKey(r.game_pk, r.role), r])),
    [graded],
  )

  // Which games the graded file has started reporting on. Before a game shows
  // up there, an ungraded slot means "not yet", not "this man is untracked" —
  // two very different things to put in front of you.
  const reporting = useMemo(() => {
    const s = new Set()
    graded.rows.forEach((r) => {
      if (typeof r.botOut !== 'undefined' || typeof r.mineOut !== 'undefined') s.add(r.game_pk)
    })
    return s
  }, [graded])

  // Record the night as it grades. Idempotent by date — see lib/myPicks.js.
  useEffect(() => {
    if (!slateDate || !results) return
    if (recordNight(slateDate, graded)) setBump((b) => b + 1)
  }, [slateDate, results, graded])

  const totals = useMemo(() => ledgerTotals(), [bump, picks])

  // 🎮 WHAT'S RIDING TONIGHT. Live off the slate — none of it is stored and
  // none of it touches the ledger: it's the same rows gradeSlate already
  // produced, counted by state.
  //
  // The states are kept apart on purpose, because they mean different things:
  // still open to change, locked and waiting, graded, and the two kinds of
  // ungradeable (void = tracked but never batted, untracked = no line in the
  // file at all).
  //
  // TONIGHT'S SCORELINE IS THE SAME ARITHMETIC AS THE SEASON ONE: w and l over
  // contested slots. Worth stating because the ledger's night verdict compares
  // cleared counts (mw vs bw) instead — and those agree by construction, since
  // both sides clearing is a push in one and cancels in the other, so
  // mw − bw ≡ w − l. One night, one answer, whichever way you count it.
  const tonight = useMemo(() => {
    const mineRows = graded.rows.filter((r) => r.mine)
    const openRows = mineRows.filter((r) => !isLocked(r.game_time, now))
    const contested = mineRows.filter((r) => r.contested)
    const w = contested.filter((r) => r.mineOut && !r.botOut).length
    const l = contested.filter((r) => !r.mineOut && r.botOut).length
    // The next slot to freeze, so the pre-game panel has a clock on it. Only
    // your own slots — the rest of the slate freezing is not your problem.
    const nextAt = openRows
      .map((r) => new Date(r.game_time || 0).getTime())
      .filter((t) => Number.isFinite(t) && t > now)
      .sort((a, b) => a - b)[0] || null
    return {
      rows: mineRows,
      games: new Set(mineRows.map((r) => r.game_pk)).size,
      open: openRows.length,
      locked: mineRows.length - openRows.length,
      contested: contested.length,
      w, l, t: contested.length - w - l,
      pending: mineRows.filter((r) => !reporting.has(r.game_pk)).length,
      voided: mineRows.filter((r) => r.mineOut === null).length,
      untracked: mineRows.filter((r) => reporting.has(r.game_pk) && r.mineOut === undefined).length,
      nextAt,
    }
  }, [graded, reporting, now])

  // ── WHICH GAME IS OPEN ────────────────────────────────────────────────────
  // Derived, never stored blind: if the slate reloads under you and the game
  // you had open is gone, the card must not go blank waiting for a click. The
  // fallback is the next game that has NOT started — the only one you can
  // still do anything about — and only if every game is locked does it fall
  // back to the first on the card.
  const activeGame = useMemo(() => {
    if (openGame && games.some((g) => g.game_pk === openGame)) return openGame
    const live = games.find((g) => !isLocked(g.game_time, now))
    return (live || games[0])?.game_pk ?? null
  }, [openGame, games, now])
  const active = useMemo(
    () => games.find((g) => g.game_pk === activeGame) || null,
    [games, activeGame],
  )

  // WHAT THE RAIL KNOWS ABOUT EACH GAME. How many of its four slots you have
  // taken, and how that game is scoring against the bot so far — so choosing
  // which game to open is informed by your own card rather than by a matchup
  // code and a clock. Contested-only, the same arithmetic as every other
  // scoreline on this page.
  const gameState = useMemo(() => {
    const out = {}
    graded.rows.forEach((r) => {
      const g = out[r.game_pk] || (out[r.game_pk] = { mine: 0, w: 0, l: 0, contested: 0 })
      if (!r.mine) return
      g.mine += 1
      if (!r.contested) return
      g.contested += 1
      if (r.mineOut && !r.botOut) g.w += 1
      else if (!r.mineOut && r.botOut) g.l += 1
    })
    return out
  }, [graded])

  function convict(slot, key) {
    setPicks({ ...setConviction(slateDate, slot.game_pk, slot.role, key) })
  }

  // Tapping the lit reason turns it off again: a reason is optional, and
  // "actually I had no particular reason" has to be sayable after the fact.
  function reason(slot, key) {
    const cur = slot.mine?.why || null
    setPicks({ ...setWhy(slateDate, slot.game_pk, slot.role, cur === key ? null : key) })
  }

  function choose(slot, pid) {
    if (!pid) {
      setPicks({ ...clearPick(slateDate, slot.game_pk, slot.role) })
      return
    }
    // The rank is taken from the SAME ordering the chooser just displayed, and
    // stored with the pick (see decision 2 — the board re-sorts through the
    // day, and "how deep did I reach" has to mean how deep it looked then).
    const idx = slot.ranked.findIndex((p) => String(p.player_id) === String(pid))
    const p = idx >= 0 ? slot.ranked[idx] : slot.pool.find((x) => String(x.player_id) === String(pid))
    if (!p) return
    setPicks({
      ...savePick(slateDate, slot.game_pk, slot.role, p, slot.bot, slot.mine?.conviction, {
        rank: idx >= 0 ? idx + 1 : null,
        pool_n: slot.ranked.length,
      }),
    })
  }

  function doExport() {
    try {
      const blob = new Blob([exportStore()], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `moonshot-my-picks-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      setMsg('Exported.')
    } catch { setMsg("Couldn't export.") }
  }

  function doImport(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const r = new FileReader()
    r.onload = () => {
      const res = importStore(String(r.result || ''))
      setMsg(res.ok ? `Merged — ${res.added} new night${res.added === 1 ? '' : 's'}, ${res.nights} total.` : res.error)
      if (res.ok) { setPicks(getPicks(slateDate)); setBump((b) => b + 1) }
    }
    r.readAsText(f)
    e.target.value = ''
  }

  if (!games.length) {
    return (
      <div style={{
        border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 28,
        textAlign: 'center', color: C.text3, fontSize: 12.5,
      }}>No slate loaded, so there are no slots to fill yet.</div>
    )
  }

  const edge = totals.n ? (totals.minePct - totals.botPct) : null

  // The four slices of the one contested set. Sorted by volume, each carrying
  // its own denominator; none of them can hold a slot the scoreline doesn't.
  const roleRows = sliceRows(totals.role)
  const whyRows = sliceRows(totals.why)
  const depthRows = sliceRows(totals.depth)
    .slice()
    .sort((a, b) => DEPTH_ORDER.indexOf(a.k) - DEPTH_ORDER.indexOf(b.k))

  // ONE SENTENCE ON TOP OF THE SLICES. Counters don't generate insight; the
  // most lopsided slice with a real sample, named in plain words, might. It is
  // chosen across all three slices at once so the page doesn't pretend the
  // category split is always the interesting one.
  const tell = strongest([
    ...roleRows.map((r) => ({ ...r, kind: 'role' })),
    ...whyRows.map((r) => ({ ...r, kind: 'why' })),
    ...depthRows.map((r) => ({ ...r, kind: 'depth' })),
  ])

  const tonightLead = tonight.w - tonight.l
  const tonightSettled = tonight.contested > 0
  // "Tonight is in the books" needs BOTH halves: every game you're in has
  // reported, AND none of your slots is still open. A slot that hasn't reached
  // first pitch cannot be part of a final score, and calling the night early
  // is exactly the kind of flattering shortcut this panel isn't allowed.
  const tonightDone = tonightSettled && tonight.pending === 0 && tonight.open === 0
  const freezeMins = tonight.nextAt ? Math.max(0, Math.round((tonight.nextAt - now) / 60000)) : null

  return (
    <div>
      {/* ── 🎮 TONIGHT ───────────────────────────────────────────────────────
          The scoreboard, and it leads the page now. Before first pitch it is
          0–0 with what you have riding and when the first slot freezes; after,
          it is tonight's result in the same two numerals. Same arithmetic as
          the season line — contested slots only, voids and untracked names in
          neither column. */}
      <div style={panel(tonight.rows.length ? C.cyan : C.border2)}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 900 }}>🎮 Tonight</span>
          <span style={{ fontSize: 10.5, color: C.text3 }}>
            {slateDate ? shortDate(slateDate) : 'today'} · you versus the bot, one slot at a time
          </span>
        </div>

        {tonight.rows.length ? (
          <>
            {/* The scoreline. One of only two things on this page allowed to
                be big. Pushes ride as a dim third numeral rather than being
                folded into either side. */}
            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: 16,
              flexWrap: 'wrap', marginTop: 16, marginBottom: 4,
            }}>
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: '.12em',
                  textTransform: 'uppercase', color: C.text3, marginBottom: 3,
                }}>You</div>
                <div style={{
                  fontFamily: NUM_FONT, fontSize: 42, fontWeight: 900, lineHeight: 1,
                  letterSpacing: '-.03em',
                  color: tonightLead > 0 ? C.green : tonightLead < 0 ? C.text2 : C.text,
                }}>{tonight.w}</div>
              </div>
              <div style={{
                fontFamily: NUM_FONT, fontSize: 26, color: C.text3,
                lineHeight: 1.9, fontWeight: 300,
              }}>–</div>
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: '.12em',
                  textTransform: 'uppercase', color: C.text3, marginBottom: 3,
                }}>The bot</div>
                <div style={{
                  fontFamily: NUM_FONT, fontSize: 42, fontWeight: 900, lineHeight: 1,
                  letterSpacing: '-.03em',
                  color: tonightLead < 0 ? C.red : C.text,
                }}>{tonight.l}</div>
              </div>
              {tonight.t > 0 && (
                <div style={{ fontSize: 11, color: C.text3, lineHeight: 2.6 }}>
                  <Num color={C.text3}>{tonight.t}</Num> push{tonight.t === 1 ? '' : 'es'}
                </div>
              )}
            </div>

            <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.75, marginTop: 8 }}>
              {tonightDone ? (
                tonightLead > 0
                  ? <>Tonight is yours, <Num color={C.green}>{tonight.w}–{tonight.l}</Num> on{' '}
                    <Num>{tonight.contested}</Num> contested slot{tonight.contested === 1 ? '' : 's'}.</>
                  : tonightLead < 0
                    ? <>The bot took tonight, <Num color={C.red}>{tonight.l}–{tonight.w}</Num> on{' '}
                      <Num>{tonight.contested}</Num> contested slot{tonight.contested === 1 ? '' : 's'}.</>
                    : <>Tonight is a draw over <Num>{tonight.contested}</Num> contested slot
                      {tonight.contested === 1 ? '' : 's'} — nobody moved.</>
              ) : tonightSettled ? (
                <>
                  <Num>{tonight.contested}</Num> slot{tonight.contested === 1 ? ' has' : 's have'} settled
                  {tonight.pending > 0 && <>, <Num>{tonight.pending}</Num> still to report</>}.{' '}
                  {tonightLead > 0 ? 'You are ahead so far tonight.'
                    : tonightLead < 0 ? 'The bot is ahead so far tonight.'
                      : 'Level so far tonight.'}
                </>
              ) : (
                <>
                  Nothing has come back yet. You have <Num color={C.cyan}>{tonight.rows.length}</Num> slot
                  {tonight.rows.length === 1 ? '' : 's'} riding across <Num>{tonight.games}</Num> game
                  {tonight.games === 1 ? '' : 's'}
                  {tonight.open > 0 && freezeMins != null && (
                    <> — your first freezes {freezeMins > 90
                      ? <>at <Num>{clockOf(tonight.nextAt)}</Num></>
                      : <>in <Num>{freezeMins}</Num> min</>}</>
                  )}.
                </>
              )}
            </div>

            <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.75, marginTop: 4 }}>
              <Num color={C.text3}>{tonight.locked}</Num> frozen,{' '}
              <Num color={C.text3}>{tonight.open}</Num> still open to change.
              {/* Only worth counting once SOME of them have reported. When
                  every slot is unreported the sentence above has already said
                  the number, and printing it twice reads as two facts. */}
              {tonight.pending > 0 && tonight.pending !== tonight.rows.length && (
                <> <Num color={C.text3}>{tonight.pending}</Num> of your slots{' '}
                  {tonight.pending === 1 ? 'is' : 'are'} in games the graded file hasn&apos;t
                  reported on yet.</>
              )}
              {tonight.voided > 0 && (
                <> <Num color={C.text3}>{tonight.voided}</Num> void — tracked but never batted,
                  dropped from both sides rather than counted against you.</>
              )}
              {tonight.untracked > 0 && (
                <> <Num color={C.text3}>{tonight.untracked}</Num> untracked — no line in
                  tonight&apos;s file to score against, so {tonight.untracked === 1 ? 'it' : 'they'} can
                  never be contested.</>
              )}
            </div>

            {/* Your card tonight, one line per slot. A list of what you did,
                not a strip of tiles: category, your name, the name you took it
                from, what you declared, and where it stands on the right. */}
            <div style={{ marginTop: 12 }}>
              {tonight.rows.map((r) => {
                const col = roleColor(r.role)
                const live = r.pool?.find((p) => String(p.player_id) === String(r.mine.pid))
                const pending = !reporting.has(r.game_pk)
                return (
                  <div
                    key={slotKey(r.game_pk, r.role)}
                    style={{
                      display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap',
                      padding: '8px 0', borderTop: `1px solid ${C.border}`,
                      fontSize: 12, color: C.text2,
                    }}
                  >
                    <b style={{
                      fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 900, color: col,
                      minWidth: 56,
                    }} title={`Needs ${BAR[r.role]}`}>{roleLabel(r.role)}</b>
                    <button
                      onClick={() => live && onPlayerClick?.(live)}
                      disabled={!live}
                      style={{
                        background: 'none', border: 'none', padding: 0,
                        cursor: live ? 'pointer' : 'default',
                        fontSize: 12.5, fontWeight: 800, color: C.text,
                      }}
                    >{r.mine.name}</button>
                    <span style={{ color: C.text3, fontSize: 11 }}>
                      in for {r.mine.bot_name || 'its pick'}
                    </span>
                    <span style={{ color: C.text3, fontSize: 10, fontFamily: NUM_FONT, textTransform: 'uppercase' }}>
                      {r.mine.conviction || 'strong'}
                      {r.mine.why ? ` · ${WHY_LABEL[r.mine.why] || r.mine.why}` : ''}
                    </span>
                    <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'baseline' }}>
                      {outcomePill(r.mineOut, pending)}
                      {r.contested && (
                        <Pill tone={r.mineOut && !r.botOut ? 'won' : !r.mineOut && r.botOut ? 'lost' : 'void'}>
                          {r.mineOut && !r.botOut ? 'YOU WIN'
                            : !r.mineOut && r.botOut ? 'BOT WINS' : 'PUSH'}
                        </Pill>
                      )}
                      {!r.contested && pending && (
                        <span style={{ fontSize: 10, color: C.text3 }}>
                          {isLocked(r.game_time, now) ? 'locked, waiting' : 'open'}
                        </span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.75, marginTop: 10 }}>
            Nothing riding tonight — every slot below is still the bot&apos;s. Take one name off
            its board and tonight starts counting toward the head-to-head; leave them all and
            the night passes without asking you a question.
          </div>
        )}
      </div>

      {/* ── the record ─────────────────────────────────────────────────── */}
      <div style={panel(C.orange)}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 900 }}>🎫 Your record vs the bot</span>
          <span style={{ fontSize: 10.5, color: C.text3 }}>
            {totals.nights} night{totals.nights === 1 ? '' : 's'} · saved on this device only
          </span>
          <NightStrip bump={bump} />
        </div>

        {totals.nights > 0 ? (
          <>
            {totals.n === 0 && (
              <div style={{
                fontSize: 12, color: C.text2, marginTop: 12, lineHeight: 1.7,
                background: 'rgba(255,255,255,.03)', border: `1px solid ${C.border}`,
                borderRadius: 10, padding: '10px 13px',
              }}>
                Nights are grading, but you haven&apos;t contested a slot yet — take a name off
                its board below and the head-to-head starts.
              </div>
            )}

            {/* ── THE SCORELINE AND THE STANDING ──────────────────────────
                The second thing on this page allowed to be big, because it's
                the one figure with a claim on anything: your record on slots
                you contested, where the game, the category and the bar were
                held fixed and only the name changed. */}
            {totals.n > 0 && (() => {
              const lead = totals.w - totals.l
              const leadCol = lead > 0 ? C.green : lead < 0 ? C.red : C.text
              const st = totals.streak || {}
              const calls = totals.calls || []
              const byRank = (a, b) => callRank(b) - callRank(a) || String(b.date).localeCompare(String(a.date))
              const best = calls.filter((c) => c.o).sort(byRank)[0]
              const worst = calls.filter((c) => !c.o).sort(byRank)[0]
              return (
                <>
                  <div style={{
                    display: 'flex', alignItems: 'baseline', gap: 12,
                    flexWrap: 'wrap', marginTop: 16,
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 800, color: C.text3,
                      letterSpacing: '.12em', textTransform: 'uppercase',
                    }}>You</span>
                    <span style={{
                      fontFamily: NUM_FONT, fontSize: 38, fontWeight: 900,
                      lineHeight: 1, color: leadCol, letterSpacing: '-.03em',
                    }}>
                      {totals.w}
                      <span style={{ color: C.text3, margin: '0 7px', fontWeight: 300 }}>–</span>{totals.l}
                      <span style={{ color: C.text3, margin: '0 7px', fontWeight: 300 }}>–</span>
                      <span style={{ color: C.text3 }}>{totals.t}</span>
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 800, color: C.text3,
                      letterSpacing: '.12em', textTransform: 'uppercase',
                    }}>the bot</span>
                    <span style={{ fontSize: 10.5, color: C.text3 }}>
                      wins – losses – pushes, contested slots only
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: C.text2, marginTop: 10, lineHeight: 1.75 }}>
                    <Num>{totals.n}</Num> contested slot{totals.n === 1 ? '' : 's'} over{' '}
                    <Num>{totals.nights}</Num> night{totals.nights === 1 ? '' : 's'} — every call where you
                    put a different name in the bot&apos;s seat and both names ended up judgeable.
                    You cleared the bar on <Num color={C.green}>{totals.mineWon}/{totals.n}</Num>{' '}
                    ({pctTxt(totals.minePct)}); it cleared the same slots on{' '}
                    <Num color={C.purple}>{totals.botWon}/{totals.n}</Num> ({pctTxt(totals.botPct)})
                    {edge != null && (
                      <> — <Num color={edge > 0 ? C.green : edge < 0 ? C.red : C.text3}>
                        {edge > 0 ? '+' : ''}{edge.toFixed(1)}pp
                      </Num>{' '}
                      {edge > 0 ? 'your way' : edge < 0 ? 'the bot’s way' : 'dead level'}</>
                    )}.
                  </div>

                  {/* 🎉 PROPORTIONATE, OR NOT AT ALL. The tone is a function of
                      the sample, not of the mood: under ten contested slots
                      this refuses to have an opinion, and it never claims the
                      record predicts anything. Confetti over a 1–0 is how a
                      serious page stops being one. */}
                  {totals.n < 10 ? (
                    <Line icon="🌱" color={C.text3}>
                      Ten contested slots is where this stops being noise, and you have{' '}
                      <Num>{totals.n}</Num>. Nothing to celebrate or worry about yet — keep swapping.
                    </Line>
                  ) : totals.n < 25 ? (
                    <Line icon={lead > 0 ? '📈' : lead < 0 ? '📉' : '➖'} color={leadCol}>
                      {lead > 0 ? (
                        <>You are ahead of it, <Num color={C.green}>{totals.w}–{totals.l}</Num> on decided
                          slots. Real, and still a read rather than a finding at this size.</>
                      ) : lead < 0 ? (
                        <>The bot is ahead, <Num color={C.red}>{totals.l}–{totals.w}</Num> on decided slots.
                          Worth sitting with, not yet worth changing your process over.</>
                      ) : (
                        <>Dead level at <Num>{totals.w}–{totals.l}</Num> on decided slots.</>
                      )}
                    </Line>
                  ) : (
                    <Line icon={lead > 0 ? '🏆' : lead < 0 ? '🤖' : '➖'} color={leadCol}>
                      {lead > 0 ? (
                        <>Past the bar and in front: <Num color={C.green}>{totals.w}–{totals.l}–{totals.t}</Num>{' '}
                          over <Num>{totals.n}</Num> contested slots. On the calls you actually argued, you
                          have been the better of the two.</>
                      ) : lead < 0 ? (
                        <>Past the bar and behind: the bot is <Num color={C.red}>{totals.l}–{totals.w}–{totals.t}</Num>{' '}
                          over <Num>{totals.n}</Num> contested slots. Overriding it has cost more slots than
                          it has won.</>
                      ) : (
                        <>Level over <Num>{totals.n}</Num> contested slots — <Num>{totals.w}–{totals.l}–{totals.t}</Num>.
                          Your overrides have neither helped nor hurt.</>
                      )}
                    </Line>
                  )}

                  {/* The 25-slot bar as PROGRESS, not as a scolding. The
                      caution itself still lives in the footnote below, word
                      for word — this is the same fact with a direction. */}
                  <Line icon="🎯" color={totals.n >= 25 ? C.green : C.yellow}>
                    {totals.n >= 25 ? (
                      <>Past the 25-slot bar (<Num>{totals.n}</Num> contested). The number has a floor
                        under it now — which is not the same as being a season.</>
                    ) : (
                      <><Num>{totals.n}</Num> of <Num>25</Num> contested slots{' '}
                        <Rail value={totals.n} max={25} color={C.yellow} />{' '}
                        <Num>{25 - totals.n}</Num> more before this is worth arguing with.</>
                    )}
                  </Line>

                  {st.len >= 2 ? (
                    <Line icon={st.dir > 0 ? '🔥' : '🧊'} color={st.dir > 0 ? C.green : C.red}>
                      {st.dir > 0 ? (
                        <><Num color={C.green}>{st.len}</Num> nights running you have taken the head-to-head</>
                      ) : (
                        <>The bot has taken it <Num color={C.red}>{st.len}</Num> nights running</>
                      )}
                      {' '}(longest on this record: <Num>{st.bestWin || 0}</Num> yours,{' '}
                      <Num>{st.bestLoss || 0}</Num> its). A run that happened — it says nothing about tonight.
                    </Line>
                  ) : (st.bestWin >= 2 || st.bestLoss >= 2) ? (
                    <Line icon="📆" dim>
                      Longest runs on this record: <Num>{st.bestWin || 0}</Num> nights over the bot,{' '}
                      <Num>{st.bestLoss || 0}</Num> under it. Nights you contested nothing break a run
                      rather than extend it.
                    </Line>
                  ) : null}

                  {/* ── 🔧 WHAT THIS IS TEACHING YOU ─────────────────────────
                      The tuning half. Same contested set, four ways of cutting
                      it, one sentence on top naming the most lopsided cut with
                      a real sample. A cut under MIN_TELL slots is printed but
                      gets no opinion attached — the k/n is the argument. */}
                  <Heading note="the same contested slots, cut four ways">
                    🔧 What this is teaching you
                  </Heading>

                  {tell ? (
                    <Line icon="🧭" color={tell.lead > 0 ? C.green : C.red}>
                      {tell.kind === 'role' && (tell.lead > 0
                        ? <><b style={{ color: roleColor(tell.k) }}>{roleLabel(tell.k)}</b> is where you
                          beat it — <Num color={C.green}>{tell.w}–{tell.l}</Num> on <Num>{tell.n}</Num> contested
                          slots. Your other categories are not carrying that.</>
                        : <><b style={{ color: roleColor(tell.k) }}>{roleLabel(tell.k)}</b> is where it beats
                          you — <Num color={C.red}>{tell.l}–{tell.w}</Num> on <Num>{tell.n}</Num> contested
                          slots. The cheapest change available to you is to stop overriding it there.</>)}
                      {tell.kind === 'why' && (tell.lead > 0
                        ? <>The swaps you made on <b style={{ color: C.text }}>{WHY_LABEL[tell.k] || tell.k}</b> go{' '}
                          <Num color={C.green}>{tell.w}–{tell.l}</Num> over <Num>{tell.n}</Num> contested slots.
                          That is the term to look at first — the bot may be carrying it light.</>
                        : <>The swaps you made on <b style={{ color: C.text }}>{WHY_LABEL[tell.k] || tell.k}</b> go{' '}
                          <Num color={C.red}>{tell.l}–{tell.w}</Num> over <Num>{tell.n}</Num> contested slots.
                          The bot already has that one about right.</>)}
                      {tell.kind === 'depth' && (tell.lead > 0
                        ? <>Names you took <b style={{ color: C.text }}>{DEPTH_PHRASE[tell.k] || tell.k}</b> go{' '}
                          <Num color={C.green}>{tell.w}–{tell.l}</Num> over <Num>{tell.n}</Num> contested slots.
                          Its ordering is missing something there.</>
                        : <>Names you took <b style={{ color: C.text }}>{DEPTH_PHRASE[tell.k] || tell.k}</b> go{' '}
                          <Num color={C.red}>{tell.l}–{tell.w}</Num> over <Num>{tell.n}</Num> contested slots.
                          Its ordering is holding up there.</>)}
                      {/* The same caution the headline carries, applied to the
                          slice: a cut can clear MIN_TELL long before it clears
                          25, and it doesn't get to sound like the latter. */}
                      {tell.n < 25 && (
                        <span style={{ color: C.text3 }}>
                          {' '}On <Num color={C.text3}>{tell.n}</Num> slots that is a lead to watch,
                          not a finding.
                        </span>
                      )}
                    </Line>
                  ) : (
                    <Line icon="🧭" dim>
                      No cut has <Num>{MIN_TELL}</Num> contested slots behind it yet, so nothing below
                      gets a verdict — just the counts, with their denominators.
                    </Line>
                  )}

                  {/* 📊 BY CATEGORY. You may be genuinely better than it at
                      picking a homer and plainly worse at picking a hit, and
                      the aggregate hides both. */}
                  {roleRows.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <Line icon="📊">
                        By category
                        {totals.roleN < totals.n && (
                          <> — <Num>{totals.roleN}</Num> of your <Num>{totals.n}</Num> contested slots have a
                            category on file; the older nights were recorded before this split existed and
                            are counted in the scoreline only</>
                        )}:
                      </Line>
                      <Slice
                        rows={roleRows}
                        labelOf={roleLabel}
                        colorOf={roleColor}
                        tail={(r) => (
                          <>
                            {r.n >= 8 && r.l - r.w >= 3 && (
                              <span style={{ color: C.red }}> · the bot owns this one — worth leaving its pick alone</span>
                            )}
                            {r.n >= 8 && r.w - r.l >= 3 && (
                              <span style={{ color: C.green }}> · this is your category</span>
                            )}
                          </>
                        )}
                      />
                    </div>
                  )}

                  {/* 🧩 BY YOUR REASON — the slice that can actually change
                      scoring, because each reason is a term the bot already
                      carries. Optional on the way in, so it is short of the
                      scoreline by every swap you didn't label, and it says so
                      rather than borrowing the scoreline's volume. */}
                  {whyRows.length > 0 ? (
                    <div style={{ marginTop: 10 }}>
                      <Line icon="🧩">
                        By the reason you gave — <Num>{totals.whyN}</Num> of your <Num>{totals.n}</Num>{' '}
                        contested slots carry one. Each is a term the bot already scores, so a lopsided
                        one is a place to look at its weights:
                      </Line>
                      <Slice
                        rows={whyRows}
                        labelOf={(k) => WHY_LABEL[k] || k}
                        minWidth={66}
                        tail={(r) => (r.n < MIN_TELL
                          ? <span style={{ color: C.text3 }}> · too few to read</span>
                          : null)}
                      />
                    </div>
                  ) : (
                    <Line icon="🧩" dim>
                      No reasons logged yet. Tagging a swap with why you made it — matchup, form,
                      park, spot, price, gut — is optional and never touches grading, but it is the
                      only thing that can tell you WHICH of the bot&apos;s terms you are out-guessing.
                    </Line>
                  )}

                  {/* 🪜 HOW DEEP YOU REACHED. Taking its #2 and taking its #19
                      are different claims about the model, and the aggregate
                      can't tell them apart. */}
                  {depthRows.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <Line icon="🪜">
                        By how far down its board you reached — <Num>{totals.depthN}</Num> of{' '}
                        <Num>{totals.n}</Num> contested slots have a rank on file:
                      </Line>
                      <Slice
                        rows={depthRows}
                        labelOf={(k) => DEPTH_LABEL[k] || k}
                        minWidth={104}
                        tail={(r) => (r.n < MIN_TELL
                          ? <span style={{ color: C.text3 }}> · too few to read</span>
                          : null)}
                      />
                    </div>
                  )}

                  {/* 🏅 THE REEL. Two calls, one each way. Only decided slots
                      are stored (lib/myPicks.js CALL_CAP), and the bot name is
                      the one snapshotted when you swapped — the name you
                      actually argued with, not whoever the slate landed on by
                      first pitch. */}
                  {best && (
                    <Line icon="🏅" color={C.green}>
                      Best call so far — <b style={{ color: C.text2 }}>{shortDate(best.date)}</b>, a{' '}
                      <b style={{ color: C.text2 }}>{best.c}</b> in{' '}
                      <b style={{ color: roleColor(best.r) }}>{roleLabel(best.r)}</b>
                      {best.y ? <> on <b style={{ color: C.text2 }}>{WHY_LABEL[best.y] || best.y}</b></> : null}:
                      {' '}your <b style={{ color: C.text }}>{best.m || 'pick'}</b> cleared the bar
                      {best.b ? <> and its <b style={{ color: C.text2 }}>{best.b}</b> did not</> : null}.
                    </Line>
                  )}
                  {worst && (
                    <Line icon="🧊" color={C.red}>
                      Worst — <b style={{ color: C.text2 }}>{shortDate(worst.date)}</b>, a{' '}
                      <b style={{ color: C.text2 }}>{worst.c}</b> in{' '}
                      <b style={{ color: roleColor(worst.r) }}>{roleLabel(worst.r)}</b>
                      {worst.y ? <> on <b style={{ color: C.text2 }}>{WHY_LABEL[worst.y] || worst.y}</b></> : null}:
                      {' '}its <b style={{ color: C.text2 }}>{worst.b || 'pick'}</b> cleared and your{' '}
                      <b style={{ color: C.text }}>{worst.m || 'pick'}</b> did not.
                    </Line>
                  )}
                  {(best || worst) && (
                    <Line icon=" " dim>
                      Ranked by how sure you said you were before first pitch: a slot is cleared or it
                      is not, so conviction is the only size a call has.
                    </Line>
                  )}
                </>
              )
            })()}

            {/* 🎚 DO YOUR TIERS MEAN ANYTHING — the only reason conviction
                exists. One sentence, in the page's own language, and it stays
                quiet until two tiers have five contested slots each; below
                that any comparison is a coin flip narrating itself. */}
            {(() => {
              const cv = totals.conv || {}
              const tiers = ['lock', 'strong', 'lean']
                .map((k) => ({ k, ...cv[k] }))
                .filter((t) => (t.n || 0) >= 5)
              if (tiers.length < 2) return null
              const rate = (t) => (100 * t.w) / t.n
              const hi = tiers[0], lo = tiers[tiers.length - 1]
              const gap = rate(hi) - rate(lo)
              return (
                <Line icon="🎚">
                  {gap >= 10 ? (
                    <>Your tiers mean something: <b style={{ color: C.green }}>{hi.k}s</b> beat the bot on{' '}
                      <Num color={C.green}>{hi.w}/{hi.n}</Num> against{' '}
                      <Num>{lo.w}/{lo.n}</Num> for your {lo.k}s — trust the feeling.</>
                  ) : gap <= -10 ? (
                    <>Uncomfortable but real: your <b style={{ color: C.red }}>{hi.k}s</b> do worse than your{' '}
                      {lo.k}s (<Num color={C.red}>{hi.w}/{hi.n}</Num> against <Num>{lo.w}/{lo.n}</Num>).
                      The stronger you feel, the more the bot is right.</>
                  ) : (
                    <>Your {hi.k}s and {lo.k}s beat the bot at about the same rate
                      (<Num>{hi.w}/{hi.n}</Num> against <Num>{lo.w}/{lo.n}</Num>) — so far the tier is
                      decoration, which is worth knowing before you size a bet on one.</>
                  )}
                </Line>
              )
            })()}

            {/* The full card, in a sentence. Same three figures the old tiles
                carried — your rate, the bot's, and the all-time override
                count — each still printed with its denominator. */}
            <Line icon="🗂">
              Your full card, meaning the bot&apos;s slate with your swaps applied, sits at{' '}
              <Num>{pctTxt(totals.cardMinePct)}</Num> (<Num>{totals.cardMineWon}/{totals.cardMineN}</Num>{' '}
              slots) against its untouched <Num>{pctTxt(totals.cardBotPct)}</Num>{' '}
              (<Num>{totals.cardBotWon}/{totals.cardBotN}</Num>). <Num>{totals.overrides}</Num> override
              {totals.overrides === 1 ? '' : 's'} made all time.
            </Line>

            <div style={{ fontSize: 11, color: C.text3, marginTop: 14, lineHeight: 1.75 }}>
              <b style={{ color: C.text2 }}>Head to head</b> is the number that means something —
              same game, same category, same bar, only the name changed. The full-card rates
              are mostly the bot&apos;s own picks on both sides, so they drift together whoever&apos;s
              right. Void legs (never batted) are dropped from both sides, not counted as misses.
              {totals.n > 0 && totals.n < 25 && (
                <> <b style={{ color: C.yellow }}>Still thin</b> — {totals.n} contested slot
                  {totals.n === 1 ? '' : 's'} is a read, not a finding. Nothing should touch
                  scoring off this yet.</>
              )}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: C.text3, marginTop: 10, lineHeight: 1.75 }}>
            Nothing graded yet. Take a name off its board below — once that game finishes,
            your pick and the bot&apos;s get scored against the same bar and the head-to-head
            starts here.
          </div>
        )}

        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 16 }}>
          <button onClick={doExport} style={btn()}>Export record</button>
          <button onClick={() => fileRef.current?.click()} style={btn()}>Import</button>
          <button
            onClick={() => {
              if (window.confirm('Delete every pick and the whole record on this device?')) {
                clearAll(); setPicks({}); setBump((b) => b + 1); setMsg('Cleared.')
              }
            }}
            style={{ ...btn(), color: C.red, borderColor: `${C.red}55` }}
          >Clear all</button>
          <input ref={fileRef} type="file" accept="application/json,.json"
                 onChange={doImport} style={{ display: 'none' }} />
          {msg && <span style={{ fontSize: 10.5, color: C.text3, alignSelf: 'center' }}>{msg}</span>}
        </div>
      </div>

      {/* ══ 🎛 THE CARD — ONE GAME AT A TIME (2026-08-24) ═══════════════════
          Donovan: "my pick needs to be better, bring the page up to date with
          the props card style, but also make it like a game selector not the
          whole slate so it's smaller and doesn't take up the whole page. add
          aspect on bot pick vs user pick."

          WHAT WAS WRONG. This section rendered EVERY game on the slate, four
          slots each — fifteen games is sixty rows, and each row is a badge, a
          name, a price, a button, an outcome and, once you have swapped, a
          second line of chips. Measured on the 08-23 slate it was about eleven
          phone screens of card below a page that already had two panels on top
          of it. Nobody scrolls that, so in practice you only ever filled slots
          in whichever games happened to be near the top.

          WHAT IT IS NOW. A rail of games, one open at a time, four cards under
          it. Same slots, same store, same grading — the page just stops showing
          you fourteen games you are not looking at. The rail carries each
          game's own state (how many slots you have taken, and how that game is
          scoring against the bot) so choosing which game to open is itself
          informed rather than a guess at a matchup code.

          THE PROPS CARD STYLE, LITERALLY. Each slot is a VerdictHero — the same
          component the Props page and both modals use, so the dial, the wash,
          the light bar and the badge are not a copy of that look but the actual
          one. The dial reads the score of whoever currently HOLDS the slot,
          which is the point of the page: swap a name in and the instrument
          moves to your man.

          BOT VS YOU IS THE FOOTER, and it is a real comparison rather than a
          strike-through: two columns, the same three facts each (name, that
          category's score, the book's price on the same bar), the outcome under
          each once the night grades, and the winning side lit. Where the old
          row said "its pick ~~struck out~~ → yours", this says what you took,
          what you gave up, and by how much on the only two measures either side
          can be judged on before first pitch. */}
      {/* One line, and the caveats folded (the 2026-08-23 helper-text pass —
          "little words here and there throughout the site that just don't
          need to be there"). Five lines of rules above the rail is five lines
          of card nobody can see on a phone. */}
      <div style={{ fontSize: 11.5, color: C.text3, marginBottom: 4, lineHeight: 1.7 }}>
        Four slots a game, the same four the bot fills. Pick a game, take whoever you want.
      </div>
      <WhatThis label="how a slot is graded">
        Whoever holds the slot is graded on <b style={{ color: C.text2 }}>that slot&apos;s</b> bar,
        not his own — a name you swap into the HR slot has to homer. Slots freeze at first pitch.
        Deep-bench names can come back <b style={{ color: C.text2 }}>untracked</b>: the graded file
        only carries the ~90 candidates the bot watches, so there is nothing to score the rest
        against.
      </WhatThis>

      <GameRail
        games={games}
        active={activeGame}
        onSelect={setOpenGame}
        stateOf={gameState}
        now={now}
      />

      {active ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {CATEGORIES.map((cat) => {
            const s = slots.find((x) => x.game_pk === active.game_pk && x.role === cat.role)
            if (!s) return null
            const key = slotKey(active.game_pk, cat.role)
            const row = byKey[key]
            const mine = s.mine
            const locked = isLocked(active.game_time, now)
            const pending = !reporting.has(active.game_pk)
            const boardOpen = openSlot === key && !locked
            const full = Boolean(showAll[key])
            const list = full ? s.ranked : s.ranked.slice(0, 8)

            // The man who currently HOLDS the slot, as a slate row — so the
            // dial, the matchup line and the price all describe one person.
            // Your pick is stored as a snapshot (name/team/pid), so it is
            // looked back up in the pool to get a scoreable row; if he has
            // fallen off the slate entirely the card falls back to the stored
            // snapshot and simply has no dial, rather than silently drawing the
            // bot's number over your name.
            const mineRow = mine
              ? s.pool.find((p) => String(p.player_id) === String(mine.pid)) || null
              : null
            const holder = mineRow || (mine ? null : s.bot)
            const holderName = mine ? mine.name : (s.bot ? nameOf(s.bot) : null)
            const arm = txt(s.bot?.pitcher_name).trim()
            const hand = txt(s.bot?.pitcher_throws).trim()

            const botQ = s.bot ? quoteFor(odds, s.bot, cat.role) : null
            const mineQ = mine ? quoteFor(odds, { player_id: mine.pid, name: mine.name }, cat.role) : null
            const priceTxt = (q) => {
              if (!q || !q.matches) return null
              const p = fmtOdds(q.over)
              return p === '—' ? null : p
            }

            const botScore = s.bot ? Math.round(cat.score(s.bot) || 0) : null
            const mineScore = mineRow ? Math.round(cat.score(mineRow) || 0) : null
            const gap = (botScore != null && mineScore != null) ? mineScore - botScore : null

            return (
              <div key={cat.role}>
                <VerdictHero
                  col={cat.color}
                  score={holder ? cat.score(holder) : null}
                  title={holderName || 'no bot pick'}
                  dialTitle={`${cat.label} score for whoever holds this slot`}
                  badge={mine ? 'YOURS' : 'THE BOT'}
                  badgeQuiet={!mine}
                  meta={`${active.away} @ ${active.home}${arm ? ` · ${arm}${hand ? ` (${hand})` : ''}` : ''}`}
                  /* NO PRICE UP HERE. The book's number is printed on BOTH
                     sides of the comparison below, which is the only place it
                     means anything — one copy of it beside the name would be
                     the same figure twice on the same card. */
                  market={`${cat.label} — needs ${BAR[cat.role]}`}
                  right={row ? outcomePill(mine ? row.mineOut : row.botOut, pending) : null}
                  line={
                    locked && !mine
                      ? <>Frozen with the bot&apos;s own pick — you let this slot ride.</>
                      : mine
                        ? <>You took <b style={{ color: C.text }}>{mine.name}</b> off its board
                          {mine.rank ? <> at <Num color={cat.color}>#{mine.rank}</Num>
                            {mine.pool_n ? <> of <Num color={C.text3}>{mine.pool_n}</Num></> : null}</> : null}
                          {gap != null && <>, {gap === 0
                            ? <>level with</>
                            : <><Num color={gap > 0 ? C.green : C.red}>{gap > 0 ? '+' : ''}{gap}</Num> against</>}{' '}
                            the name you gave up</>}.</>
                        : <>Still the bot&apos;s slot. Take a name off its board and this one starts
                          counting toward the head-to-head.</>
                  }
                  footer={
                    <Versus
                      cat={cat}
                      bot={s.bot}
                      botScore={botScore}
                      botPrice={priceTxt(botQ)}
                      botOut={row ? row.botOut : undefined}
                      mine={mine}
                      mineScore={mineScore}
                      minePrice={priceTxt(mineQ)}
                      mineOut={row ? row.mineOut : undefined}
                      contested={Boolean(row?.contested)}
                      pending={pending}
                      locked={locked}
                      boardOpen={boardOpen}
                      onOpenBoard={() => setOpenSlot(boardOpen ? null : key)}
                      onClear={() => choose(s, null)}
                      onBot={() => s.bot && onPlayerClick?.(s.bot)}
                      onMine={() => mineRow && onPlayerClick?.(mineRow)}
                    />
                  }
                />

                {/* WHAT YOU DECLARED. Below the card rather than inside it:
                    conviction and reason are things you say ABOUT a pick, and
                    neither is ever read by the grader. Frozen slots print only
                    what you actually declared — six dead chips is noise on a
                    slot you can no longer change. */}
                {mine && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                    marginTop: 8, padding: '0 4px',
                  }}>
                    {locked ? (
                      <>
                        <Chip on color={cat.color} title="How sure you were, frozen at first pitch with the slot">
                          {mine.conviction || 'strong'}
                        </Chip>
                        {mine.why && (
                          <Chip on color={C.text} title="Why you took him, frozen with the slot. Never read by the grader.">
                            {WHY_LABEL[mine.why] || mine.why}
                          </Chip>
                        )}
                      </>
                    ) : (
                      <>
                        {CONVICTION.map(([k, label, why]) => (
                          <Chip key={k} on={(mine.conviction || 'strong') === k} color={cat.color}
                                title={why} onClick={() => convict(s, k)}>{label}</Chip>
                        ))}
                        <span style={{ fontSize: 10, color: C.text3, margin: '0 2px' }}>
                          why? <span style={{ opacity: .8 }}>(optional)</span>
                        </span>
                        {WHY.map(([k, label, blurb]) => (
                          <Chip key={k} on={mine.why === k} color={C.text}
                                title={`${blurb}${mine.why === k ? ' — tap again to remove.' : ''}`}
                                onClick={() => reason(s, k)}>{label}</Chip>
                        ))}
                      </>
                    )}
                  </div>
                )}

                {/* ── ITS BOARD, OPENED ──────────────────────────────────
                    The chooser, unchanged in substance: ranked by that
                    category's own score, the market price beside each name,
                    its designated pick marked — so taking someone is an
                    argument with a board rather than a line in a dropdown. */}
                {boardOpen && (
                  <div style={{
                    marginTop: 8, border: `1px solid ${C.border}`, borderRadius: 14,
                    background: C.bg, overflow: 'hidden',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
                      padding: '9px 13px', borderBottom: `1px solid ${C.border}`,
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: C.text2 }}>
                        Its board for {cat.label}
                      </span>
                      <span style={{ fontSize: 10.5, color: C.text3 }}>
                        needs {BAR[cat.role]} · ranked by the same score the site ranks on
                      </span>
                      <button onClick={() => setOpenSlot(null)}
                              style={{ ...btn(), marginLeft: 'auto', padding: '3px 9px' }}>Close</button>
                    </div>
                    <div style={{ maxHeight: 268, overflowY: 'auto' }}>
                      {list.map((p, i) => {
                        const isBot = s.bot && String(p.player_id) === String(s.bot.player_id)
                        const isMine = mine && String(p.player_id) === String(mine.pid)
                        return (
                          <button
                            key={p.player_id}
                            onClick={() => { choose(s, p.player_id); setOpenSlot(null) }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                              padding: '7px 13px', textAlign: 'left', cursor: 'pointer',
                              background: isMine ? `${cat.color}1a` : 'transparent',
                              border: 'none', borderTop: i ? `1px solid ${C.bg2}` : 'none',
                              color: C.text, fontSize: 12,
                            }}
                          >
                            <span style={{
                              fontFamily: NUM_FONT, fontSize: 10, color: C.text3,
                              minWidth: 22, textAlign: 'right',
                            }}>{i + 1}</span>
                            <span style={{ fontWeight: 700 }}>{nameOf(p)}</span>
                            <span style={{ fontFamily: NUM_FONT, fontSize: 10, color: C.text3 }}>
                              {teamOf(p)}
                            </span>
                            <span style={{
                              fontFamily: NUM_FONT, fontSize: 10.5, color: cat.color, fontWeight: 800,
                            }}>{Math.round(cat.score(p) || 0)}</span>
                            <OddsLine quote={quoteFor(odds, p, cat.role)} compact />
                            <span style={{ marginLeft: 'auto', fontSize: 10, color: C.text3 }}>
                              {isBot ? 'its pick — tap to give the slot back'
                                : isMine ? 'yours' : ''}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    {s.ranked.length > 8 && (
                      <div style={{ padding: '8px 13px', borderTop: `1px solid ${C.border}` }}>
                        <button onClick={() => setShowAll({ ...showAll, [key]: !full })} style={btn()}>
                          {full ? 'Show its top 8' : `Show all ${s.ranked.length} in this game`}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function btn() {
  return {
    border: `1px solid ${C.border}`, background: 'rgba(255,255,255,.035)',
    color: C.text2, borderRadius: 999, padding: '5px 11px',
    fontSize: 10.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
  }
}
