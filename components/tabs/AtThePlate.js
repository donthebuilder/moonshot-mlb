'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { fullBox, forget } from '../../lib/boxscore'
import { BattingBox, PitchingBox } from '../BoxTable'
import { nameOf, teamOf, oppOf, clean, n, hrScore, playerId } from '../../lib/player'
import { fetchLiveSlate } from '../../lib/liveSlate'
import { teamAbbrs } from '../../lib/gamelogs'
import {
  fetchLiveGame, parseLiveGame, atBatOf, priorPAs, timesFacing, arsenalTonight,
  pitchColor, PITCH_NAMES, KIND_WORD,
} from '../../lib/livePitches'
import { Empty, Band } from '../ui'
// LiveAtBats retired from THIS page 2026-08-14 (the Games board table
// replaced it) — the component itself lives on; the Games tab mounts it.
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

/** 🎮 THE GAMES BOARD (2026-08-14 restructure — Donovan: "i wanted the
 * games at the top. with a better selector... the just now and all that
 * pick a game should look better and more precise like how that chart is
 * at the bottom of the screen"). ONE precise table — the same language as
 * the contact-tonight section — replaces BOTH the who's-up card strip
 * (LiveAtBats stays a component; the Games tab still mounts it) and the
 * separate collapsed Pick-a-game control: every live game, its score,
 * inning and outs, who's standing at the plate and his line tonight — and
 * tapping a row IS the game selector. Picks sort first (the incoming list
 * is already ordered that way). */
