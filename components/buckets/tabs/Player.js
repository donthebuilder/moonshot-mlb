'use client'
import { useMemo } from 'react'
import PageHeader from '../../PageHeader'
import TeamMark from '../../TeamMark'
import Tap from '../../Tap'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsPlayer } from '../../../lib/nba/useBuckets'
import { PLAYER_ID_RE } from '../../../lib/nba/ids'
import { NBA_MARKETS } from '../../../lib/nba/legs'
import { unpackShots } from '../../../lib/nba/shots'
import BucketsTable from '../BucketsTable'
import ShotChart from '../ShotChart'
import PlayerBars from '../PlayerBars'
import FollowButton from '../../FollowButton'
import StarMemory from '../../watch/StarMemory'
import CallStatusBadge from '../../CallStatusBadge'
import { EmptyState, DelayedBanner, Loading, SourceLine, Kicker, BackBtn, PlayerFace, SeasonTypeChip, fmtDay, gameDay, RimDot } from '../ui'

// 📄 ONE PLAYER -- MOONSHOT's player page shape: the face and the card, the
// season line beside last season's, the game log, every shot he took on the
// floor, and the board's rows on him (buckets_log: locked before tip, graded
// after). Every number is ESPN's or the log's.
const lineCols = [
  { key: 'label', label: 'Season', group: 'Season', w: 72, heat: false, sticky: true, bold: true },
  { key: 'gp', label: 'GP', group: 'Per game', w: 36, heat: false, mono: true },
  { key: 'min', label: 'MIN', group: 'Per game', w: 44, heat: false, mono: true, dp: 1 },
  { key: 'pts', label: 'PTS', group: 'Per game', w: 44, heat: false, mono: true, dp: 1, bold: true },
  { key: 'reb', label: 'REB', group: 'Per game', w: 44, heat: false, mono: true, dp: 1 },
  { key: 'ast', label: 'AST', group: 'Per game', w: 44, heat: false, mono: true, dp: 1 },
  { key: 'fga', label: 'FGA', group: 'Shooting', w: 44, heat: false, mono: true, dp: 1 },
  { key: 'tpm', label: '3PM', group: 'Shooting', w: 44, heat: false, mono: true, dp: 1 },
  { key: 'tpa', label: '3PA', group: 'Shooting', w: 44, heat: false, mono: true, dp: 1 },
  { key: 'tp', label: '3P%', group: 'Shooting', w: 48, heat: false, mono: true },
  { key: 'fta', label: 'FTA', group: 'Shooting', w: 44, heat: false, mono: true, dp: 1 },
]

