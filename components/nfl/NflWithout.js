'use client'
// 🏈 TUDDY WITHOUT (2026-10-31): his line in the games a teammate did not play. BUCKETS' and LAMP's Without, run on TUDDY's own logs
// (lib/nfl/without.js; the same lib/nba/without.js functions pick the men and cut his games). No fetch: the game logs the card already holds.
// Teammates as chips (whoever the injury report has OUT first, then most yards a game); two picked = both out. A table of his line with / without
// / change, and a scan of every teammate. A side under THIN_G games says so.
import { useMemo, useState } from 'react'
import NflTable from './NflTable'
import ScrollHint from '../player/ScrollHint'
import { usePreview, ShowMoreButton } from '../ListPreview'
import { flatChip, FLAT_CHIP_CLASS } from '../../lib/chips'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { THIN_G } from '../../lib/nfl/gameSplits'
import { nflMates, gameKey, aggregateWithGp } from '../../lib/nfl/without'
import { withoutLines, withoutScan, rankMates } from '../../lib/nba/without'
import { useInjuryLayer } from '../injuries/InjuryLayer'
import { BLOCKS } from '../../lib/injuries/statuses'
import { findEntry } from '../../lib/injuries/lookup'

const STATS = [
  { key: 'tdPerG', group: 'Touchdowns', label: 'TD/G', dp: 2 },
  { key: 'tdPct', group: 'Touchdowns', label: 'TD%', dp: 0, title: 'Share of these games with a touchdown' },
  { key: 'rec', group: 'Per game', label: 'REC', dp: 1 },
  { key: 'recyd', group: 'Per game', label: 'REC YD', w: 58, dp: 1 },
  { key: 'car', group: 'Per game', label: 'CAR', dp: 1 },
  { key: 'ruyd', group: 'Per game', label: 'RU YD', w: 54, dp: 1 },
  { key: 'payd', group: 'Per game', label: 'PA YD', w: 56, dp: 0 },
]
const sgn = (v, d = 1) => (v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(d)}`)
const diff = (a, b, k) => (a[k] != null && b[k] != null ? b[k] - a[k] : (a[k] == null && b[k] != null) || (b[k] == null && a[k] != null) ? (b[k] || 0) - (a[k] || 0) : null)

/** log: his rows for the season window on screen (each with s, w). logs: the whole file. names: { id: name } from the week file. */
export default function NflWithout({ log, logs, names, playerId, accent = C.green }) {
  const [pick, setPick] = useState(null)
  const layer = useInjuryLayer()
  const games = useMemo(() => (log || []).map((r) => ({ ...r, id: gameKey(r) })), [log])
  const mates = useMemo(() => nflMates(logs, names, playerId), [logs, names, playerId])
  const list = useMemo(() => rankMates(mates, new Set(games.map((g) => g.id)), (m) => {
    const e = layer?.index ? findEntry(layer.index, { player_id: m.id, name: m.name, team: m.team }) : null
    return e && BLOCKS.has(e.status)
  }), [mates, games, layer])
  const chosen = pick || (list[0] ? [list[0].id] : [])
  const picked = chosen.map((id) => list.find((m) => m.id === id)).filter(Boolean)
  const toggle = (id) => setPick(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id].slice(-2))
  const names2 = picked.map((m) => m.label).join(' + ')
  const lines = withoutLines(games, picked, aggregateWithGp)
  const used = useMemo(() => STATS.filter((c) => games.some((g) => (c.key === 'tdPerG' || c.key === 'tdPct') || Number(g[{ rec: 'g_rec', recyd: 'g_recyd', car: 'g_car', ruyd: 'g_ruyd', payd: 'g_payd' }[c.key]]) > 0)), [games])
  const pairCols = [
    { key: 'split', label: 'Split', group: 'Without', w: 150, heat: false, bold: true, sticky: true },
    { key: 'g', label: 'G', group: 'Games', w: 34, heat: false, dp: 0 },
    { key: 'td', label: 'TD', group: 'Touchdowns', w: 36, dp: 0 },
    ...used.map((c) => ({ ...c, w: c.w || 46 })),
  ]
  const pairRows = lines && lines.without.gp && lines.with.gp ? [
    { _key: 'w', ...lines.with, split: `With ${names2}`, _dim: lines.with.g < 3 },
    { _key: 'o', ...lines.without, split: `Without ${names2}`, _dim: lines.without.g < 3 },
    { _key: 'd', split: 'Change', g: null, td: null, ...Object.fromEntries(used.map((c) => [c.key, diff(lines.with, lines.without, c.key)])), _delta: true },
  ] : null
  const deltaCols = pairCols.map((c) => (['split', 'g', 'td'].includes(c.key) ? c : { ...c, fmt: (v, r) => (r._delta ? sgn(v, c.key === 'tdPerG' ? 2 : c.key === 'tdPct' || c.key === 'payd' ? 0 : 1) : (v == null ? '—' : Number(v).toFixed(c.dp ?? 0))) }))
  const scan = useMemo(() => withoutScan(games, list, { agg: aggregateWithGp }).map(({ m, with: w, without: o }) => ({
    _key: m.id, _raw: m, who: m.label, g: o.g, thin: o.g < THIN_G, tdW: w.tdPerG, tdO: o.tdPerG, tdChg: diff(w, o, 'tdPerG'),
    rec: diff(w, o, 'rec'), recyd: diff(w, o, 'recyd'), car: diff(w, o, 'car'), ruyd: diff(w, o, 'ruyd'),
  })).sort((a, b) => (a.thin - b.thin) || ((b.tdChg ?? -9) - (a.tdChg ?? -9))), [games, list])
  const pv = usePreview(scan, 5)
  const f2 = (v) => (v == null ? '—' : Number(v).toFixed(2))
  const scanCols = [
    { key: 'who', label: 'Teammate out', group: 'Teammate', heat: false, w: 118, bold: true, sticky: true, numeric: false, link: (m) => () => setPick([m._raw.id]) },
    { key: 'g', label: 'G', group: 'Sample', heat: false, w: 34, dp: 0, title: 'His games while this teammate did not play.' },
    { key: 'thin', label: '', group: 'Sample', heat: false, numeric: false, w: 44, fmt: (v) => (v ? <span style={{ color: C.yellow || C.text2, font: `900 10px/1 ${NUM_FONT}`, letterSpacing: '.06em' }}>THIN</span> : ''), title: `THIN: under ${THIN_G} games.` },
    { key: 'tdW', label: 'WITH', group: 'TD/G', w: 46, fmt: f2, heat: false },
    { key: 'tdO', label: 'W/O', group: 'TD/G', w: 46, fmt: f2, bold: true },
    { key: 'tdChg', label: 'CHG', group: 'TD/G', w: 46, fmt: (v) => sgn(v, 2) },
    ...[['rec', 'REC'], ['recyd', 'REC YD'], ['car', 'CAR'], ['ruyd', 'RU YD']].filter(([k]) => used.some((c) => c.key === k)).map(([k, l]) => ({ key: k, label: l, group: 'Change', w: k.endsWith('yd') ? 54 : 46, fmt: (v) => sgn(v) })),
  ]
  if (!list.length) return <div style={{ fontSize: 12, color: C.text3 }}>No teammate in the log missed one of his games in this window.</div>
  return (
    <div style={{ minWidth: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      <div role="group" aria-label="Teammate out" className="chip-row" style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '0 -2px', padding: '0 2px', WebkitOverflowScrolling: 'touch' }}>
        {list.map((m) => {
          const on = chosen.includes(m.id)
          return (
            <button key={m.id} type="button" aria-pressed={on} onClick={() => toggle(m.id)} title={m.tonight ? `${m.name}: out` : m.name} className={FLAT_CHIP_CLASS} style={{ ...flatChip(on, accent, C, NUM_FONT), flexShrink: 0 }}>
              {m.label}{m.tonight ? <span style={{ font: `900 9px/1 ${NUM_FONT}`, color: C.bg, background: on ? accent : C.text2, borderRadius: 999, padding: '2px 5px' }}>OUT</span> : null}
            </button>
          )
        })}
      </div>
      {!picked.length ? <div style={{ fontSize: 12, color: C.text3 }}>Pick a teammate. Two = both out.</div>
        : !pairRows ? <div style={{ fontSize: 12, color: C.text3 }}>No games with {names2} {picked.length > 1 ? 'both ' : ''}out and in in this window.</div>
        : (
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.text }}>Without {names2}</span>
              <span style={{ fontSize: 12, color: C.text3, fontFamily: NUM_FONT }}>{lines.without.gp} game{lines.without.gp === 1 ? '' : 's'}{lines.without.gp < THIN_G ? ` · under ${THIN_G}, a curiosity` : ''}</span>
            </div>
            <ScrollHint><NflTable rows={pairRows} columns={deltaCols} heatMode="none" maxRows={3} maxHeight={9999} dimRow={(r) => r._dim} /></ScrollHint>
          </div>
        )}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: C.text }}>Without each teammate</span>
          <span style={{ fontSize: 12, color: C.text3, fontFamily: NUM_FONT }}>{scan.length} men</span>
        </div>
        <ScrollHint><NflTable rows={pv.shown} columns={scanCols} heatMode="standouts" maxRows={200} maxHeight={9999} /></ScrollHint>
        <ShowMoreButton open={pv.open} restN={pv.restN} toggle={pv.toggle} total={pv.total} itemWord="teammates" />
      </div>
      <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.5 }}>Out = his club played, the teammate has no logged game that week, while on the club.</div>
    </div>
  )
}
