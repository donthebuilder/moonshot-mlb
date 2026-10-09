'use client'
import { QMark } from './NflNote'
import { useState } from 'react'
import TeamMark from '../TeamMark'
import PlayerFace from '../PlayerFace'
import Tap from '../Tap'
import { Dial } from '../VerdictHero'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
import { scoreboardRows, receiverEdge } from '../../lib/nfl/gameMatchup'
import { offenseTiles, defenseTiles, factsNote } from './tabs/Matchups'
import { softRole, softLine } from '../../lib/nfl/dvpSignal'
import { ordinal } from '../../lib/format'
import { Kicker } from './GameOffDef'
import { TD_WORD } from '../../lib/nfl/teamTdModel'

// THE GAME PAGE'S PLAIN SECTIONS (2026-10-06, fix5-nflgame). Donovan on the old
// page: "the boxes or bubbles with the stats in there are not even big, you can't
// see what the words say ... you don't need both team and opposition logos ... make
// some of these things bigger ... make it so somebody's granny can understand all of
// this." Order on the page: GAME header, OFFENSE vs DEFENSE (GameOffDef), KEY
// PLAYERS, MATCHUP scoreboard, IMPORTANT STATS, then the research. Every number
// here is one the page already had; only the words and the sizes changed.

// ── 1. THE GAME, ONCE ───────────────────────────────────────────────────────
export function GameHeader({ game: g, when, air, xtd, heat, past, onOpenTeam }) {
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: 84 }} title={xtd == null ? TD_WORD : `${xtd.toFixed(1)} ${TD_WORD} between the two teams: each club's touchdown rate against the other's defence. The ring shows where it sits among all matchups in the league.`}>
          <Dial value={xtd} dp={1} pct={100 * heat} col={C.green} size={64} title={xtd == null ? TD_WORD : `${xtd.toFixed(1)} ${TD_WORD} in this game`} />
          <span style={{ fontSize: 12, lineHeight: 1.25, color: C.text2, textAlign: 'center' }}>{TD_WORD}</span>
        </div>
      </div>
      <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'baseline', fontSize: TYPE.name, color: C.text, fontWeight: 700 }}>
        <span style={{ fontFamily: NUM_FONT, color: live ? C.green : C.text }}>{live ? (g.detail || 'LIVE') : g.completed ? 'FINAL' : when}</span>
        {(live || g.completed) && <span style={{ fontFamily: NUM_FONT, fontWeight: 900 }}>{g.away} {g.away_score ?? 0}–{g.home_score ?? 0} {g.home}</span>}
        {g.venue && <span style={{ color: C.text2, fontWeight: 600 }}>· {g.venue}</span>}
        {air && <span style={{ color: C.text2, fontWeight: 600 }}>· {air}</span>}
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
          <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.35 }}>{t.position || '—'} · {t.share}% of targets</div>
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

export function KeyPlayers({ matchup, data, game, onPlayerClick, onOpenTeam }) {
  const pg = matchup?.pass_game
  const rows = data?.players || []
  const rowOf = (id) => rows.find((p) => String(p.player_id) === String(id))
  const slate = Number(data?.season) || null
  const blocks = [[game.away, game.home], [game.home, game.away]].map(([off, def]) => {
    const tg = (pg?.targets?.[off] || []).slice(0, 3)
    const cb = (pg?.corners?.[def] || []).slice(0, 3).map((c) => ({ ...c, team: def }))
    return { off, def, tg, cb }
  }).filter((b) => b.tg.length)
  if (!blocks.length) return null
  const old = pg?.season && slate && pg.season < slate ? pg.season : null
  return (
    <section aria-label="Key players" style={{ marginBottom: 16 }}>
      <Kicker>KEY PLAYERS</Kicker>
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))' }}>
        {blocks.map(({ off, def, tg, cb }) => {
          const edge = cb.length ? receiverEdge(matchup, off, def) : null
          return (
            <div key={off} style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <Tap onClick={onOpenTeam && (() => onOpenTeam(off))} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: TYPE.name, fontWeight: 900, color: C.text }}>
                  <TeamMark sport="nfl" abbr={off} variant="logo" px={24} />{off} gets the ball{cb.length ? ` against ${def}'s corners` : ''}
                </Tap>
                {edge && <span style={{ fontFamily: NUM_FONT, fontSize: 13, fontWeight: 900, padding: '4px 10px', borderRadius: 999, border: `1px solid ${edge.side === off ? C.green : C.border}`, color: edge.side === off ? C.green : C.text2 }}>{edge.word}</span>}
              </div>
              {tg.map((t, i) => <Pairing key={t.player_id} t={t} corner={cb[i] || null} r={rowOf(t.player_id)} onPlayerClick={onPlayerClick} />)}
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6, fontSize: 12, lineHeight: 1.5, color: C.text3 }}>
                {edge
                  ? <>{def} allow {edge.yds} yards a game to a top receiver, {ordinal(edge.rank)} most. <QMark label="Who covers whom" text="Rows pair the depth chart in order. No source says who really covers whom." /></>
                  : `${off}'s three most-targeted players${old ? ` (${old} season)` : ''}.`}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

const USED = new Set(['PRESSURE', 'BLITZ', 'ZONE', 'MAN', '20+ PASSES'])