export default function Player({ id, onBack, backLabel = 'Players', onOpenTeam, onOpenGame }) {
  const ok = PLAYER_ID_RE.test(String(id || ''))
  const { data, error, loading } = useBucketsPlayer(ok ? id : null)
  const shots = useMemo(() => unpackShots(data?.shots), [data])
  if (!id) return <EmptyState title="NO PLAYER PICKED" note="Open a player from Players, a board or a box score."><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  if (!ok) return <EmptyState title="NO SUCH PLAYER" note={`“${String(id).slice(0, 20)}” isn’t an NBA player id.`}><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  if (loading && !data) return <div style={{ display: 'grid', gap: 10 }}><BackBtn onBack={onBack} label={backLabel} /><Loading what="his file" /></div>
  if (!data?.card) return <div style={{ display: 'grid', gap: 10 }}><BackBtn onBack={onBack} label={backLabel} />{error && error.status !== 404 && error.status !== 400 ? <DelayedBanner error={error} what="the player feed" /> : <EmptyState title="NO SUCH PLAYER" note="The league has no NBA player with that id -- the link may be old or cut short." />}</div>

  const { card, lines } = data
  const lineRows = [[lines.curLabel, lines.cur], [lines.prevLabel, lines.prev]].filter(([, l]) => l).map(([label, l]) => ({ _id: label, label, ...l, tp: l.tpaTot ? `${((100 * l.tpTot) / l.tpaTot).toFixed(1)}%` : '—' }))
  const log = (data.log || []).map((g) => ({ ...g, _id: g.id, day: gameDay(g.date), oppTxt: `${g.atVs === '@' ? '@' : ''}${g.opp}`, res: `${g.result} ${g.score}`, fg: `${g.fgm}-${g.fga}`, tp: `${g.tpm}-${g.tpa}`, ft: `${g.ftm}-${g.fta}` }))
  const logCols = [
    { key: 'day', label: 'Date', group: 'Game', w: 84, heat: false, sticky: true, fmt: (v) => fmtDay(v) },
    { key: 'oppTxt', label: 'Opp', group: 'Game', w: 56, heat: false, mono: true, link: (r) => (onOpenTeam ? () => onOpenTeam(r.opp) : null) },
    { key: 'res', label: 'Result', group: 'Game', w: 82, heat: false, mono: true, link: (r) => (onOpenGame ? () => onOpenGame(r.id) : null) },
    { key: 'min', label: 'MIN', group: 'Line', w: 40, mono: true },
    { key: 'pts', label: 'PTS', group: 'Line', w: 40, mono: true, primary: true },
    { key: 'reb', label: 'REB', group: 'Line', w: 40, mono: true },
    { key: 'ast', label: 'AST', group: 'Line', w: 40, mono: true },
    { key: 'fg', label: 'FG', group: 'Shooting', w: 52, heat: false, mono: true },
    { key: 'tp', label: '3PT', group: 'Shooting', w: 52, heat: false, mono: true },
    { key: 'ft', label: 'FT', group: 'Shooting', w: 52, heat: false, mono: true },
    { key: 'stl', label: 'STL', group: 'Defense', w: 40, mono: true },
    { key: 'blk', label: 'BLK', group: 'Defense', w: 40, mono: true },
    { key: 'to', label: 'TO', group: 'Defense', w: 40, mono: true },
  ]
  const calls = (data.calls || []).map((r, i) => ({ ...r, _id: `${r.game_date}-${r.market}-${i}`, marketLabel: NBA_MARKETS[r.market]?.label || (r.market === 'first_fg' ? 'FIRST BASKET' : r.market === 'first_pts' ? 'FIRST POINTS' : r.market) }))
  const callCols = [
    { key: 'game_date', label: 'Date', group: 'Night', w: 84, heat: false, sticky: true, fmt: (v) => fmtDay(v) },
    { key: 'opp', label: 'Opp', group: 'Night', w: 52, heat: false, mono: true, link: (r) => (onOpenTeam && r.opp ? () => onOpenTeam(r.opp) : null) },
    { key: 'marketLabel', label: 'Market', group: 'Night', w: 100, heat: false, mono: true },
    { key: 'score', label: 'Score', group: 'Call', w: 50, mono: true, primary: true },
    { key: 'status', label: 'Status', group: 'Call', w: 120, heat: false, statusCol: true, fmt: (v, r) => <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><CallStatusBadge status={v} accent={C.purple} />{r.role ? <b style={{ fontSize: 10, color: C.purple }}>{r.role}</b> : null}</span> },
    { key: 'actual', label: 'Result', group: 'Call', w: 60, heat: false, mono: true, fmt: (v, r) => (r.void_reason ? <span style={{ fontSize: 10, color: C.text3 }}>VOID</span> : v == null ? '—' : <span style={{ color: r.hit ? C.rim : C.text2, fontWeight: 900 }}>{r.hit ? <RimDot size={6} /> : null}{r.market === 'first_fg' || r.market === 'first_pts' ? (r.hit ? 'YES' : 'NO') : v}</span>) },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <BackBtn onBack={onBack} label={backLabel} />
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <PlayerFace sport="nba" id={card.id} photo={card.headshot} name={card.name} size={72} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <PageHeader eyebrow={`BUCKETS · ${card.pos || 'PLAYER'}`} title={<>{card.jersey ? <span style={{ color: C.text3, fontWeight: 700, fontFamily: NUM_FONT }}>#{card.jersey} </span> : null}{card.name}</>} theme={C} numFont={NUM_FONT} accent={C.purple} showToday={false}
            note={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {card.team ? <Tap onClick={() => onOpenTeam?.(card.team)}><span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><TeamMark sport="nba" abbr={card.team} variant="logo" px={18} />{card.team}</span></Tap> : null}
              {[card.age ? `age ${card.age}` : null, card.height, card.weight, card.status && card.status !== 'Active' ? card.status : null].filter(Boolean).join(' · ')}
            </span>} />
          {/* Watch, as on the other three products' files (lib/dash/follow.js takes nba) */}
          <div style={{ marginTop: 8, display: 'grid', gap: 6, justifyItems: 'start' }}><FollowButton sport="nba" id={String(card.id)} name={card.name} team={card.team} position={card.pos} compact /><StarMemory sport="nba" id={String(card.id)} /></div>
        </div>
      </div>
      <DelayedBanner error={error} what="the player feed" />
      {lineRows.length > 0
        ? <section><Kicker>SEASON LINES</Kicker><BucketsTable rows={lineRows} columns={lineCols} heatMode="none" maxHeight={9999} maxRows={2} caption="Per game, this season beside last season." /></section>
        : <EmptyState title="NO NBA LINES ON FILE" note="No regular-season games this season or last." />}
      <PlayerBars log={data.log || []} logSeason={data.logSeason} nextGame={data.nextGame} onOpenTeam={onOpenTeam} />
      {shots.length > 0 && (
        <section>
          <Kicker>EVERY SHOT ON FILE · {shots.length} ATTEMPTS{data.shotsFrom ? ` SINCE ${fmtDay(data.shotsFrom).toUpperCase()}` : ''}</Kicker>
          <ShotChart shots={shots} filters={['result', 'type']} title={`${card.name}, every field-goal attempt on file`}
            source="Every field-goal attempt on file for him, from ESPN play-by-play; free throws and end-of-quarter heaves left out." />
        </section>
      )}
      {log.length > 0 && (
        <section>
          <Kicker>GAME LOG · {data.logSeason}</Kicker>
          <BucketsTable rows={log} columns={logCols} onRowClick={(r) => onOpenGame?.((r?._raw ?? r).id)} heatMode="sorted" maxHeight={420} maxRows={log.length}
            caption={`${data.logSeason}, newest first. Each row opens the game.`} />
          {[...new Set(log.map((g) => g.seasonType))].filter((t) => t !== 2).map((t) => <SeasonTypeChip key={t} type={t} />)}
        </section>
      )}
      <section>
        <Kicker>THE BOARD ON HIM</Kicker>
        {calls.length
          ? <BucketsTable rows={calls} columns={callCols} statusOf={(r) => r.status} heatMode="none" maxHeight={420} maxRows={calls.length} caption="Every locked board row on him, newest first." />
          : <p style={{ margin: 0, fontSize: 12, color: C.text3 }}>No locked board rows on him yet. They start with the first night his game locks.</p>}
      </section>
      <SourceLine>Source: ESPN athlete, game log and league stats; shots from the play-by-play; board rows from buckets_log (/api/buckets/player).</SourceLine>
    </div>
  )
}
