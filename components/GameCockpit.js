'use client'
import { useEffect, useRef, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../lib/theme'
import { clean, surname } from '../lib/player'
import TeamMark from './TeamMark'
import PlayerFace from './PlayerFace'
import { Chip } from './writeups/ChipLines'
import { SPORT_ACCENT } from '../lib/sportAccent'
import { onLiveRefresh } from '../lib/liveRefresh'

// 🎥 GAME COCKPIT — per-at-bat depth for the ONE game you're locked into.
//
// The wire tells you the slate; this tells you the game: count and outs
// right now, who's up / on deck / in the hole with pick badges, and the
// last several plate appearances with the ball off the bat (EV / distance)
// where it was tracked. Scoped hard on purpose — the full live feed is a
// heavy object, so it loads for ONE gamePk, only while this panel is open,
// 30s opt-in auto or the button. Self-hides pregame and postgame.

// NOTE (2026-08-09): `fields` is a WHITELIST — anything not named here is
// stripped by the server. That's exactly how the due-up alert stayed dead for
// weeks (offense/batter were never requested). This list is the cockpit's own
// keys only; the live charts on At the Plate fetch their own field list
// through lib/livePitches.
const FIELDS = 'gameData,status,abstractGameState,teams,abbreviation,liveData,linescore,currentInning,isTopInning,inningState,outs,balls,strikes,offense,batter,onDeck,inHole,first,second,third,home,away,runs,id,fullName,plays,allPlays,currentPlay,result,event,description,about,inning,halfInning,matchup,playEvents,isPitch,hitData,launchSpeed,launchAngle,totalDistance'

const primaryRole = (p) => String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()

// Result → plain words + a KIND (2026-10-17, the old one painted green / red / blue by hand): the heat is the product's own accent -- reached base glows,
// a homer glows most, an out is quiet. The raw feed says "grounded_into_double_play"; a human says GIDP.
const RESULT_STYLE = [
  [/home.?run/i,            { word: 'HOMER', kind: 'hr' }],
  [/triple/i,               { word: 'triple', kind: 'hit' }],
  [/double(?!.?play)/i,     { word: 'double', kind: 'hit' }],
  [/single/i,               { word: 'single', kind: 'hit' }],
  [/intent.?walk/i,         { word: 'IBB', kind: 'base' }],
  [/walk|hit.?by.?pitch/i,  { word: 'walk', kind: 'base' }],
  [/strikeout|struck/i,     { word: 'K', kind: 'out' }],
  [/double.?play|gidp/i,    { word: 'GIDP', kind: 'out' }],
  [/sac/i,                  { word: 'sac', kind: 'out' }],
  [/error/i,                { word: 'reached on error', kind: 'base' }],
]
const styleFor = (event) => {
  for (const [re, s] of RESULT_STYLE) if (re.test(event || '')) return s
  return { word: String(event || '').toLowerCase().replace(/_/g, ' '), kind: 'out' }
}
const HEAT = { hr: 2, hit: 1, base: 1, out: 0 }

// Last name only: keeps a loaded-bases line short next to the score and count.
const lastOf = (full) => {
  const t = String(full || '').trim()
  return surname(t) || t
}

// The bases as a diamond (second on top, like the field), a chip per runner on.
function Bases({ off, theme }) {
  const { C } = theme
  const on = (b) => !!(off?.[b]?.id)
  const d = (filled) => ({
    width: 9, height: 9, transform: 'rotate(45deg)', borderRadius: 2,
    background: filled ? theme.accent : 'transparent',
    border: `1.5px solid ${filled ? theme.accent : C.border2}`,
  })
  const runners = [['1B', 'first'], ['2B', 'second'], ['3B', 'third']].filter(([, k]) => on(k)).map(([b, k]) => [b, off[k].fullName])
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span title={`Bases: ${runners.map(([b, nm]) => `${b} ${nm || '?'}`).join(' · ') || 'empty'}`}
        style={{ display: 'inline-grid', gridTemplateColumns: '12px 12px 12px', gridTemplateRows: '12px 12px', alignItems: 'center', justifyItems: 'center' }}>
        <span /><span style={d(on('second'))} /><span />
        <span style={d(on('third'))} /><span /><span style={d(on('first'))} />
      </span>
      {runners.map(([b, nm]) => <Chip key={b} theme={theme} label={`${b} ${nm ? lastOf(nm) : '?'}`} />)}
    </span>
  )
}

