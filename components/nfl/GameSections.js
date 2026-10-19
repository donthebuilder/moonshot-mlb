'use client'
import { QMark } from './NflNote'
import { useState } from 'react'
import TeamMark from '../TeamMark'
import { nflNickname } from '../../lib/nfl/teams'
import PlayerFace from '../PlayerFace'
import Tap from '../Tap'
import { Dial } from '../VerdictHero'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
import { scoreboardRows, receiverEdge } from '../../lib/nfl/gameMatchup'
import { offenseTiles, defenseTiles, factsNote } from './tabs/Matchups'
import { softRole, softLine } from '../../lib/nfl/dvpSignal'
import { mostWord } from '../../lib/format'
import { Kicker } from './GameOffDef'
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

const USED = new Set(['PRESSURE', 'BLITZ', 'ZONE', 'MAN', '20+ PASSES'])

// HOW THEY DEFEND (Donovan 10-18: "the matchup page needs a full redo"; "I like symmetrical ... pristine"). The two defenses
// side by side in one even table: a row per measure (pass rush, blitz, zone or man, long passes allowed), each cell the
// number, its rank of 32 and a thin bar for where it sits in the league. Neutral ink, no accent: a lot of pressure is not
// good or bad on its own (the old block's rule); the top eight are brighter. What each defense GIVES UP by role moved to the
// DvP grid at the top of the game (GameDvp), so the "gives up" chips are not drawn twice.
function DefendCell({ c }) {
  if (!c) return <span style={{ color: C.text3 }}>—</span>
  const value = c.chip?.label && /coverage/.test(c.chip.label) ? `${c.chip.value} ${c.chip.label.replace(' coverage', '')}` : c.chip?.value
  return (
    <span title={`${c.text} · ${c.word}`} style={{ display: 'block' }}>
      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 6 }}>
        <b style={{ font: `900 14px/1.1 ${NUM_FONT}`, color: C.text }}>{value}</b>
        <span style={{ font: `800 11px/1 ${NUM_FONT}`, color: c.rank <= 8 ? C.text : C.text3 }}>#{c.rank}</span>
      </span>
      <span aria-hidden="true" style={{ display: 'block', height: 3, marginTop: 4, borderRadius: 2, background: C.border, position: 'relative' }}>
        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.round(Math.max(0.04, Math.min(1, c.pos)) * 100)}%`, borderRadius: 2, background: c.rank <= 8 ? C.text2 : C.text3 }} />
      </span>
    </span>
  )
}

export function MatchupScoreboard({ matchup, data, game }) {
  const rows = scoreboardRows(matchup, game.away, game.home)
  const slate = Number(data?.season) || null
  const chart = Number(matchup?.chart_season)
  const oldSeason = slate && chart && chart < slate ? chart : null
  if (!rows.length) return null
  const grid = { display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr) minmax(0,1fr)', gap: 12, alignItems: 'center' }
  return (
    <section aria-label="How they defend" style={{ marginBottom: 16 }}>
      <Kicker>HOW THEY DEFEND</Kicker>
      <div style={{ ...grid, paddingBottom: 6 }}>
        <span style={{ font: `800 11px/1 ${NUM_FONT}`, color: C.text3, letterSpacing: '.08em' }}>RANK OF 32</span>
        {[game.away, game.home].map((t) => (
          <span key={t} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, font: `900 12px/1 ${NUM_FONT}`, color: C.text }}>
            <TeamMark sport="nfl" abbr={t} variant="logo" px={20} />{t} D
          </span>
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.key} style={{ ...grid, minHeight: 44, borderTop: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 13, color: C.text2 }}>{r.label}</span>
          {r.cells.map((c, i) => <DefendCell key={i} c={c} />)}
        </div>
      ))}
      {oldSeason ? <p style={{ margin: '8px 0 0', fontSize: 12, color: C.text3 }}>Pass rush, coverage and long passes: {oldSeason}.</p> : null}
    </section>
  )
}

// ── 5. IMPORTANT STATS: rest, the weakest spot by position, then the rest of the numbers ──
/** Rest as one word (10-18): SHORT under 6 days or a flagged short week, LONG at 10+ days (a bye week), else NORMAL. */
export const restWord = (days, shortWeek = false) => (shortWeek || Number(days) < 6 ? 'SHORT' : Number(days) >= 10 ? 'LONG' : 'NORMAL')

export function ImportantStats({ matchup, data, game: g, onOpenTeam = null }) {
  const [more, setMore] = useState(false)
  const rest = g.away_rest_days != null && g.home_rest_days != null
  const soft = [g.away, g.home].map((def) => [def, softRole(matchup, def)]).filter(([, s]) => s?.standout)
  const tiles = (list) => list.filter((t) => !USED.has(t.k))
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
      {soft.map(([def, s]) => (
        <p key={def} style={{ margin: 0, padding: '8px 0', borderTop: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.5, color: C.text2 }}><Tap onClick={onOpenTeam && (() => onOpenTeam(def))} title={`Open ${def}`}><TeamMark sport="nfl" abbr={def} variant="logo" px={16} style={{ verticalAlign: '-3px', marginRight: 4 }} /><b style={{ color: C.text }}>{nflNickname(def)}</b></Tap> {softLine(s)}.</p>
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
