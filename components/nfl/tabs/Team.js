'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../../lib/nfl/theme'
import { NFL_TEAMS } from '../../../lib/nfl/teams'
import { fetchNflStandings } from '../../../lib/nfl/standings'
import { hashParams, writeHash } from '../../../lib/urlState'
import { takeTarget, dropTarget, TARGET_EVENT } from '../../../lib/openTarget'
import PageHeader from '../../PageHeader'
import NflTable from '../NflTable'
import TeamMark, { MatchLogos } from '../../TeamMark'
import { Empty } from '../../ui'
import { withNflFullSet } from '../../../lib/nfl/boardColumns'
import { tdPool } from '../../../lib/nfl/tdPool'
import { tdStatusFor } from '../../../lib/nfl/tdStatus'
import { useGameCalls } from '../GameCalls'
import { STATUS_WORD } from '../../../lib/callStatus'

// 🏈 TUDDY'S TEAM PAGE (2026-10-03, Donovan: "research teams and see their
// stats just like the same way you would do a player"). A tapped club used to
// open the Players portal filtered to it; now it opens this page, on LAMP's
// team-page shape: the club and its record, this week's game, its players on
// this week's board (every market's score), its defense per game, and its
// division. Data: the week file TUDDY already loads (nfl_week.json players /
// games / team_defense) and the public standings feed the Standings tab reads.
const NAME = Object.fromEntries(NFL_TEAMS)
const TEAM_COLUMNS = [
        { key: 'name', label: 'Player', heat: false, sticky: true, w: 160, bold: true, group: 'Player' },
        { key: 'position', label: 'Pos', heat: false, w: 40, mono: true, group: 'Player' },
        { key: 'td', label: 'TD', w: 52, dp: 1, primary: true, group: 'Scores' },
        { key: 'recyds', label: 'Rec yds', w: 58, dp: 1, group: 'Scores' },
        { key: 'rec', label: 'Rec', w: 52, dp: 1, group: 'Scores' },
        { key: 'rushyds', label: 'Rush yds', w: 58, dp: 1, group: 'Scores' },
        { key: 'rushatt', label: 'Rush att', w: 58, dp: 1, group: 'Scores' },
        { key: 'passyds', label: 'Pass yds', w: 58, dp: 1, group: 'Scores' },
        { key: 'xtd', label: 'xTD/G', w: 52, dp: 2, group: 'Scoring chances' },
        { key: 'rz', label: 'RZ/G', w: 48, dp: 1, group: 'Scoring chances' },
]
const n = (v, dp = 1) => (v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(dp))

