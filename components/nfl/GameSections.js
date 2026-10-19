'use client'
import { QMark } from './NflNote'
import { useState } from 'react'
import TeamMark from '../TeamMark'
import { nflNickname } from '../../lib/nfl/teams'
import PlayerFace from '../PlayerFace'
import Tap from '../Tap'
import { Dial } from '../VerdictHero'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
import { receiverEdge } from '../../lib/nfl/gameMatchup'
import { attackRows } from '../../lib/nfl/attackSheet'
import { factsNote } from './tabs/Matchups'
import { softRole, softLine } from '../../lib/nfl/dvpSignal'
import { mostWord } from '../../lib/format'
import { Kicker } from './Kicker'
import { TD_WORD } from '../../lib/nfl/teamTdModel'
import { roleLabel } from '../../lib/nfl/roles'
import { sideFor } from '../../lib/nfl/whoLines'
import NflTable from './NflTable'

// THE GAME PAGE'S PLAIN SECTIONS (2026-10-06, fix5-nflgame). Donovan on the old
// page: "the boxes or bubbles with the stats in there are not even big, you can't
// see what the words say ... you don't need both team and opposition logos ... make
// some of these things bigger ... make it so somebody's granny can understand all of
// this." Order on the page: GAME header, OFFENSE vs DEFENSE (GameOffDef), KEY
// PLAYERS, MATCHUP scoreboard, IMPORTANT STATS, then the research. Every number
// here is one the page already had; only the words and the sizes changed.

// ── 1. THE GAME, ONCE ───────────────────────────────────────────────────────
export function GameHeader({ game: g, when, air, xtd, heat, past, onOpenTeam, outLine = null, action = null }) {
  const live = g.state === 'in'
  const Team = ({ t }) => (
    <Tap onClick={onOpenTeam && (() => onOpenTeam(t))} title={`Open ${t}`} style={{ minHeight: 48, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <TeamMark sport="nfl" abbr={t} variant="logo" px={44} />
      <span style={{ fontFamily: NUM_FONT, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em', color: past ? C.text3 : C.text }}>{t}</span>
    </Tap>
  )
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
          <Team t={g.away} />
          <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 16 }}>@</span>
          <Team t={g.home} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: 84 }} title={xtd == null ? TD_WORD : `${xtd.toFixed(1)} ${TD_WORD} between the two teams: each club's touchdown rate against the other's defense. The ring shows where it sits among all matchups in the league.`}>
          <Dial value={xtd} dp={1} pct={100 * heat} col={C.green} size={64} title={xtd == null ? TD_WORD : `${xtd.toFixed(1)} ${TD_WORD} in this game`} />
          <span style={{ fontSize: 12, lineHeight: 1.25, color: C.text2, textAlign: 'center' }}>{TD_WORD}</span>
        </div>
      </div>
      <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'baseline', fontSize: TYPE.name, color: C.text, fontWeight: 700 }}>
        <span style={{ fontFamily: NUM_FONT, color: live ? C.green : C.text }}>{live ? (g.detail || 'LIVE') : g.completed ? 'FINAL' : when}</span>
        {(live || g.completed) && <span style={{ fontFamily: NUM_FONT, fontWeight: 900 }}>{g.away} {g.away_score ?? 0}–{g.home_score ?? 0} {g.home}</span>}
        {g.venue && <span style={{ color: C.text2, fontWeight: 600 }}>· {g.venue}</span>}
        {air && <span style={{ color: C.text2, fontWeight: 600 }}>· {air}</span>}
        {outLine && <span style={{ color: C.text2, fontWeight: 600 }}>· {outLine}</span>}
        {action ? <span style={{ marginLeft: 'auto', alignSelf: 'center' }}>{action}</span> : null}
      </div>
      {live && (g.down_distance || g.possession) && (
        <div style={{ marginTop: 4, color: C.green, fontSize: 12, fontWeight: 800, fontFamily: NUM_FONT }}>
          {g.possession ? `${g.possession} ball` : ''}{g.possession && g.down_distance ? ' · ' : ''}{g.down_distance || ''}{g.red_zone ? ' · RED ZONE' : ''}
        </div>
      )}
    </div>
  )
}

