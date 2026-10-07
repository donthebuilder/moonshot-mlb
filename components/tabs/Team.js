'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { teamKey, teamName, mlbTeamLogo, isKnownTeam } from '../../lib/mlbTeams'
import { hashParams, writeHash } from '../../lib/urlState'
import { takeTarget, leaveTarget } from '../../lib/openTarget'
import PageHeader from '../PageHeader'
import DenseTable from '../DenseTable'
import { MatchLogos } from '../TeamMark'
import { Empty } from '../ui'

// ⚾ MOONSHOT'S TEAM PAGE (2026-10-03, Donovan: "I like to be able to research
// teams and see their stats just like the same way you would do a player").
// LAMP's team page (components/lamp/tabs/Team.js) is the model: the club, its
// record, the game that matters now, its people, its last and next games.
// Data: tonight's slate (the board rows MOONSHOT already loaded -- its hitters
// with every model number) and MLB's public schedule for the club (record,
// last five, next five). A tapped team logo anywhere in MOONSHOT lands here
// (TeamNav); the club rides the address (team=).
const API = 'https://statsapi.mlb.com/api/v1'
const SEASON = new Date().getUTCFullYear()
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

function useClubSchedule(code) {
  const [state, setState] = useState({ data: null, error: null })
  useEffect(() => {
    if (!code) return undefined
    let alive = true
    setState({ data: null, error: null })
    ;(async () => {
      const teams = await fetch(`${API}/teams?sportId=1&season=${SEASON}&fields=teams,id,abbreviation,teamName`).then((r) => r.json())
      const club = (teams.teams || []).find((t) => teamKey(t.abbreviation) === code) || (teams.teams || []).find((t) => t.teamName === teamName(code))
      if (!club) throw new Error('no such club')
      const fields = 'dates,date,games,gamePk,gameDate,gameType,status,abstractGameState,detailedState,teams,away,home,team,id,abbreviation,score,leagueRecord,wins,losses'
      const sched = await fetch(`${API}/schedule?sportId=1&teamId=${club.id}&season=${SEASON}&gameType=R,F,D,L,W&hydrate=team&fields=${fields}`).then((r) => r.json())
      const games = (sched.dates || []).flatMap((d) => (d.games || []).map((g) => {
        const home = g.teams?.home, away = g.teams?.away
        const isHome = home?.team?.id === club.id
        const us = isHome ? home : away, them = isHome ? away : home
        return {
          pk: String(g.gamePk), date: d.date, start: g.gameDate, type: g.gameType, state: g.status?.abstractGameState, detail: g.status?.detailedState,
          home: teamKey(home?.team?.abbreviation) || home?.team?.abbreviation, away: teamKey(away?.team?.abbreviation) || away?.team?.abbreviation,
          isHome, us: num(us?.score), them: num(them?.score), record: us?.leagueRecord || null,
        }
      }))
      return { club, games }
    })().then((data) => { if (alive) setState({ data, error: null }) }).catch((error) => { if (alive) setState({ data: null, error }) })
    return () => { alive = false }
  }, [code])
  return state
}

const when = (iso) => { try { return new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) } catch { return '' } }

function GameLine({ g, onOpen }) {
  const done = g.state === 'Final' && g.us != null && g.them != null   // a postponed 'Final' has no score: print its status
  const res = done && g.us != null && g.them != null ? (g.us > g.them ? 'W' : g.us < g.them ? 'L' : 'T') : null
  return (
    <button type="button" onClick={() => onOpen?.(g)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, padding: '6px 10px', border: 0, borderBottom: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: onOpen ? 'pointer' : 'default', textAlign: 'left' }}>
      <span style={{ font: `700 11px/1 ${NUM_FONT}`, color: C.text3, minWidth: 92 }}>{done ? g.date : when(g.start)}</span>
      <MatchLogos sport="mlb" away={g.away} home={g.home} px={24} gap={6} />
      <span style={{ marginLeft: 'auto', font: `800 12px/1 ${NUM_FONT}`, color: res === 'W' ? C.green : res === 'L' ? C.text3 : C.text2 }}>
        {done ? `${res} ${g.us}-${g.them}` : g.state === 'Live' ? `LIVE ${g.us ?? 0}-${g.them ?? 0}` : g.detail}
      </span>
    </button>
  )
}

