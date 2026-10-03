'use client'
import { useMemo } from 'react'
import PageHeader from '../../PageHeader'
import CallStatusBadge from '../../CallStatusBadge'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsBoard } from '../../../lib/nba/useBuckets'
import { NBA_MARKETS } from '../../../lib/nba/legs'
import BucketsTable from '../BucketsTable'
import { faceOf } from '../boardTable'
import { EmptyState, DelayedBanner, Loading, SourceLine, DayPager, fmtDay, fmtTip } from '../ui'

// 📋 BOARDS -- every player the model rated that night, every market side by
// side (MOONSHOT's fullboard, LAMP's Rankings). One row a player; each market
// is its score with its status word under it. Ordered by the points score,
// the headline market; every column sorts. The six reads are the same
// /api/buckets/board the Props page makes (cached at the server, 5 min).
const KEYS = Object.keys(NBA_MARKETS)

export default function FullBoard({ date, setDate, onOpenPlayer, onOpenTeam, onOpenGame }) {
  const pts = useBucketsBoard(date, 'pts'), reb = useBucketsBoard(date, 'reb'), ast = useBucketsBoard(date, 'ast')
  const tpm = useBucketsBoard(date, '3pm'), pra = useBucketsBoard(date, 'pra'), first = useBucketsBoard(date, 'first')
  const boards = { pts, reb, ast, '3pm': tpm, pra, first }
  const data = pts.data
  const shown = data?.date || date
  const games = data?.games || []
  const rows = useMemo(() => {
    const by = new Map()
    const gm = new Map(games.map((g) => [g.id, g]))
    for (const k of KEYS) {
      for (const r of boards[k].data?.rows || []) {
        const id = `${r.gameId}-${r.playerId}`
        const g = gm.get(r.gameId)
        const row = by.get(id) || { _id: id, playerId: r.playerId, name: r.name, pos: r.pos, team: r.team, opp: r.opp, oppTxt: r.home ? r.opp : `@${r.opp}`, gameId: r.gameId, tip: g?.start || null, gameState: g?.state || null }
        row[`s_${k}`] = r.score
        row[`st_${k}`] = r.status
        by.set(id, row)
      }
    }
    return [...by.values()].filter((r) => KEYS.some((k) => r[`s_${k}`] != null))
  }, [games, pts.data, reb.data, ast.data, tpm.data, pra.data, first.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const calledN = rows.reduce((n, r) => n + KEYS.filter((k) => r[`st_${k}`] === 'called').length, 0)
  const columns = [
    { key: 'name', label: 'Player', group: 'Player', w: 150, heat: false, bold: true, sticky: true },
    { key: 'pos', label: 'Pos', group: 'Player', w: 36, heat: false, mono: true, dim: true },
    { key: 'team', label: 'Tm', group: 'Player', w: 52, heat: false, mono: true, teamMark: 'nba', link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
    { key: 'oppTxt', label: 'Opp', group: 'Player', w: 52, heat: false, mono: true, dim: true, link: (r) => (onOpenTeam ? () => onOpenTeam(r.opp) : null) },
    ...KEYS.map((k, i) => ({ key: `s_${k}`, label: NBA_MARKETS[k].label.replace(' BASKET', ''), group: 'Markets (score · status)', w: 74, dp: 0, primary: i === 0, scale: 'seq', domain: [0, 100],
      title: `${NBA_MARKETS[k].label}: the 0-100 score and its status word`,
      fmt: (v, r) => (v == null ? <span style={{ color: C.text3 }}>—</span> : <span style={{ display: 'inline-grid', lineHeight: 1.15 }}><b>{v}</b>{r[`st_${k}`] && r[`st_${k}`] !== 'off' ? <CallStatusBadge status={r[`st_${k}`]} accent={C.purple} short size={8} /> : null}</span>) })),
    { key: 'tip', label: 'Game', group: 'Game', w: 84, heat: false, mono: true, dim: true, link: (r) => (onOpenGame ? () => onOpenGame(r.gameId) : null),
      fmt: (v, r) => (r.gameState === 'live' ? 'LIVE' : r.gameState === 'final' ? 'FINAL' : v ? fmtTip(v) : '—') },
  ]
  const loading = KEYS.some((k) => boards[k].loading) && !data
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow="BUCKETS · BOARDS" title={shown ? fmtDay(shown) : 'Tonight'} theme={C} numFont={NUM_FONT} accent={C.purple}
        note="Every player the model rated that day, every market side by side. CALLED is one per team in a game, per market; a PREVIEW is not a call until its game locks."
        stats={data ? [{ value: rows.length, label: 'PLAYERS', tone: C.text2 }, { value: calledN, label: 'CALLS', tone: C.purple }, { value: games.length, label: 'GAMES', tone: C.text2 }] : null} />
      <DayPager shown={shown} date={date} setDate={setDate} />
      <DelayedBanner error={pts.error} what="the board" />
      {loading ? <Loading what="every market’s board" /> : null}
      {data && !games.length && <EmptyState title="NO GAMES THAT DAY" note="Nothing to rank. Page a day." />}
      {rows.length > 0 && (
        <BucketsTable rows={rows} columns={columns} onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).playerId)} faceOf={faceOf}
          initialSort={{ key: 's_pts', dir: 'desc' }} heatMode="sorted" maxHeight={620} maxRows={Math.max(rows.length, 1)}
          caption="Every rated player, every market. Column headers sort; each row opens that player; the team and opponent open the club." />
      )}
      <SourceLine>The six boards of /api/buckets/board (lib/nba/model.js, one version per market). First basket scores starters only, once the pre-tip box score lists them.</SourceLine>
    </div>
  )
}