// ── 4. KEY PLAYERS: WHO GETS THE BALL, AND THE CORNERS THEY FACE ────────────
const SLOT_WORD = { LCB: 'Left corner', RCB: 'Right corner', NB: 'Slot corner' }
const Face = ({ r, team, name, espn }) => <PlayerFace sport="nfl" espnId={espn ?? r?.espn_id} team={r?.team || team} name={r?.name || name} size={44} />

function Pairing({ t, corner, r, onPlayerClick }) {
  const name = r?.name || t.name
  return (
    <div style={{ display: 'grid', gridTemplateColumns: corner ? 'minmax(0,1fr) auto minmax(0,1fr)' : 'minmax(0,1fr)', gap: 8, alignItems: 'center', minHeight: 56, padding: '6px 0', borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Face r={r} team={r?.team} name={name} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: TYPE.name, fontWeight: 800, lineHeight: 1.2, color: C.text }}>
            {r && onPlayerClick ? <Tap onClick={() => onPlayerClick(r)}>{name}</Tap> : name}
          </div>
          <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.35 }}>{(r ? roleLabel(r) : t.position) || '—'} · {t.share}% of targets</div>
        </div>
      </div>
      {corner && <span aria-hidden="true" style={{ color: C.text3, fontSize: 12, fontFamily: NUM_FONT }}>vs</span>}
      {corner && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexDirection: 'row-reverse', textAlign: 'right' }}>
          <PlayerFace sport="nfl" espnId={corner.espn_id} team={corner.team} name={corner.name} size={44} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: TYPE.name, fontWeight: 800, lineHeight: 1.2, color: C.text }}>{corner.name}</div>
            <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.35 }}>{SLOT_WORD[corner.slot] || corner.slot}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// KEY PLAYERS AS A TABLE (2026-10-10, Donovan: "all these can be better"; CLAUDE: tables lead). Each club's three most-targeted men
// beside the corner the depth chart lines against him, and the edge the pass defence gives. Same data as before (matchup.pass_game
// targets / corners, receiverEdge); the rows pair the depth chart in order, no source says who really covers whom.
export function KeyPlayers({ matchup, data, game, onPlayerClick, onOpenTeam }) {
  const pg = matchup?.pass_game
  const rows = data?.players || []
  const rowOf = (id) => rows.find((p) => String(p.player_id) === String(id))
  const slate = Number(data?.season) || null
  const list = []
  const notes = []
  for (const [off, def] of [[game.away, game.home], [game.home, game.away]]) {
    const tg = (pg?.targets?.[off] || []).slice(0, 3)
    if (!tg.length) continue
    const cb = (pg?.corners?.[def] || []).slice(0, 3).map((c) => ({ ...c, team: def }))
    const edge = cb.length ? receiverEdge(matchup, off, def) : null
    tg.forEach((t, i) => {
      const r = rowOf(t.player_id)
      const c = cb[i] || null
      list.push({ _key: `${off}-${t.player_id}`, _raw: r || { player_id: t.player_id, name: t.name, team: off }, name: r?.name || t.name, team: off,
        role: (r ? roleLabel(r) : t.position) || '—', side: (() => { const q = sideFor({ matchup, id: t.player_id, position: t.position }); return q.basis === 'role' ? `${q.word} · role` : q.word })(), share: Number(t.share), corner: c?.name || '—', spot: c?.slot || '', slot: c ? (SLOT_WORD[c.slot] || c.slot) : '—', def: c ? def : '—',
        edge: i === 0 && edge ? edge.word : '', espn: r?.espn_id })
    })
    notes.push(edge ? `${def} allow ${edge.yds} yards a game to a top receiver, ${mostWord(edge.rank)}.` : `${off}'s three most-targeted players.`)
  }
  if (!list.length) return null
  const old = pg?.season && slate && pg.season < slate ? pg.season : null
  // WHO GETS THE BALL, TRIMMED (Donovan 10-18: "who gets the ball ... seems pretty generic"). Five columns that each say
  // something: his share of the targets, where on the field, the corner the depth chart lines up against him (his spot as
  // LCB / RCB / NB), and the pass defense's edge once per club. The team and opponent columns went: his logo is in the name
  // cell and the opponent is the other club in this game. One short line under it, not three sentences.
  const cols = [
    { key: 'name', label: 'Receiver', sticky: true, bold: true, heat: false, w: 150, group: 'WHO GETS THE BALL' },
    { key: 'role', label: 'Role', heat: false, w: 46, group: 'WHO GETS THE BALL' },
    { key: 'share', label: 'Tgt %', w: 56, dp: 1, primary: true, group: 'WHO GETS THE BALL', fmt: (v) => `${v}%`, title: "His share of his team's targets" },
    { key: 'side', label: 'Side', heat: false, w: 80, group: 'WHO GETS THE BALL', title: "Where he is targeted most (left / middle / right, the offence's own view); 'role' = only his depth-chart spot is known; Spread = his targets go everywhere." },
    { key: 'corner', label: 'Corner', heat: false, w: 120, group: 'HIS CORNER', fmt: (v, r) => (v === '—' ? '—' : <span>{v} <span style={{ fontSize: 10, color: C.text3 }}>{r.spot}</span></span>) },
    { key: 'edge', label: 'Edge', heat: false, w: 76, group: 'HIS CORNER', title: "The pass defense's edge: how many yards it allows a top receiver, against the league" },
  ]
  return (
    <section aria-label="Key players" style={{ marginBottom: 16 }}>
      <Kicker>WHO GETS THE BALL · HIS CORNER</Kicker>
      <NflTable rows={list} columns={cols} onRowClick={(r) => onPlayerClick?.(r?._raw ?? r)} bare maxRows={6} maxHeight={9999}
        nameCell="player" faceOf={(r) => ({ sport: 'nfl', espnId: r.espn, team: r.team, name: r.name })}
        caption={`${notes.join(' ')}${old ? ` (${old} season)` : ''} Corners pair the depth chart in order.`} />
    </section>
  )
}