export default function Team({ players = [], onPlayerClick, onOpenGame, onOpenBox }) {
  const [code, setCode] = useState(null)
  useEffect(() => {
    const t = teamKey(takeTarget('team') || '')
    if (t) setCode(t)
  }, [])
  useEffect(() => {
    if (!code) return
    const h = hashParams()
    if (h.get('team') !== code) { const had = h.get('team'); h.set('team', code); writeHash(h, { push: Boolean(had) }) }   // club to club pushes, so Back walks back
  }, [code])
  // The address can change under a page that stays mounted -- a club tapped on a
  // player card opened here, or Back from one club to the last (TUDDY's rule, 10-04).
  useEffect(() => {
    const on = () => { const t = teamKey(hashParams().get('team') || ''); if (t) setCode(t) }
    window.addEventListener('hashchange', on); window.addEventListener('popstate', on)
    return () => { window.removeEventListener('hashchange', on); window.removeEventListener('popstate', on) }
  }, [])
  const { data, error } = useClubSchedule(code)
  const rows = useMemo(() => players.filter((p) => teamKey(p?.team) === code)
    .map((p) => ({ ...p, role: p.game_pick_role || '', _id: `${p.player_id}-${p.game_pk}` }))   // role: the table's coloured role chip
    .sort((a, b) => (num(a.board_rank) ?? 999) - (num(b.board_rank) ?? 999)), [players, code])
  if (!code) return <Empty title="NO CLUB PICKED" note="Tap a club's logo anywhere on MOONSHOT — a board, a game, a player's card — to open its page." />
  if (!isKnownTeam(code)) return <Empty title="NO SUCH CLUB" note={`"${code}" isn't one of the 30 MLB clubs.`} />

  const games = data?.games || []
  const played = games.filter((g) => g.state === 'Final')
  const ahead = games.filter((g) => g.state !== 'Final')
  const rec = [...played].reverse().find((g) => g.record && g.type === 'R')?.record || played[played.length - 1]?.record || null
  const last5 = played.slice(-5).reverse()
  const next5 = ahead.slice(0, 5)
  const live = games.find((g) => g.state === 'Live') || null
  // Tonight's slate has a page per game (Games). A game that is not on it -- last
  // week's, or next week's -- has no lineup page; its destination is the Box
  // scores page on THAT date with the game open (it used to open Games on an
  // empty focus). Falls back to Games when the shell has no box door.
  const openGame = (g) => {
    if (onOpenBox && !players.some((p) => String(p?.game_pk) === String(g.pk))) { leaveTarget('boxday', g.date); leaveTarget('boxgame', g.pk); onOpenBox(); return }
    leaveTarget('game', g.pk); onOpenGame?.(g.pk)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader eyebrow="MOONSHOT · TEAM" theme={C} numFont={NUM_FONT} accent={C.orange}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}><img src={mlbTeamLogo(code, 112)} alt="" width={56} height={56} style={{ width: 56, height: 56, objectFit: 'contain' }} />{teamName(code)}</span>}
        note={rec ? `${SEASON} regular season record from MLB's schedule.` : 'The club, its hitters on tonight’s board, its last and next games.'}
        stats={rec ? [{ value: `${rec.wins}-${rec.losses}`, label: 'RECORD', tone: C.text }, { value: rows.length, label: 'ON THE BOARD', tone: C.orange }] : [{ value: rows.length, label: 'ON THE BOARD', tone: C.orange }]} />
      {error ? <p style={{ margin: 0, color: C.amber, fontSize: 12 }}>MLB&apos;s schedule feed is delayed — the board below is still current.</p> : null}

      <section>
        <Kick>TONIGHT ON THE BOARD · {rows.length}</Kick>
        {rows.length ? (
          <DenseTable rows={rows} onRowClick={(r) => onPlayerClick?.(r._raw ?? r)} faceOf={(r) => ({ sport: 'mlb', id: r.player_id, name: r.name })}
            initialSort={{ key: 'board_rank', dir: 'asc' }} maxHeight={9999} maxRows={rows.length}
            caption="His club's hitters on tonight's board, every model number. Each row opens the hitter."
            columns={[
              { key: 'board_rank', label: '#', heat: false, rankCol: true, w: 40, group: 'Hitter' },
              { key: 'name', label: 'Player', heat: false, sticky: true, w: 168, bold: true, group: 'Hitter' },
              { key: 'role', label: 'Role', heat: false, w: 120, group: 'Hitter', fmt: (v) => v || '—' },
              { key: 'lineup_spot', label: 'Spot', heat: false, w: 44, mono: true, group: 'Hitter' },
              { key: 'hr_score', label: 'HR score', w: 64, dp: 1, primary: true, group: 'The model' },
              { key: 'hit_score', label: 'Hit score', w: 64, dp: 1, group: 'The model' },
              { key: 'season_hr', label: 'HR', w: 44, dp: 0, group: 'Season' },
              { key: 'season_iso', label: 'ISO', w: 52, dp: 3, group: 'Season' },
              { key: 'last10_hr', label: 'L10 HR', w: 52, dp: 0, group: 'Form' },
              { key: 'pitcher_name', label: 'Facing', heat: false, w: 130, group: 'Tonight' },
            ]} />
        ) : <Empty title="NOT ON TONIGHT'S BOARD" note="No hitter from this club is on tonight's slate — an off day, or the lineup isn't posted yet." />}
      </section>

      {live ? <section><Kick tone={C.green}>LIVE NOW</Kick><GameLine g={live} onOpen={openGame} /></section> : null}
      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))' }}>
        <section><Kick>LAST FIVE</Kick>{last5.length ? last5.map((g) => <GameLine key={g.pk} g={g} onOpen={openGame} />) : <Empty text={data ? 'No games played yet this season.' : 'Loading…'} />}</section>
        <section><Kick>NEXT UP</Kick>{next5.length ? next5.map((g) => <GameLine key={g.pk} g={g} onOpen={openGame} />) : <Empty text={data ? 'Nothing left on the schedule.' : 'Loading…'} />}</section>
      </div>
    </div>
  )
}

function Kick({ children, tone = null }) {
  return <div style={{ font: `900 11px/1 ${NUM_FONT}`, letterSpacing: '.16em', color: tone || C.orange, margin: '0 0 8px' }}>{children}</div>
}
