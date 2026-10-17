'use client'
import { useMemo } from 'react'
import PageHeader from '../../PageHeader'
import CallStatusBadge from '../../CallStatusBadge'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsBoard, useBucketsExpected } from '../../../lib/nba/useBuckets'
import { NBA_MARKETS, LEG_LABEL, fmtLeg, RAW_OF } from '../../../lib/nba/legs'
import BucketsTable from '../BucketsTable'
import { faceOf, XPTS_TITLE } from '../boardTable'
import { EmptyState, DelayedBanner, Loading, DayPager, Why, fmtDay, fmtTip } from '../ui'

// 📋 BOARDS -- every player the model rated that night, every market side by
// side (MOONSHOT's fullboard, LAMP's Rankings). One row a player; each market
// is its score with its status word under it. Ordered by the points score,
// the headline market; every column sorts. The six reads are the same
// /api/buckets/board the Props page makes (cached at the server, 5 min).
const KEYS = Object.keys(NBA_MARKETS)
// THE FULL SET (2026-10-13): every number the per-market boards (boardTable.js boardColumns) show as legs, side by side here too: each market's
// legs (his own measured rates, never the adjusted score inputs), the opponent multipliers, once, in market order. A column shows only when a
// row on the page carries it (nothing is filled in), and they ride in All only: Short list and What I read keep the narrow table. MOONSHOT's
// withBoardColumns is the hitter board; a basketball row's own list is these legs, as TUDDY's is lib/nfl/boardColumns.js.
const LEG_KEYS = (() => {
  const out = []
  for (const k of KEYS) {
    for (const l of NBA_MARKETS[k].legs) { const key = RAW_OF[l] || l; if (!out.includes(key)) out.push(key) }
    if (NBA_MARKETS[k].needsLog) { const m = k === 'td' ? 'multTd' : 'multDd'; if (!out.includes(m)) out.push(m) }
  }
  return out
})()