// HOW THEY DEFEND = THE ATTACK SHEET (Donovan 10-19, "G2" on the Chart Lab, after three rounds of prototypes and "I'm
// still confused how to use this data or what to attack with it"). Pick whose ball it is; each row is one thing the other
// defense does (the word, the number, its rank of 32) and the player on this offense who beats it, with the number that
// says so (lib/nfl/attackSheet.js). The most extreme traits come first; a standout (top or bottom 8) wears the defense's
// colour, the middle plain ink. The play-type words are the usual football answer, said once under the rows.
export function MatchupScoreboard({ matchup, data, game, onPlayerClick = null }) {
  const [ball, setBall] = useState(game.home)
  const def = ball === game.home ? game.away : game.home
  const rows = attackRows(matchup, data?.players, ball, def)
  const chart = Number(matchup?.chart_season)
  const slate = Number(data?.season) || null
  if (!attackRows(matchup, data?.players, game.home, game.away).length && !attackRows(matchup, data?.players, game.away, game.home).length) return null
  const pill = (t) => ({ minHeight: 0, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', font: `800 12px/1 ${NUM_FONT}`, background: 'transparent',
    border: `1px solid ${t === ball ? C.green : C.border2}`, color: t === ball ? C.green : C.text2, display: 'inline-flex', alignItems: 'center', gap: 6 })
  return (
    <section aria-label="How they defend" style={{ marginBottom: 16 }}>
      <Kicker>HOW TO ATTACK THEM</Kicker>
      <div role="group" aria-label="Whose ball" style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        {[game.away, game.home].map((t) => (
          <button key={t} type="button" className="tap-box" aria-pressed={t === ball} onClick={() => setBall(t)} style={pill(t)}>
            <TeamMark sport="nfl" abbr={t} variant="logo" px={16} />{t} ball
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.08em', color: C.text3, padding: '4px 0' }}>
        <span>{def} DEFENSE · RANK OF 32</span><span>WHO BEATS IT</span>
      </div>
      {rows.map((r) => (
        <div key={r.k} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.9fr) 14px minmax(0, 1.3fr)', gap: 8, alignItems: 'center', minHeight: 44, padding: '6px 0', borderTop: `1px solid ${C.border}` }}>
          <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
            <b style={{ font: `900 12px/1.15 ${NUM_FONT}`, letterSpacing: '.03em', color: r.tier === 1 ? C.text2 : C.text }}>{r.word}</b>
            <span style={{ font: `700 11px/1.2 ${NUM_FONT}`, color: C.text3 }}>{r.val} · #{r.rank}</span>
          </span>
          <span aria-hidden="true" style={{ font: `900 14px/1 ${NUM_FONT}`, color: C.green, textAlign: 'center' }}>→</span>
          <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
            <b style={{ fontSize: 13, lineHeight: 1.2, color: C.text }}>{r.player && onPlayerClick ? <Tap onClick={() => onPlayerClick(r.player, 'TD')}>{r.name}</Tap> : r.name}</b>
            <span style={{ fontSize: 11, color: C.text2, lineHeight: 1.3 }}>{r.why}</span>
          </span>
        </div>
      ))}
      <p style={{ margin: '6px 0 0', fontSize: 11, color: C.text3, lineHeight: 1.4 }}>
        Quick throws, go deep, run it: the usual answer to that trait; the player and his number are real.{chart && slate && chart < slate ? ` Pass rush, coverage and receivers vs zone / man: ${chart}.` : ''}
      </p>
    </section>
  )
}

// ── 5. IMPORTANT STATS: rest, the weakest spot by position, then the rest of the numbers ──
/** Rest as one word (10-18): SHORT under 6 days or a flagged short week, LONG at 10+ days (a bye week), else NORMAL. */
export const restWord = (days, shortWeek = false) => (shortWeek || Number(days) < 6 ? 'SHORT' : Number(days) >= 10 ? 'LONG' : 'NORMAL')

// STATS AS RATES, BOTH SIDES (Donovan 10-18: "show the rate, not 9 of 27 ... and the other side's rate"; "vs blitz,
// under center, play-action -- explain them or drop them"; keep the "3x the league average" lines, make them stand out:
// "target this"). The offense-vs-defense rates live in the attack sheet above (10-19); this keeps rest and TARGET THIS.
// Formation, motion and play-action left this page (no defense rate answers them; the Matchups page keeps them).

export function ImportantStats({ matchup, data, game: g, onOpenTeam = null }) {
  const rest = g.away_rest_days != null && g.home_rest_days != null
  const soft = [g.away, g.home].map((def) => [def, softRole(matchup, def)]).filter(([, s]) => s?.standout)
  const note = factsNote(matchup, g.away, g.home, data?.season)
  return (
    <section aria-label="Important stats" style={{ marginBottom: 16 }}>
      <Kicker>IMPORTANT STATS</Kicker>
      {/* REST AS A CHIP (Donovan 10-18: "instead of showing the days it could just be short or long"): SHORT under 6 days
          (or the feed's short-week flag), LONG at 10+ (a bye), else NORMAL; the days ride the chip's title. */}
      {rest && (
        <div style={{ display: 'flex', gap: 8, minHeight: 40, alignItems: 'center', flexWrap: 'wrap', borderTop: `1px solid ${C.border}`, fontSize: 13 }}>
          <span style={{ flex: '0 0 56px', color: C.text2 }}>Rest</span>
          {[[g.away, g.away_rest_days, g.away_short_week], [g.home, g.home_rest_days, g.home_short_week]].map(([t, d, sw]) => {
            const word = restWord(d, sw)
            const hot = word !== 'NORMAL'
            return (
              <span key={t} title={`${t}: ${d} days of rest`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, border: `1px solid ${hot ? C.green : C.border2}`, color: hot ? C.green : C.text2, font: `800 11px/1.2 ${NUM_FONT}`, letterSpacing: '.06em' }}>
                <TeamMark sport="nfl" abbr={t} variant="logo" px={14} />{word}
              </span>
            )
          })}
        </div>
      )}
      {/* TARGET THIS (10-18: he loves the "3x the league average" lines; make them stand out) */}
      {soft.map(([def, s]) => (
        <div key={def} style={{ margin: '8px 0', padding: '8px 10px', borderRadius: 10, border: `1px solid ${C.green}`, background: `${C.green}14`, fontSize: 13, lineHeight: 1.45, color: C.text2 }}>
          <span style={{ display: 'block', font: `900 11px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: C.green, marginBottom: 4 }}>🎯 TARGET THIS</span>
          <Tap onClick={onOpenTeam && (() => onOpenTeam(def))} title={`Open ${def}`}><TeamMark sport="nfl" abbr={def} variant="logo" px={16} style={{ verticalAlign: '-3px', marginRight: 4 }} /><b style={{ color: C.text }}>{nflNickname(def)}</b></Tap> {softLine(s)}.
        </div>
      ))}
      {/* the OFF | DEF rate table (10-19) left: the attack sheet above answers each fight with the other side's player and number */}
      {note && <p style={{ margin: '6px 0 0', fontSize: 12, color: C.text3 }}>{note}</p>}
    </section>
  )
}