function GamesBoard({ games, activePk, lines, abbrs, onSelect }) {
  if (!games.length) return null
  return (
    <div style={{ marginBottom: 12 }}>
      <Band note="every live at-bat, your picks first — tap a row to open that game's room below">Games</Band>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '7px 12px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 3, borderBottom: `1px solid ${C.border}` }}>
          <span style={{ width: 118, flexShrink: 0, fontSize: 8, color: C.text3, fontFamily: NUM_FONT }}>GAME</span>
          <span style={{ width: 58, flexShrink: 0, fontSize: 8, color: C.text3, fontFamily: NUM_FONT }}>INN</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 8, color: C.text3, fontFamily: NUM_FONT }}>AT THE PLATE</span>
          <span style={{ width: 70, textAlign: 'right', flexShrink: 0, fontSize: 8, color: C.text3, fontFamily: NUM_FONT }}>TONIGHT</span>
        </div>
        {games.map((x, i) => {
          const on = x.pk === activePk
          const l = lines?.[x.pid] || null
          const outs = x.g.outs
          return (
            <div key={x.pk} onClick={() => onSelect(x.pk)} className="tap-row" style={{
              display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0 4px 4px',
              cursor: 'pointer', minWidth: 0, marginLeft: -6,
              borderLeft: `2px solid ${on ? C.orange : 'transparent'}`,
              background: on ? 'rgba(249,115,22,.07)' : 'transparent',
              borderBottom: i < games.length - 1 ? '1px solid rgba(255,255,255,.04)' : 'none',
            }}>
              <span style={{ width: 118, flexShrink: 0, fontSize: 10.5, fontWeight: 700, fontFamily: NUM_FONT, color: C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {abbrs?.[x.g.awayId] || 'Away'} <b style={{ color: on ? C.orange : C.text }}>{x.g.awayScore ?? 0}–{x.g.homeScore ?? 0}</b> {abbrs?.[x.g.homeId] || 'Home'}
              </span>
              <span style={{ width: 58, flexShrink: 0, fontSize: 9.5, fontFamily: NUM_FONT, color: C.text3 }}
                title={outs != null ? `${String(x.g.half || '')} ${x.g.inning}, ${outs} out${outs === 1 ? '' : 's'}` : undefined}>
                {String(x.g.half || '').slice(0, 3)}{x.g.inning}{outs != null ? ` · ${outs}o` : ''}
              </span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', gap: 5, alignItems: 'baseline' }}>
                {x.role ? (
                  <span style={{ fontSize: 7.5, fontWeight: 900, fontFamily: NUM_FONT, color: ROLE_COLOR[x.role] || C.text3, letterSpacing: '.05em', flexShrink: 0 }}>🤖{x.role}</span>
                ) : x.watched ? (
                  <span style={{ fontSize: 9, flexShrink: 0 }}>★</span>
                ) : null}
                <span style={{ fontSize: 10.5, fontWeight: on ? 800 : 600, color: on ? C.text : C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{x.name}</span>
              </span>
              <span style={{ width: 70, textAlign: 'right', flexShrink: 0, fontSize: 9.5, fontFamily: NUM_FONT, color: l?.hr ? C.orange : C.text3, fontWeight: l?.hr ? 800 : 400 }}
                title={l ? `The batter at the plate, tonight: ${l.h}-${l.ab}${l.hr ? `, ${l.hr} HR` : ''}` : 'First trip tonight'}>
                {l ? `${l.h}-${l.ab}${l.hr ? ` ${l.hr}HR` : ''}` : '—'}
              </span>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 9, color: C.text3, marginTop: 5, lineHeight: 1.5 }}>
        This picks the GAME — inside its room, tap anyone in Coming up or the box score to point
        the charts at him instead.
      </div>
    </div>
  )
}

/** 📜 THE TIMELINE (2026-08-14, Donovan: "im still a little confused on the
 * whole at the plate page, i need like a timeline too of what happened in
 * the game"). The game's story so far, newest first, in the precise table
 * language: scoring plays and homers by default (the plays that changed the
 * game), one tap away from every completed plate appearance. Zero new
 * fetches — feed.meta is already one row per completed PA, and as of the
 * same date each row carries the play's RBI and the score AFTER it,
 * straight off the feed's own result block. Replaces the Coming Up section
 * (removed same date, on request) as what sits between the hero card and
 * the box score: the box score already lists the whole order with AT
 * BAT / ON DECK / IN HOLE / NEXT tags, so a second batting-order list was
 * one list too many — but "how did the score get here" had no home at all. */
function Timeline({ feed, g, abbrs, onPick }) {
  const [allPlays, setAllPlays] = useState(false)
  const meta = feed?.meta || []
  if (!meta.length) return null
  const isHr = (e) => /home.?run/i.test(String(e || ''))
  const scoring = meta.filter((m) => (m.rbi || 0) > 0 || isHr(m.event))
  const rows = [...(allPlays ? meta : scoring)].reverse()
  const away = abbrs?.[g?.awayId] || 'Away'
  const home = abbrs?.[g?.homeId] || 'Home'
  return (
    <div style={{ marginBottom: 12 }}>
      <Band note="how the score got here — newest first">Timeline</Band>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '7px 12px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 4, borderBottom: `1px solid ${C.border}` }}>
          <span style={{ display: 'flex', gap: 4 }}>
            {[[false, `Scoring ${scoring.length}`], [true, `All plays ${meta.length}`]].map(([v, label]) => (
              <button key={String(v)} onClick={() => setAllPlays(v)} style={{
                fontSize: 8.5, fontWeight: 800, fontFamily: NUM_FONT, cursor: 'pointer',
                border: `1px solid ${allPlays === v ? C.orange : C.border}`,
                background: allPlays === v ? 'rgba(249,115,22,.12)' : 'transparent',
                color: allPlays === v ? C.orange : C.text3,
                borderRadius: 999, padding: '2px 9px',
              }}>{label}</button>
            ))}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 8, color: C.text3, fontFamily: NUM_FONT }}>{away}–{home}</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ fontSize: 10, color: C.text3, padding: '6px 0', lineHeight: 1.5 }}>
            No runs yet — {meta.length} plate appearance{meta.length === 1 ? '' : 's'} complete.
            Tap <b style={{ color: C.text2 }}>All plays</b> for every one of them.
          </div>
        ) : rows.map((m, i) => {
          const hr = isHr(m.event)
          return (
            <div key={`${m.pi}`} onClick={() => onPick?.(m.batterId)} className="tap-row"
              title={`${m.batterName || 'batter'} — ${m.event}${m.pitcherName ? ` off ${m.pitcherName}` : ''}${m.rbi ? ` · ${m.rbi} RBI` : ''}. Tap to point the charts at him.`}
              style={{
                display: 'flex', gap: 8, alignItems: 'center', padding: '3.5px 0',
                cursor: 'pointer', minWidth: 0,
                borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,.04)' : 'none',
              }}>
              <span style={{ width: 30, flexShrink: 0, fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
                {/^top/i.test(m.half) ? 'T' : 'B'}{m.inning}
              </span>
              <span style={{
                flex: 1, minWidth: 0, fontSize: 10.5, fontWeight: hr ? 800 : 600,
                color: hr ? C.orange : C.text2,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {hr ? '💥 ' : ''}<b style={{ color: C.text }}>{String(m.batterName || '').split(' ').slice(-1)[0] || '—'}</b>
                {' '}{String(m.event || '').toLowerCase()}
              </span>
              <span style={{ width: 34, textAlign: 'right', flexShrink: 0, fontSize: 9.5, fontFamily: NUM_FONT, color: m.rbi ? '#4ade80' : C.text3, fontWeight: m.rbi ? 800 : 400 }}>
                {m.rbi ? `+${m.rbi}` : '·'}
              </span>
              <span style={{ width: 44, textAlign: 'right', flexShrink: 0, fontSize: 9.5, fontFamily: NUM_FONT, color: (m.rbi || 0) > 0 || hr ? C.text : C.text3, fontWeight: (m.rbi || 0) > 0 || hr ? 800 : 400 }}>
                {m.as != null && m.hs != null ? `${m.as}–${m.hs}` : '·'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** The situation, broadcast-style (2026-08-14, Donovan: "i dont see the
 * outs like if its two outs or one"). A mini base diamond (2B top, 3B left,
 * 1B right — filled yellow when occupied, tooltip names the runner) and two
 * out dots. Renders nothing when outs is null — that means the linescore
 * detail didn't come through, and an empty diamond you'd be guessing at is
 * worse than none (bases-empty and data-stripped would look identical
 * otherwise; outs being a real number is the proof the block arrived). */
function Situation({ outs, on1, on2, on3 }) {
  if (outs == null) return null
  const bases = [
    ['2B', on2, { left: 8, top: 0 }],
    ['3B', on3, { left: 0, top: 8 }],
    ['1B', on1, { left: 17, top: 8 }],
  ]
  const who = [on1 && `1B ${on1}`, on2 && `2B ${on2}`, on3 && `3B ${on3}`].filter(Boolean).join(' · ')
  return (
    <span title={`${outs} out${outs === 1 ? '' : 's'}${who ? ` · on base: ${who}` : ' · bases empty'}`}
      style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'help', flexShrink: 0 }}>
      <span style={{ position: 'relative', width: 25, height: 16, display: 'inline-block' }}>
        {bases.map(([k, name, pos]) => (
          <span key={k} style={{
            position: 'absolute', ...pos, width: 7, height: 7,
            transform: 'rotate(45deg)',
            background: name ? '#FCD34D' : 'transparent',
            border: `1px solid ${name ? '#FCD34D' : 'rgba(255,255,255,.28)'}`,
            boxShadow: name ? '0 0 5px rgba(252,211,77,.4)' : 'none',
          }} />
        ))}
      </span>
      <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        {[0, 1].map((i) => (
          <span key={i} style={{
            width: 7, height: 7, borderRadius: '50%',
            background: outs > i ? '#f87171' : 'transparent',
            border: `1px solid ${outs > i ? '#f87171' : 'rgba(255,255,255,.28)'}`,
          }} />
        ))}
        <span style={{ fontSize: 8, color: C.text3, fontFamily: NUM_FONT, letterSpacing: '.06em', fontWeight: 800 }}>OUT</span>
      </span>
    </span>
  )
}

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

  // ── PASS 2 of the At The Plate rebuild (2026-08-14, scoped 2026-08-13 via
  // AskUserQuestion — Donovan picked "keep both patterns" and "a few focused
  // passes"). Two pieces:
  //   1. FULL-GAME vs JUST-HIM on the spray chart. The field always drew the
  //      whole game's balls with his solid and the rest dimmed — good default,
  //      but there was no way to LOOK AT ONLY HIM. The toggle below narrows
  //      the liveBalls prop itself, so SprayField needed no changes.
  //   2. A PLAYER-SCOPED BBE section (his contact tonight, every ball — not
  //      just the slate-wide loud stuff BattedBallLog gates at the top of the
  //      page), rendered under the charts for whoever the room is pointed at.
  const [sprayScope, setSprayScope] = useState('game')   // 'game' | 'him'
  const hisBalls = useMemo(
    () => liveBalls.filter((b) => Number(b.batterId) === Number(selectedId)),
    [liveBalls, selectedId],
  )
  const sprayBalls = sprayScope === 'him' ? hisBalls : liveBalls

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

      {/* ── 0 · THE GAMES, FIRST (2026-08-14 restructure) ──────────────────
          Donovan: "i wanted the games at the top. with a better selector...
          the just now and all that pick a game should look better and more
          precise like how that chart is at the bottom of the screen." One
          precise table now leads the page: every live game, who's at the
          plate, tap to enter — it IS the selector, replacing the who's-up
          card strip AND the separate Pick-a-game control this page used to
          stack above the room. The two slate-wide review rails (loudest
          contact, your guys' finished ABs) moved BELOW the room — they're
          what you check between at-bats, not what should stand between you
          and the man currently hitting. */}
      <GamesBoard
        games={liveGames}
        activePk={a.pk}
        lines={snap?.lines}
        abbrs={abbrs}
        onSelect={(pk) => setPinnedGame(pk)}
      />

      {/* ── 1 · (retired 2026-08-14) — "Pick a game" merged into the Games
          board above: one table is the selector AND the who's-up read.
          Its 2026-08-13 matchup-first labelling lesson carries over (rows
          lead with the matchup, who's-up beside it, never a bare list of
          hitters). */}

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
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 9, alignItems: 'center', fontFamily: NUM_FONT, flexWrap: 'wrap' }}>
            {/* The feed's linescore (15s poll) is the fresher source for the
                game on screen; the schedule snapshot (25s) is the fallback.
                One source per render — never outs from one and runners from
                the other, which could disagree mid-play. */}
            {(() => {
              const s = feed && feed.outs != null ? feed : (a.g.outs != null ? a.g : null)
              return s ? <Situation outs={s.outs} on1={s.on1} on2={s.on2} on3={s.on3} /> : null
            })()}
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

      {/* ── 3 · TIMELINE (2026-08-14 — replaced the Coming Up section, on
          request: "i would also like that what i sent picture of removed").
          Coming Up was a second batting-order list on a page whose box
          score below already lists the whole order with AT BAT / ON DECK /
          IN HOLE / NEXT tags and tap-to-point — but "what happened in this
          game" had no home at all. See Timeline above. */}
      <Timeline
        feed={feed}
        g={a.g}
        abbrs={abbrs}
        onPick={(id) => setPinnedHitter(Number(id))}
      />

      {/* ── 3b · BOX SCORE ─────────────────────────────────────────────
          Everything this needs was already in the snapshot; the page just
          never showed it. See BoxScore below. */}
      <BoxScore
        g={a.g}
        byId={byId}
        watchIds={watchIds}
        abbrs={abbrs}
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
              {sprayBalls.length > 0 && (
                <span title={`${sprayBalls.length} tracked ball${sprayBalls.length === 1 ? '' : 's'} in play ${sprayScope === 'him' ? `from ${selName || 'him'}` : 'in this game'}, plotted on the same field`} style={{
                  fontSize: 8.5, fontWeight: 900, fontFamily: NUM_FONT, letterSpacing: '.08em',
                  color: LIVE, border: `1px solid ${LIVE}70`, background: 'rgba(74,222,128,.10)',
                  borderRadius: 999, padding: '2px 8px',
                }}>● LIVE {sprayBalls.length}</span>
              )}
              {/* full-game vs just-him (Pass 2). Counts on both chips, same
                  rule as the tonight-only filters inside the chart: a toggle
                  that can hand back zero without saying so reads as broken. */}
              {liveBalls.length > 0 && (
                <span style={{ display: 'flex', gap: 4 }}>
                  {[['game', `This game ${liveBalls.length}`], ['him', `Just ${String(selName || 'him').split(' ').slice(-1)[0]} ${hisBalls.length}`]].map(([k, label]) => (
                    <button key={k} onClick={() => setSprayScope(k)} style={{
                      fontSize: 8.5, fontWeight: 800, fontFamily: NUM_FONT, cursor: 'pointer',
                      border: `1px solid ${sprayScope === k ? LIVE : C.border}`,
                      background: sprayScope === k ? 'rgba(74,222,128,.12)' : 'transparent',
                      color: sprayScope === k ? LIVE : C.text3,
                      borderRadius: 999, padding: '2px 9px',
                    }}>{label}</button>
                  ))}
                </span>
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
              liveBalls={sprayBalls}
              liveFocusId={Number(selectedId)}
              liveLabel={selName}
            />
          </div>
        </div>
      </div>

      {/* ── 4b · HIS CONTACT TONIGHT (Pass 2, 2026-08-14) ────────────────
          The player-scoped BBE section. The slate-wide log at the top of
          the page gates on loud contact (HH / barrel / deep) across every
          game; this is EVERY ball the selected hitter has put in play in
          THIS game, soft ground balls included — his night's contact as a
          list, under the two charts drawing the same balls as pictures.
          Same data (feed.balls), zero new fetch. Appears with his first
          ball in play — the zone map's own empty message already covers
          "nothing yet", so this section doesn't add a second one. */}
      {hisBalls.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Band note="every ball he's put in play in this game, newest first">
            {`${String(selName || 'His').split(' ').slice(-1)[0]}'s contact tonight`}
          </Band>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '7px 12px' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 3, borderBottom: `1px solid ${C.border}` }}>
              <span style={{ width: 30, flexShrink: 0, fontSize: 8, color: C.text3, fontFamily: NUM_FONT }}>INN</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 8, color: C.text3, fontFamily: NUM_FONT }}>RESULT</span>
              <span style={{ width: 38, textAlign: 'right', flexShrink: 0, fontSize: 8, color: C.text3, fontFamily: NUM_FONT }}>EV</span>
              <span style={{ width: 30, textAlign: 'right', flexShrink: 0, fontSize: 8, color: C.text3, fontFamily: NUM_FONT }}>LA</span>
              <span style={{ width: 38, textAlign: 'right', flexShrink: 0, fontSize: 8, color: C.text3, fontFamily: NUM_FONT }}>DIST</span>
              <span style={{ width: 66, textAlign: 'right', flexShrink: 0, fontSize: 8, color: C.text3, fontFamily: NUM_FONT }}>FLAGS</span>
            </div>
            {[...hisBalls].reverse().map((b, i) => {
              const isHr = /home.?run/i.test(String(b.event || ''))
              return (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 0', borderBottom: i < hisBalls.length - 1 ? `1px solid rgba(255,255,255,.04)` : 'none' }}>
                  <span style={{ width: 30, flexShrink: 0, fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
                    {b.half === 'top' ? 'T' : 'B'}{b.inning || '?'}
                  </span>
                  <span title={b.typeName ? `Off a ${b.typeName}${b.velo != null ? ` at ${b.velo.toFixed(0)} mph` : ''}` : undefined} style={{
                    flex: 1, minWidth: 0, fontSize: 10.5, fontWeight: isHr ? 900 : 600,
                    color: isHr ? C.orange : b.xbh ? '#4ade80' : C.text2,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {isHr ? '💥 ' : ''}{String(b.event || '—').replace(/_/g, ' ')}
                  </span>
                  <span style={{ width: 38, textAlign: 'right', flexShrink: 0, fontSize: 10, fontFamily: NUM_FONT, fontWeight: b.hh ? 800 : 400, color: b.hh ? '#fb923c' : C.text2 }}>
                    {b.ev != null ? b.ev.toFixed(1) : '·'}
                  </span>
                  <span style={{ width: 30, textAlign: 'right', flexShrink: 0, fontSize: 10, fontFamily: NUM_FONT, color: C.text2 }}>
                    {b.la != null ? `${Math.round(b.la)}°` : '·'}
                  </span>
                  <span style={{ width: 38, textAlign: 'right', flexShrink: 0, fontSize: 10, fontFamily: NUM_FONT, color: b.dist >= 375 ? '#fb923c' : C.text2 }}>
                    {b.dist ? Math.round(b.dist) : '·'}
                  </span>
                  <span style={{ width: 66, textAlign: 'right', flexShrink: 0, display: 'flex', gap: 3, justifyContent: 'flex-end' }}>
                    {b.hh && <span title="Hard hit — 95+ mph off the bat" style={{ fontSize: 7.5, fontWeight: 900, fontFamily: NUM_FONT, color: '#fb923c', border: '1px solid #fb923c55', borderRadius: 4, padding: '0 4px' }}>HH</span>}
                    {b.barrel && <span title="Barrel — the EV/LA combinations that historically produce .500/1.500" style={{ fontSize: 7.5, fontWeight: 900, fontFamily: NUM_FONT, color: '#f87171', border: '1px solid #f8717155', borderRadius: 4, padding: '0 4px' }}>BRL</span>}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 5 · THE SLATE-WIDE REVIEW RAILS (moved below the room,
          2026-08-14 restructure) — what you check BETWEEN at-bats, not what
          should stand between you and the man currently hitting. */}
      <div style={{ marginTop: 14 }}>
        <BattedBallLog players={players} onPlayerClick={onPlayerClick} />
        <JustNow players={players} watchIds={watchIds} onPlayerClick={onPlayerClick} />
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

// ── Coming Up: RETIRED (2026-08-14, Donovan sent a screenshot of it and
// asked for it removed). It was a second batting-order list on a page whose
// box score below already carries the whole order with AT BAT / ON DECK /
// IN HOLE / NEXT tags, lines, and tap-to-point — one list too many. Its one
// unique piece of information (the on-deck / in-the-hole marks) moved onto
// the box score rows so nothing was actually lost.

// 📋 BOX SCORE — the real one now, not a reconstruction.
//
// 2026-08-15, Donovan: "the box score on the at the plate is hard to read."
//
// He was right, and the reason was structural. This panel was built out of
// what lib/liveSlate.js already had in memory — a flex row per hitter, from a
// payload whose field mask carries AB/H/HR/TB/R/RBI and nothing else. No
// walks, no strikeouts, no left-on-base, no positions, no season average, and
// no pitching lines at all, because a live pick board never needed them. That
// is not a box score; it is a pick-grading row wearing box-score headings, and
// no amount of restyling was going to make it read like the thing it was
// imitating.
//
// So it now fetches the actual boxscore for this one game (lib/boxscore.js)
// and renders it through the SAME component the Boxes tab uses. One box score
// implementation on the site, one place to improve it, and this page gains
// every column it was missing.
//
// The cost is one request per opened game, cached, live-refreshed only while
// the game is live — not on the 25-second sitewide poll this page already runs.
function BoxScore({ g, byId, watchIds, onPick, abbrs }) {
  const [box, setBox] = useState(undefined)
  const live = g?.state === 'Live'

  useEffect(() => {
    let alive = true
    if (!g?.pk) { setBox(null); return undefined }
    setBox(undefined)
    const pull = (fresh) => {
      if (fresh) forget(g.pk)
      fullBox(g.pk, { live }).then((b) => { if (alive) setBox(b || null) })
        .catch(() => { if (alive) setBox(null) })
    }
    pull(false)
    if (!live) return () => { alive = false }
    const t = setInterval(() => { if (!document.hidden) pull(true) }, 30000)
    return () => { alive = false; clearInterval(t) }
  }, [g?.pk, live])

  // The watchlist is keyed on the composite row key and a boxscore row carries
  // the bare numeric id — translated through the slate, which has both. Same
  // trap scripts/check-ids.mjs guards; see components/tabs/Boxes.js.
  const watched = useMemo(() => {
    const out = new Set()
    if (!watchIds?.size || !byId) return out
    byId.forEach((p, id) => { if (watchIds.has(playerId(p))) out.add(Number(id)) })
    return out
  }, [byId, watchIds])

  if (!g?.pk) return null
  if (box === undefined) {
    return (
      <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, padding: '8px 0' }}>
        Loading the box…
      </div>
    )
  }
  if (!box) return null

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{
          fontSize: 8.5, fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase',
          color: C.text2, fontFamily: NUM_FONT,
        }}>Box score</span>
        <span style={{ fontSize: 9, color: C.text3 }}>
          both sides, straight off the league&apos;s boxscore{live ? ' · refreshing every 30s' : ''}
        </span>
      </div>
      <div className="box-cols" style={{
        display: 'grid', gap: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
      }}>
        {['away', 'home'].map((sd) => (
          <div key={sd} style={{ minWidth: 0 }}>
            <BattingBox
              side={box[sd]}
              title={box[sd]?.team?.name || abbrs?.[sd === 'away' ? g.awayId : g.homeId] || sd}
              highlight={watched}
              onPlayerClick={onPick ? (p) => onPick(p.id) : undefined}
            />
            <PitchingBox side={box[sd]} />
          </div>
        ))}
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