// ── 3. THE MATCHUP SCOREBOARD ────────────────────────────────────────────────
function Bar({ pos, mid, up }) {
  const lo = Math.min(pos, mid), hi = Math.max(pos, mid)
  return (
    <div aria-hidden="true" style={{ position: 'relative', flex: '1 1 auto', height: 6, borderRadius: 3, background: 'rgba(255,255,255,.08)' }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${lo * 100}%`, width: `${Math.max(0.02, hi - lo) * 100}%`, borderRadius: 3, background: up ? C.green : C.text3 }} />
      <div style={{ position: 'absolute', top: -3, bottom: -3, left: `${mid * 100}%`, width: 2, background: C.text2 }} />
    </div>
  )
}

function Cell({ c }) {
  if (!c) return <div style={{ minHeight: 44 }} />
  return (
    <div style={{ minHeight: 44, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: TYPE.name, lineHeight: 1.3, color: C.text }}>
        <TeamMark sport="nfl" abbr={c.team} variant="logo" px={22} />
        <span style={{ minWidth: 0 }}>{c.text}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <Bar pos={c.pos} mid={c.mid} up={c.pos >= c.mid} />
        <span style={{ flex: '0 0 auto', fontSize: 12, color: C.text2, fontFamily: NUM_FONT, whiteSpace: 'nowrap' }}>{c.word}{c.early ? ` · early: ${c.early} ${c.early === 1 ? 'game' : 'games'}` : ''}</span>
      </div>
    </div>
  )
}

export function MatchupScoreboard({ matchup, data, game }) {
  const rows = scoreboardRows(matchup, game.away, game.home)
  const slate = Number(data?.season) || null
  const chart = Number(matchup?.chart_season)
  const oldSeason = slate && chart && chart < slate ? chart : null
  if (!rows.length) return null
  return (
    <section aria-label="Matchup" style={{ marginBottom: 16 }}>
      <Kicker>THE MATCHUP</Kicker>
      <div style={{ display: 'grid', gap: 14 }}>
        {rows.map((r) => (
          <div key={r.key}>
            <div style={{ fontSize: TYPE.name, fontWeight: 900, color: C.text, marginBottom: 6 }}>{r.label}</div>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}>
              {r.cells.map((c, i) => <Cell key={i} c={c} />)}
            </div>
          </div>
        ))}
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.5, color: C.text3 }}>
        The bar starts at the league middle: right of the tick = more than a typical team, left = less.{oldSeason ? ` Pass rush, zone or man and long passes are ${oldSeason} season numbers.` : ''}
      </p>
    </section>
  )
}

// ── 5. IMPORTANT STATS: rest, the weakest spot by position, then the rest of the numbers ──
export function ImportantStats({ matchup, data, game: g, onOpenTeam = null }) {
  const [more, setMore] = useState(false)
  const rest = g.away_rest_days != null && g.home_rest_days != null
  const soft = [g.away, g.home].map((def) => [def, softRole(matchup, def)]).filter(([, s]) => s?.standout)
  const tiles = (list) => list.filter((t) => !USED.has(t.k))
  const note = factsNote(matchup, g.away, g.home, data?.season)
  return (
    <section aria-label="Important stats" style={{ marginBottom: 16 }}>
      <Kicker>IMPORTANT STATS</Kicker>
      {rest && (
        <div style={{ display: 'flex', gap: 12, minHeight: 36, alignItems: 'center', borderTop: `1px solid ${C.border}`, fontSize: 13 }}>
          <span style={{ flex: '0 0 100px', color: C.text2 }}>Rest</span>
          <span style={{ color: C.text, fontWeight: 700 }}>{g.away} {g.away_rest_days} days{g.away_short_week ? ' (short week)' : ''} · {g.home} {g.home_rest_days} days{g.home_short_week ? ' (short week)' : ''}</span>
        </div>
      )}
      {soft.map(([def, s]) => (
        <p key={def} style={{ margin: 0, padding: '8px 0', borderTop: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.5, color: C.text2 }}><Tap onClick={onOpenTeam && (() => onOpenTeam(def))} title={`Open ${def}`}><b style={{ color: C.text }}>{def}</b></Tap> {softLine(s)}.</p>
      ))}
      <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more}
        style={{ minHeight: 44, padding: '0 2px', border: 0, borderTop: `1px solid ${C.border}`, width: '100%', textAlign: 'left', background: 'transparent', color: C.green, font: `800 13px/1 ${NUM_FONT}`, cursor: 'pointer' }}>
        {more ? 'Fewer numbers ▴' : 'More numbers ▾'}
      </button>
      {more && (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}>
          {[[g.away, g.home], [g.home, g.away]].map(([off, def]) => (
            <div key={off} style={{ minWidth: 0 }}>
              {[[`${off} offense`, tiles(offenseTiles(matchup, off))], [`${def} defense`, tiles(defenseTiles(matchup, def))]].map(([label, list]) => list.length ? (
                <div key={label} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.08em', color: C.text2, fontFamily: NUM_FONT, marginBottom: 2 }}>{label.toUpperCase()}</div>
                  {list.map((t) => (
                    <div key={t.k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, minHeight: 32, alignItems: 'center', borderTop: `1px solid ${C.border}`, fontSize: 13 }}>
                      <span style={{ color: C.text2, textTransform: 'capitalize' }}>{t.k.toLowerCase()}</span>
                      <span style={{ textAlign: 'right' }}><b style={{ fontFamily: NUM_FONT, color: C.text }}>{t.v}</b>{t.sub ? <span style={{ color: C.text3, fontSize: 12 }}> · {t.sub}</span> : null}</span>
                    </div>
                  ))}
                </div>
              ) : null)}
            </div>
          ))}
        </div>
      )}
      {more && note && <p style={{ margin: 0, fontSize: 12, color: C.text3 }}>{note}</p>}
    </section>
  )
}