export default function Team({ data, picks = null, onOpenPlayer, onOpenGame }) {
  const [code, setCode] = useState(null)
  useEffect(() => { const t = String(takeTarget('team') || '').toUpperCase(); if (t) setCode(t) }, [])
  useEffect(() => {
    if (!code) return
    const h = hashParams()
    if (h.get('team') !== code) { const had = h.get('team'); h.set('team', code); writeHash(h, { push: Boolean(had) }) }   // club to club pushes, so Back walks back
  }, [code])
  // The address can change under a page that stays mounted (a pasted #team=, Back from one
  // club to the last, a club tapped while this page is open) -- MOONSHOT's Team rule.
  // The address is the newer word, so a target nobody took is dropped; a tap left a fresh one.
  useEffect(() => {
    const onAddress = () => { dropTarget('team'); const t = String(hashParams().get('team') || '').toUpperCase(); if (t) setCode(t) }
    const onTap = () => { const t = String(takeTarget('team') || '').toUpperCase(); if (t) setCode(t) }
    window.addEventListener('hashchange', onAddress); window.addEventListener('popstate', onAddress); window.addEventListener(TARGET_EVENT, onTap)
    return () => { window.removeEventListener('hashchange', onAddress); window.removeEventListener('popstate', onAddress); window.removeEventListener(TARGET_EVENT, onTap) }
  }, [])
  // THE BOARD'S OWN WORDS (lib/callStatus via lib/nfl/tdStatus): CALLED = on the bot's card,
  // ON THE BOARD = the top third of the week's TD board. Not "has a row this week".
  const gameCalls = useGameCalls()
  const status = useMemo(() => tdStatusFor({ picksCard: picks?.card, gameCalls, games: data?.games, board: tdPool(data).rows }), [picks, gameCalls, data])
  const [st, setSt] = useState(null)
  useEffect(() => { let alive = true; fetchNflStandings().then((d) => { if (alive) setSt(d) }).catch(() => {}); return () => { alive = false } }, [])

  const rows = useMemo(() => (data?.players || []).filter((p) => p.team === code && !p.on_bye)
    .map((p) => ({ ...p, _raw: p, _id: p.player_id, td: p.scores?.TD ?? null, recyds: p.scores?.REC_YDS ?? null, rec: p.scores?.REC ?? null, rushyds: p.scores?.RUSH_YDS ?? null, rushatt: p.scores?.RUSH_ATT ?? null, passyds: p.scores?.PASS_YDS ?? null, xtd: p.stats?.xTD ?? null, rz: p.stats?.RZ ?? null }))
    .sort((a, b) => (b.td ?? -1) - (a.td ?? -1)), [data, code])
  if (!code) return <Empty title="NO CLUB PICKED" note="Tap a club's logo anywhere on TUDDY — a board, a game, standings — to open its page." />
  if (!NAME[code]) return <Empty title="NO SUCH CLUB" note={`"${code}" isn't one of the 32 NFL clubs.`} />

  const div = (st?.conferences || []).flatMap((c) => c.divisions).find((d) => d.teams.some((t) => t.abbr === code)) || null
  const me = div?.teams.find((t) => t.abbr === code) || null
  const place = div ? div.teams.findIndex((t) => t.abbr === code) + 1 : null
  const game = (data?.games || []).find((g) => g.home === code || g.away === code) || null
  const def = data?.team_defense?.per_game?.[code] || null
  const called = rows.filter((r) => status.statusOf(r._raw) === 'called').length
  const onBoard = rows.filter((r) => status.statusOf(r._raw) === 'board').length
  const rec = me ? `${me.w}-${me.l}${me.t ? `-${me.t}` : ''}` : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader eyebrow="TUDDY · TEAM" theme={C} numFont={NUM_FONT} accent={C.green}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}><TeamMark sport="nfl" abbr={code} variant="logo" px={56} />{NAME[code]}</span>}
        note={div ? `${div.name}${place ? ` · ${place}${['', 'st', 'nd', 'rd'][place] || 'th'}` : ''}${me?.strk ? ` · streak ${me.strk}` : ''}` : 'The club, this week, its players on the board, its defense.'}
        stats={[rec && { value: rec, label: 'RECORD', tone: C.text }, me?.pf != null && { value: `${me.pf}-${me.pa}`, label: 'PF-PA', tone: C.text2 }, called > 0 && { value: called, label: STATUS_WORD.called, tone: C.green }, { value: onBoard, label: STATUS_WORD.board, tone: C.green }].filter(Boolean)} />

      {game && (
        <section>
          <Kick>THIS WEEK · {data?.label || ''}</Kick>
          <button type="button" onClick={() => onOpenGame?.(game.game_id)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 52, padding: '8px 12px', borderRadius: 12, border: `1px solid ${C.border2}`, background: C.bg2, color: C.text, cursor: 'pointer', textAlign: 'left' }}>
            <MatchLogos sport="nfl" away={game.away} home={game.home} px={26} gap={8} />
            <span style={{ font: `800 13px/1.2 system-ui, sans-serif` }}>{NAME[game.away]?.split(' ').pop()} at {NAME[game.home]?.split(' ').pop()}</span>
            <span style={{ marginLeft: 'auto', font: `800 12px/1 ${NUM_FONT}`, color: game.state === 'in' ? C.green : C.text2 }}>
              {game.state === 'post' ? `${game.away_score}-${game.home_score} F` : game.state === 'in' ? `LIVE ${game.away_score}-${game.home_score}` : new Date(game.kickoff).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
            </span>
          </button>
        </section>
      )}

      <section>
        <Kick>HIS PLAYERS THIS WEEK · {rows.length}</Kick>
        {rows.length ? (
          <NflTable {...withNflFullSet(rows, TEAM_COLUMNS, { skip: ['sc_TD', 'sc_REC_YDS', 'sc_REC', 'sc_RUSH_YDS', 'sc_RUSH_ATT', 'sc_PASS_YDS', 'st_xTD', 'st_RZ'] })} statusOf={(r) => status.statusOf(r._raw ?? r)} onRowClick={(r) => onOpenPlayer?.(r._raw ?? r, 'TD')} faceOf={(r) => ({ sport: 'nfl', id: r.player_id, espnId: r.espn_id, name: r.name })}
            initialSort={{ key: 'td', dir: 'desc' }} maxHeight={9999} maxRows={rows.length}
            caption="His club's players this week, every market's score and the full stat set. Each row opens the player." />
        ) : <Empty title="NO PLAYERS THIS WEEK" note="A bye week, or this club isn't scored yet." />}
      </section>

      {def && (
        <section>
          <Kick>DEFENSE · PER GAME · {def.g} {def.g === 1 ? 'GAME' : 'GAMES'}{(() => { const y = Number(data?.team_defense?.season); const sl = Number(data?.season); return y && sl ? (y >= sl ? ' THIS SEASON' : y === sl - 1 ? ' LAST SEASON' : ` ${y}`) : '' })()}</Kick>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[['POINTS ALLOWED', n(def.points_allowed)], ['SACKS', n(def.def_sacks)], ['INTERCEPTIONS', n(def.def_interceptions)], ['FUMBLES RECOVERED', n(def.def_fumble_recoveries)], ['DEF TDs', n(def.def_touchdowns)]].map(([k, v]) => (
              <div key={k} style={{ padding: '10px 14px', borderRadius: 12, border: `1px solid ${C.border2}`, background: C.bg2 }}>
                <div style={{ font: `900 22px/1 ${NUM_FONT}`, color: C.text }}>{v}</div>
                <div style={{ marginTop: 5, font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.08em', color: C.text3 }}>{k}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {div && (
        <section>
          <Kick>{div.name.toUpperCase()}</Kick>
          <NflTable rows={div.teams.map((t, i) => ({ ...t, _id: t.abbr, rank: i + 1, team: t.abbr, rec: `${t.w}-${t.l}${t.t ? `-${t.t}` : ''}` }))} onRowClick={(r) => { const a = (r._raw ?? r).abbr; if (a !== code) setCode(a) }}
            maxHeight={9999} maxRows={4} noGroups caption="The division, in league order. Each row opens that club."
            columns={[
              { key: 'rank', label: '#', heat: false, rankCol: true, w: 34 },
              { key: 'team', label: 'Club', heat: false, w: 34, mono: true, teamMark: 'nfl' },
              { key: 'nickname', label: 'Team', heat: false, sticky: true, w: 140, bold: true },
              { key: 'rec', label: 'W-L', heat: false, w: 64, mono: true },
              { key: 'pf', label: 'PF', w: 52, dp: 0 },
              { key: 'pa', label: 'PA', w: 52, dp: 0, invert: true },
              { key: 'diff', label: 'Diff', w: 52, dp: 0 },
            ]} />
        </section>
      )}
    </div>
  )
}

function Kick({ children }) {
  return <div style={{ font: `900 11px/1 ${NUM_FONT}`, letterSpacing: '.16em', color: C.green, margin: '0 0 8px' }}>{children}</div>
}