export default function GameCockpit({ game, onPlayerClick }) {
  const gamePk = game?.game_pk
  const gp = game?.players || []
  const [data, setData] = useState(undefined)
  const [auto, setAuto] = useState(false)   // LIVE ON YOUR TAP (2026-10-02): auto-refresh is a choice you turn on, not the default
  const timer = useRef(null)

  const pull = async () => {
    if (!gamePk) return
    const j = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live?fields=${FIELDS}`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
    setData(j || null)
  }
  useEffect(() => { setData(undefined); pull() }, [gamePk])
  // the ↻ pulls this game too (lib/liveRefresh.js); auto, if you turn it on, still ticks
  useEffect(() => onLiveRefresh(() => pull()), [gamePk]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    clearInterval(timer.current)
    const live = data?.gameData?.status?.abstractGameState === 'Live'
    if (auto && live) timer.current = setInterval(() => { if (!document.hidden) pull() }, 30000)
    return () => clearInterval(timer.current)
  }, [auto, data?.gameData?.status?.abstractGameState, gamePk])

  if (!gamePk || data === undefined || data === null) return null
  const state = data?.gameData?.status?.abstractGameState
  if (state !== 'Live') return null   // the cockpit is a live instrument only

  const theme = { C, NUM_FONT, TYPE, accent: SPORT_ACCENT.mlb }
  const ls = data?.liveData?.linescore || {}
  const plays = data?.liveData?.plays?.allPlays || []
  const cur = data?.liveData?.plays?.currentPlay
  const roleOf = {}
  gp.forEach((p) => { const id = Number(p?.player_id ?? p?.id); if (id) roleOf[id] = { role: primaryRole(p), p } })
  const roleChip = (id) => (roleOf[Number(id)]?.role ? <Chip theme={theme} label={`PICK ${roleOf[Number(id)].role}`} heat={2} /> : null)
  const clickFor = (id) => { const r = roleOf[Number(id)]; if (r?.p) onPlayerClick?.(r.p) }

  const done = plays.filter((pl) => pl?.result?.event).slice(-7).reverse()
  const curPitches = (cur?.playEvents || []).filter((e) => e?.isPitch).length
  const gt = data?.gameData?.teams || {}
  const aR = ls?.teams?.away?.runs, hR = ls?.teams?.home?.runs
  const outs = Math.min(3, ls.outs ?? 0)
  const ctl = { minHeight: 44, minWidth: 44, padding: '0 12px', borderRadius: 999, cursor: 'pointer', font: `800 ${TYPE.label}px/1 ${NUM_FONT}` }
  const batter = ls?.offense?.batter

  return (
    <div style={{ background: `linear-gradient(155deg, ${theme.accent}0d, ${C.bg2})`, border: `1px solid ${theme.accent}47`, borderRadius: 12, padding: '10px 12px', marginBottom: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: `900 ${TYPE.label}px/1 ${NUM_FONT}`, letterSpacing: '.12em', color: theme.accent }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: theme.accent, boxShadow: `0 0 8px ${theme.accent}` }} />LIVE AT-BATS
        </span>
        {(aR != null || hR != null) && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, font: `900 13px/1 ${NUM_FONT}`, color: C.text }}>
            <TeamMark sport="mlb" abbr={gt?.away?.abbreviation} variant="logo" px={18} />{aR ?? 0}–{hR ?? 0}<TeamMark sport="mlb" abbr={gt?.home?.abbreviation} variant="logo" px={18} />
          </span>
        )}
        <Chip theme={theme} label={`${ls.inningState || (ls.isTopInning ? 'Top' : 'Bot')} ${ls.currentInning ?? '?'}`} />
        <span title={`${outs} out${outs === 1 ? '' : 's'}`} aria-label={`${outs} outs`} style={{ display: 'inline-flex', gap: 3 }}>
          {[0, 1, 2].map((i) => <span key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: i < outs ? theme.accent : 'transparent', border: `1.5px solid ${i < outs ? theme.accent : C.border2}` }} />)}
        </span>
        <Chip theme={theme} value={`${ls.balls ?? 0}-${ls.strikes ?? 0}`} label="count" />
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button type="button" aria-pressed={auto} onClick={() => setAuto((v) => !v)} style={{ ...ctl, border: `1px solid ${auto ? theme.accent : C.border}`, background: auto ? `${theme.accent}1f` : 'transparent', color: auto ? theme.accent : C.text2 }}>{auto ? 'auto 30s' : 'auto'}</button>
          <button type="button" aria-label="Refresh" onClick={pull} style={{ ...ctl, border: `1px solid ${C.border}`, background: 'transparent', color: C.text2 }}>↻</button>
        </span>
      </div>

      <Bases off={ls?.offense} theme={theme} />

      {/* who is up, then who is coming */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' }}>
        {batter && (
          <button type="button" onClick={() => clickFor(batter.id)} disabled={!roleOf[Number(batter.id)]}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '4px 12px 4px 6px', borderRadius: 999, cursor: roleOf[Number(batter.id)] ? 'pointer' : 'default', color: C.text,
              background: `${theme.accent}1a`, border: `1px solid ${theme.accent}66`, font: `800 ${TYPE.name}px/1.2 ${NUM_FONT}` }}>
            <PlayerFace sport="mlb" id={String(batter.id)} name={clean(batter.fullName, '')} size={32} theme={C} />
            <span>{clean(batter.fullName, '?')}</span>
            {roleChip(batter.id)}
            {curPitches > 0 && <Chip theme={theme} label={`pitch ${curPitches + 1}`} />}
          </button>
        )}
        {ls?.offense?.onDeck && (
          <button type="button" onClick={() => clickFor(ls.offense.onDeck.id)} disabled={!roleOf[Number(ls.offense.onDeck.id)]}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 8px', background: 'transparent', border: 0, cursor: roleOf[Number(ls.offense.onDeck.id)] ? 'pointer' : 'default', color: C.text2, font: `700 ${TYPE.body}px/1.2 ${NUM_FONT}` }}>
            <span style={{ color: C.text3, letterSpacing: '.08em', fontWeight: 900 }}>NEXT</span>{clean(ls.offense.onDeck.fullName, '?')}{roleChip(ls.offense.onDeck.id)}
          </button>
        )}
        {ls?.offense?.inHole && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.text3, font: `700 ${TYPE.body}px/1.2 ${NUM_FONT}` }}>
            <span style={{ letterSpacing: '.08em', fontWeight: 900 }}>THEN</span>{clean(ls.offense.inHole.fullName, '?')}{roleChip(ls.offense.inHole.id)}
          </span>
        )}
      </div>

      {/* THE CHARTS LEFT THIS PANEL (2026-08-10, Donovan): the zone map and spray chart live on the At the Plate tab. This is count / outs / bases / last PAs. */}
      {/* the last plate appearances, ball-off-the-bat included */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {done.map((pl, i) => {
          const ev = (pl.playEvents || []).map((e) => e?.hitData).find((h) => h?.launchSpeed != null)
          const st = styleFor(pl?.result?.event)
          const bid = pl?.matchup?.batter?.id
          const evN = ev ? Number(ev.launchSpeed) : null
          const distN = ev?.totalDistance ? Number(ev.totalDistance) : null
          const click = roleOf[Number(bid)] ? () => clickFor(bid) : null
          return (
            <div key={i} role={click ? 'button' : undefined} tabIndex={click ? 0 : undefined} onClick={click || undefined}
              onKeyDown={click ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); click() } } : undefined}
              style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minHeight: click ? 44 : 32, padding: '2px 8px', borderRadius: 8, minWidth: 0, cursor: click ? 'pointer' : 'default',
                background: st.kind === 'hr' ? `${theme.accent}1a` : 'transparent', borderLeft: `3px solid ${HEAT[st.kind] ? theme.accent : 'transparent'}` }}>
              <span style={{ width: 30, flexShrink: 0, font: `700 ${TYPE.body}px/1 ${NUM_FONT}`, color: C.text3 }}>{pl?.about?.halfInning === 'top' ? 'T' : 'B'}{pl?.about?.inning}</span>
              <span style={{ font: `800 ${TYPE.name}px/1.2 ${NUM_FONT}`, color: HEAT[st.kind] ? C.text : C.text2, minWidth: 0, overflowWrap: 'anywhere' }}>{surname(clean(pl?.matchup?.batter?.fullName, '?'))}</span>
              {roleChip(bid)}
              <Chip theme={theme} label={st.word} heat={HEAT[st.kind]} />
              {/* ball off the bat: exit velo when tracked; carry only when it means something (200+ ft) */}
              {ev && <span style={{ marginLeft: 'auto' }}><Chip theme={theme} value={evN.toFixed(1)} label={`mph${distN >= 200 ? ` · ${distN.toFixed(0)} ft` : ''}`} heat={evN >= 100 ? 2 : evN >= 95 ? 1 : 0} /></span>}
            </div>
          )
        })}
      </div>
      <div style={{ font: `600 ${TYPE.micro}px/1.4 ${NUM_FONT}`, color: C.text3, marginTop: 6 }}>Newest first. Glow = reached base. Exit velo when tracked, carry past 200 ft.</div>
    </div>
  )
}