// `embedded`: drawn inside the Rankings page (Board.js, the ALL MARKETS pill), which owns the header and the day.
// `keep`: the Rankings page's search / team / game filters, as a predicate on a row
export default function FullBoard({ date, setDate, onOpenPlayer, onOpenTeam, onOpenGame, embedded = false, keep = null, empty = null }) {
  const pts = useBucketsBoard(date, 'pts'), reb = useBucketsBoard(date, 'reb'), ast = useBucketsBoard(date, 'ast')
  const tpm = useBucketsBoard(date, '3pm'), pra = useBucketsBoard(date, 'pra'), first = useBucketsBoard(date, 'first')
  const dd = useBucketsBoard(date, 'dd'), td = useBucketsBoard(date, 'td')
  const boards = { pts, reb, ast, '3pm': tpm, pra, dd, td, first }
  const xp = useBucketsExpected(date)
  const xptsBy = useMemo(() => new Map((xp.data?.rows || []).map((r) => [String(r.playerId), r])), [xp.data])
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
        const row = by.get(id) || { _id: id, playerId: r.playerId, name: r.name, pos: r.pos, team: r.team, opp: r.opp, oppTxt: r.home ? r.opp : `@${r.opp}`, gameId: r.gameId, tip: g?.start || null, gameState: g?.state || null, xpts: xptsBy.get(String(r.playerId))?.xpts ?? null, xptsLine: xptsBy.get(String(r.playerId))?.line ?? null }
        row[`s_${k}`] = r.score
        for (const [lk, lv] of Object.entries(r.legs || {})) if (lv != null && row[lk] == null) row[lk] = lv
        row[`st_${k}`] = r.status
        by.set(id, row)
      }
    }
    return [...by.values()].filter((r) => KEYS.some((k) => r[`s_${k}`] != null) && (!keep || keep(r)))
  }, [games, xptsBy, keep, pts.data, reb.data, ast.data, tpm.data, pra.data, dd.data, td.data, first.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const calledN = rows.reduce((n, r) => n + KEYS.filter((k) => r[`st_${k}`] === 'called').length, 0)
  const columns = [
    { key: 'name', label: 'Player', group: 'Player', w: 150, heat: false, bold: true, sticky: true },
    { key: 'pos', label: 'Pos', group: 'Player', w: 36, heat: false, mono: true, dim: true },
    { key: 'team', label: 'Tm', group: 'Player', w: 52, heat: false, mono: true, teamMark: 'nba', link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
    { key: 'oppTxt', label: 'Opp', group: 'Player', w: 52, heat: false, mono: true, dim: true, subOnly: true, link: (r) => (onOpenTeam ? () => onOpenTeam(r.opp) : null) },
    ...KEYS.map((k, i) => ({ key: `s_${k}`, label: NBA_MARKETS[k].label.replace(' BASKET', ''), cset: i < 3 ? 'lean' : 'read', group: 'Markets (score · status)', w: 74, dp: 0, primary: i === 0, scale: 'seq', domain: [0, 100],
      title: `${NBA_MARKETS[k].label}: the 0-100 score and its status word`,
      fmt: (v, r) => (v == null ? <span style={{ color: C.text3 }}>—</span> : <span style={{ display: 'inline-grid', lineHeight: 1.15 }}><b>{v}</b>{r[`st_${k}`] && r[`st_${k}`] !== 'off' ? <CallStatusBadge status={r[`st_${k}`]} accent={C.purple} short size={8} /> : null}</span>) })),
    { key: 'xpts', label: 'xPTS', cset: 'read', group: 'Projected', w: 58, dp: 1, mono: true, title: XPTS_TITLE, fmt: (v, r) => (v == null ? <span style={{ color: C.text3 }}>—</span> : <span title={r.xptsLine || XPTS_TITLE}>{Number(v).toFixed(1)}</span>) },
    ...LEG_KEYS.filter((k) => rows.some((r) => r[k] != null)).map((k) => ({ key: k, label: LEG_LABEL[k] || (k === 'multTd' || k === 'multDd' ? 'OPP ×' : k), group: 'Legs', w: 62, heat: false, mono: true,
      title: k === 'multTd' || k === 'multDd' ? 'What his opponent allows of the stats he reaches, against the league mean, shrunk for a small sample and clamped to 0.8-1.25. It scales his own rate for the ranking; 1.00 = no change.' : `${LEG_LABEL[k] || k}: his own measured rate, one of the legs the ${KEYS.filter((m) => NBA_MARKETS[m].legs.some((l) => (RAW_OF[l] || l) === k)).map((m) => NBA_MARKETS[m].label.toLowerCase()).join(' / ')} score is built from.`,
      fmt: (v) => (k === 'multTd' || k === 'multDd' ? (v == null ? '—' : Number(v).toFixed(2)) : fmtLeg(k, v)) })),
    { key: 'tip', label: 'Game', cset: 'read', group: 'Game', w: 84, heat: false, mono: true, dim: true, link: (r) => (onOpenGame ? () => onOpenGame(r.gameId) : null),
      fmt: (v, r) => (r.gameState === 'live' ? 'LIVE' : r.gameState === 'final' ? 'FINAL' : v ? fmtTip(v) : '—') },
  ]
  const loading = KEYS.some((k) => boards[k].loading) && !data
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!embedded && <PageHeader eyebrow="BUCKETS · RANKINGS" title={shown ? fmtDay(shown) : 'Tonight'} theme={C} numFont={NUM_FONT} accent={C.purple}
        note={<>Every player tonight, every market side by side. <Why label="Rankings" text="Every player rated that day, every market side by side. CALLED is one per team in a game, per market. A PREVIEW is not a call until its game locks." /></>}
        stats={data ? [{ value: rows.length, label: 'PLAYERS', tone: C.text2 }, { value: calledN, label: 'CALLS', tone: C.purple }, { value: games.length, label: 'GAMES', tone: C.text2 }] : null} />}
      {!embedded && <DayPager shown={shown} date={date} setDate={setDate} />}
      <DelayedBanner error={pts.error} what="the board" />
      {loading ? <Loading what="every market’s board" /> : null}
      {data && !games.length && <EmptyState title="NO GAMES THAT DAY" note="Nothing to rank. Try another day." />}
      {rows.length === 0 && !loading && games.length > 0 && empty}
      {rows.length > 0 && (
        <BucketsTable sets rows={rows} columns={columns} onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).playerId)} nameCell="player" faceOf={faceOf}
          initialSort={{ key: 's_pts', dir: 'desc' }} heatMode="sorted" maxHeight={620} maxRows={Math.max(rows.length, 1)}
          caption="Every rated player, every market. Column headers sort; each row opens that player; the team and opponent open the club." />
      )}
    </div>
  )
}
