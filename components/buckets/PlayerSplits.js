'use client'
import { useEffect, useMemo, useState } from 'react'
import BucketsTable from './BucketsTable'
import Tap from '../Tap'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { flatChip, FLAT_CHIP_CLASS } from '../../lib/chips'
import { usePreview, ShowMoreButton } from '../ListPreview'
import { Kicker, EmptyState } from './ui'
import { SPLIT_GROUPS, THIN_GP, splitRows, recentRows, filterGames, aggregate } from '../../lib/nba/splits'
import { withoutLines, withoutScan } from '../../lib/nba/without'
import { useInjuryLayer } from '../injuries/InjuryLayer'
import { BLOCKS } from '../../lib/injuries/statuses'
import { findEntry } from '../../lib/injuries/lookup'

// 🏀 BUCKETS PLAYER SPLITS -- LAMP's components/lamp/PlayerSplits.js (itself MOONSHOT's PlayerSplits) for a
// basketball player: one split on screen under a pill row, a GP column with a THIN flag on every row, an AND-combo
// filter over the game-level facts, and the caveat that nothing is adjusted. The rows come from the page's own
// game log (lib/nba/splits.js, pure, checked by scripts/check-nba-splits.mjs): no extra request.
// WHAT CAN'T BE ANSWERED IS SAID: ESPN's game log does not say who started, so there is no starter/bench split.
// WITH OR WITHOUT A TEAMMATE comes from buckets_box instead (Without below, lib/nba/without.js, /api/buckets/without).

const f1 = (v) => (v == null ? '—' : Number(v).toFixed(1))
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const COLS = [
  { key: 'split', label: 'Split', group: 'Split', heat: false, w: 118, bold: true, sticky: true, numeric: false },
  { key: 'gp', label: 'GP', group: 'Sample', heat: false, w: 38, title: 'Games in this row. Read this before any rate on the row.' },
  { key: 'thin', label: '', group: 'Sample', heat: false, numeric: false, w: 44, title: `THIN: under ${THIN_GP} games. A rate on this few games moves a lot on one night.`,
    fmt: (v) => (v ? <span style={{ color: C.text3, font: `900 10px/1 ${NUM_FONT}`, letterSpacing: '.06em' }}>THIN</span> : '') },
  { key: 'min', label: 'MIN', group: 'Per game', w: 44, fmt: f1 },
  { key: 'pts', label: 'PTS', group: 'Per game', w: 44, fmt: f1, bold: true },
  { key: 'reb', label: 'REB', group: 'Per game', w: 44, fmt: f1 },
  { key: 'ast', label: 'AST', group: 'Per game', w: 44, fmt: f1 },
  { key: 'stl', label: 'STL', group: 'Per game', w: 44, fmt: f1 },
  { key: 'blk', label: 'BLK', group: 'Per game', w: 44, fmt: f1 },
  { key: 'to', label: 'TO', group: 'Per game', w: 40, fmt: f1, invert: true },
  { key: 'fga', label: 'FGA', group: 'Shooting', w: 44, fmt: f1 },
  { key: 'fgPct', label: 'FG%', group: 'Shooting', w: 52, fmt: pct },
  { key: 'tpm', label: '3PM', group: 'Shooting', w: 44, fmt: f1 },
  { key: 'tpPct', label: '3P%', group: 'Shooting', w: 52, fmt: pct },
  { key: 'fta', label: 'FTA', group: 'Shooting', w: 44, fmt: f1 },
  { key: 'ptsPer36', label: 'PTS/36', group: 'Rates', w: 54, fmt: f1, title: 'Points per 36 minutes: his scoring rate per minute on the floor.' },
]

function Section({ id, title, meta, rows, columns, caption, preview = 6, itemWord = 'rows' }) {
  const pv = usePreview(rows, preview)
  return (
    <div id={`bsplit-${id}`} style={{ scrollMarginTop: 60, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: C.text }}>{title}</span>
        {meta && <span style={{ fontSize: 12, color: C.text3, fontFamily: NUM_FONT }}>{meta}</span>}
      </div>
      <BucketsTable rows={pv.shown} columns={columns} maxHeight={9999} maxRows={200} heatMode="standouts" initialSort={null} caption={caption} />
      <ShowMoreButton open={pv.open} restN={pv.restN} toggle={pv.toggle} total={pv.total} itemWord={itemWord} />
    </div>
  )
}

function Sel({ value, onChange, options, placeholder, label }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
      style={{ minHeight: 44, fontSize: 13, fontWeight: 700, padding: '0 10px', borderRadius: 8, maxWidth: '100%', background: C.bg2, border: `1px solid ${value ? C.purple : C.border}`, color: value ? C.text : C.text3, cursor: 'pointer' }}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  )
}

const EMPTY = { ha: '', result: '', rest: '', mins: '', opp: '' }
function Combo({ games }) {
  const [f, setF] = useState(EMPTY)
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }))
  const anyOn = Object.values(f).some(Boolean)
  const line = useMemo(() => {
    if (!anyOn) return null
    const m = filterGames(games, f)
    return m.length ? { ...aggregate(m), _key: 'combo', split: 'Your filter' } : { gp: 0 }
  }, [games, f, anyOn])
  const opps = useMemo(() => [...new Set(games.map((x) => x.opp).filter(Boolean))].sort(), [games])
  const hasRest = games.some((x) => x.rest !== undefined)
  return (
    <div id="bsplit-combo" style={{ scrollMarginTop: 60, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: C.text }}>Combine filters</span>
        <span style={{ fontSize: 12, color: C.text3, fontFamily: NUM_FONT }}>home/away + result + rest + minutes + opponent, all at once</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <Sel label="Home or away" value={f.ha} onChange={set('ha')} placeholder="Home/Away" options={[{ v: 'home', label: 'Home' }, { v: 'away', label: 'Away' }]} />
        <Sel label="Win or loss" value={f.result} onChange={set('result')} placeholder="Win/Loss" options={[{ v: 'W', label: 'Win' }, { v: 'L', label: 'Loss' }]} />
        {hasRest && <Sel label="Rest days" value={f.rest} onChange={set('rest')} placeholder="Any rest" options={[{ v: '0', label: 'Back-to-back' }, { v: '1', label: '1 day rest' }, { v: '2+', label: '2+ days rest' }]} />}
        <Sel label="Minutes played" value={f.mins} onChange={set('mins')} placeholder="Any minutes" options={[{ v: 'u20', label: 'Under 20 min' }, { v: '20', label: '20-29 min' }, { v: '30', label: '30-35 min' }, { v: '36', label: '36+ min' }]} />
        <Sel label="Opponent" value={f.opp} onChange={set('opp')} placeholder="Any opponent" options={opps.map((o) => ({ v: o, label: o }))} />
        {anyOn && <button type="button" onClick={() => setF(EMPTY)} style={{ minHeight: 44, padding: '0 10px', fontSize: 12, fontWeight: 700, color: C.text2, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>clear</button>}
      </div>
      {!anyOn ? (
        <div style={{ fontSize: 12, color: C.text3, padding: '2px 0' }}>Pick at least one filter to see a combined line. Mix as many as you want.</div>
      ) : line.gp === 0 ? (
        <div style={{ fontSize: 12, color: C.text3, padding: '2px 0' }}>No games matched that combination in this window.</div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: line.thin ? C.text2 : C.text3, fontFamily: NUM_FONT, marginBottom: 4 }}>
            {line.gp} game{line.gp === 1 ? '' : 's'}{line.thin ? ` · under ${THIN_GP}, read it as a curiosity, not a signal` : ''}
          </div>
          <BucketsTable rows={[line]} columns={COLS} maxHeight={9999} heatMode="none" initialSort={null} />
        </>
      )}
    </div>
  )
}

const sgn = (v) => (v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`)
const sgnPct = (v) => (v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}`)
const lastName = (n) => String(n || '').replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i, '').split(' ').slice(-1)[0]
const NOT_STATS = ['split', 'gp', 'thin']
// THE CHANGE ROW: the same columns, each cell = without minus with (a % in points of %).
const DELTA_COLS = COLS.map((c) => (NOT_STATS.includes(c.key) ? c : { ...c, fmt: (v, r) => (r._delta ? (c.key.endsWith('Pct') ? sgnPct(v) : sgn(v)) : c.fmt(v, r)) }))
const deltaOf = (a, b) => Object.fromEntries(COLS.filter((c) => !NOT_STATS.includes(c.key)).map((c) => [c.key, a[c.key] != null && b[c.key] != null ? b[c.key] - a[c.key] : null]))

// THE SCAN: every teammate, his points with and without that man, and how his minutes / boards / assists / threes / shots move.
const SCAN_COLS = [
  { key: 'who', label: 'Teammate out', group: 'Teammate', heat: false, w: 118, bold: true, sticky: true, numeric: false },
  { key: 'gp', label: 'GP', group: 'Sample', heat: false, w: 38, title: 'His games while this teammate was out.' },
  COLS.find((c) => c.key === 'thin'),
  { key: 'ptsW', label: 'WITH', group: 'Points', w: 46, fmt: f1, heat: false },
  { key: 'ptsO', label: 'W/O', group: 'Points', w: 46, fmt: f1, bold: true },
  { key: 'pts', label: 'CHG', group: 'Points', w: 46, fmt: sgn },
  ...['min', 'reb', 'ast', 'tpm', 'fga'].map((k) => ({ key: k, label: COLS.find((c) => c.key === k).label, group: 'Change', w: 44, fmt: sgn })),
]

// WITHOUT (2026-10-24): his line in the games a teammate missed. Teammates as chips (whoever the injury report has OUT tonight
// first, then most points a game); two picked = both out. The pair table carries the full split columns + a change row.
function Without({ games, playerId }) {
  const [mates, setMates] = useState(null)
  const [pick, setPick] = useState(null)
  const layer = useInjuryLayer()
  useEffect(() => {
    let live = true
    setMates(null)
    fetch(`/api/buckets/without?pid=${encodeURIComponent(playerId)}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live) setMates(j?.mates || []) }).catch(() => { if (live) setMates([]) })
    return () => { live = false }
  }, [playerId])
  const ids = useMemo(() => new Set(games.map((g) => g.id)), [games])
  const list = useMemo(() => (mates || [])
    .map((m) => ({ ...m, on: m.on.filter((x) => ids.has(x)), out: m.out.filter((x) => ids.has(x)) }))
    .filter((m) => m.on.length && m.out.length)
    // by ESPN id only: a name match would mark Seth Curry out when Stephen is
    .map((m) => { const e = layer?.index ? findEntry(layer.index, { player_id: m.id }) : null; return { ...m, tonight: Boolean(e && BLOCKS.has(e.status)) } })
    .sort((a, b) => (b.tonight - a.tonight) || (b.ppg - a.ppg)), [mates, ids, layer])
  // two men with one last name read "S. Curry"
  const label = useMemo(() => {
    const n = {}; for (const m of list) n[lastName(m.name)] = (n[lastName(m.name)] || 0) + 1
    return (m) => (n[lastName(m.name)] > 1 ? `${m.name[0]}. ${lastName(m.name)}` : lastName(m.name))
  }, [list])
  const chosen = pick || (list[0] ? [list[0].id] : [])
  const picked = chosen.map((id) => list.find((m) => m.id === id)).filter(Boolean)
  const toggle = (id) => setPick(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id].slice(-2))
  const names = picked.map(label).join(' + ')
  const lines = withoutLines(games, picked)
  const pairRows = lines && lines.without.gp && lines.with.gp ? [
    { _key: 'w', split: `With ${names}`, ...lines.with },
    { _key: 'o', split: `Without ${names}`, ...lines.without },
    { _key: 'd', _delta: true, split: 'Change', ...deltaOf(lines.with, lines.without), gp: null, thin: false },
  ] : null
  const scan = useMemo(() => withoutScan(games, list).map(({ m, with: w, without: o }) => ({
    _key: m.id, _raw: m, who: label(m), gp: o.gp, thin: o.gp < THIN_GP, ptsW: w.pts, ptsO: o.pts, ...deltaOf(w, o),
  })).sort((a, b) => (a.thin - b.thin) || (b.pts - a.pts)), [games, list, label])
  const pv = usePreview(scan, 5)
  if (mates == null) return <div style={{ fontSize: 12, color: C.text3 }}>Reading his teammates…</div>
  if (!list.length) return <EmptyState title="NO TEAMMATE MISSED A GAME" note="Nobody on his club missed one of his games in this window." />
  return (
    <div id="bsplit-without" style={{ scrollMarginTop: 60, minWidth: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      <div role="group" aria-label="Teammate out" className="chip-row" style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '0 -2px', padding: '0 2px', WebkitOverflowScrolling: 'touch' }}>
        {list.map((m) => {
          const on = chosen.includes(m.id)
          return (
            <button key={m.id} type="button" aria-pressed={on} onClick={() => toggle(m.id)} title={m.tonight ? `${m.name}: out tonight` : m.name} className={FLAT_CHIP_CLASS} style={{ ...flatChip(on, C.purple, C, NUM_FONT), flexShrink: 0 }}>
              {label(m)}{m.tonight ? <span style={{ font: `900 9px/1 ${NUM_FONT}`, color: C.bg, background: on ? C.purple : C.text2, borderRadius: 999, padding: '2px 5px' }}>OUT</span> : null}
            </button>
          )
        })}
      </div>
      {!picked.length ? <div style={{ fontSize: 12, color: C.text3 }}>Pick a teammate. Two = both out.</div>
        : !pairRows ? <div style={{ fontSize: 12, color: C.text3 }}>No games with {names} {picked.length > 1 ? 'both ' : ''}out and in in this window.</div>
        : <Section id="without-pair" title={`Without ${names}`} meta={`${lines.without.gp} games`} rows={pairRows} columns={DELTA_COLS} preview={3} />}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: C.text }}>Without each teammate</span>
          <span style={{ fontSize: 12, color: C.text3, fontFamily: NUM_FONT }}>{scan.length} men</span>
        </div>
        <BucketsTable rows={pv.shown} columns={SCAN_COLS.map((c) => (c.key === 'who' ? { ...c, link: (m) => () => setPick([m.id]) } : c))} maxHeight={9999} maxRows={200} heatMode="standouts" initialSort={null} />
        <ShowMoreButton open={pv.open} restN={pv.restN} toggle={pv.toggle} total={pv.total} itemWord="teammates" />
      </div>
      <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.5 }}>Out = his club played, the teammate didn&apos;t, while on the club.</div>
    </div>
  )
}

export default function PlayerSplits({ games = [], label = '', onOpenTeam = null, playerId = null }) {
  const [active, setActive] = useState(null)
  const sections = useMemo(() => {
    const out = []
    const rec = recentRows(games)
    if (rec.length) out.push({ g: { key: 'recent', label: 'Last 5 / 10', caption: 'His newest games in this window, beside the whole window. Small samples by design.' }, rows: [{ _key: 'all', split: 'This window', ...aggregate(games) }, ...rec] })
    for (const g of SPLIT_GROUPS) {
      if (g.needsBoth && !(games.some((x) => x.type === 3) && games.some((x) => x.type === 2))) continue
      const rows = splitRows(games, g)
      if (rows.length) out.push({ g, rows })
    }
    return out
  }, [games])
  const pills = [...sections.map((s) => ({ key: s.g.key, label: s.g.label })), ...(games.length ? [{ key: 'combo', label: 'Combine' }] : [])]
  if (games.length && playerId) pills.splice(Math.min(1, pills.length), 0, { key: 'without', label: 'Without' })
  const shownKey = pills.some((x) => x.key === active) ? active : pills[0]?.key
  const hasPost = games.some((x) => x.type === 3)
  const noRest = games.length > 0 && games.every((x) => x.rest === undefined)
  return (
    <section aria-label="Splits" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14, minWidth: 0 }}>
      <Kicker>{label}{hasPost ? ' · REGULAR SEASON + PLAYOFFS' : ' · REGULAR SEASON'}{games.length ? ` · ${games.length} GAMES` : ''}</Kicker>
      {!games.length && <EmptyState title="NO SPLITS YET" note={`No ${label || 'current-season'} games for him yet. Try another season above.`} />}
      {games.length > 0 && (
        <>
          <div role="group" aria-label="Pick a split" className="chip-row" style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '0 -2px', padding: '0 2px', WebkitOverflowScrolling: 'touch' }}>
            {pills.map((p) => <button key={p.key} type="button" aria-pressed={shownKey === p.key} onClick={() => setActive(p.key)} className={FLAT_CHIP_CLASS} style={{ ...flatChip(shownKey === p.key, C.purple, C, NUM_FONT), flexShrink: 0 }}>{p.label}</button>)}
          </div>
          {/* the words, short (2026-10-23, as LAMP's: quick, not wordy): what THIN means, nothing else */}
          <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.5 }}>
            <b style={{ color: C.text }}>THIN</b> = under {THIN_GP} games.{noRest ? ' No rest-day split: his club’s schedule could not be read.' : ''}
          </div>
          {sections.filter(({ g }) => g.key === shownKey).map(({ g, rows }) => (
            <Section key={g.key} id={g.key} title={g.label} caption={g.caption}
              meta={`${rows.length} row${rows.length === 1 ? '' : 's'}${g.key === 'recent' ? '' : ` · thinnest ${Math.min(...rows.map((r) => r.gp))} GP`}`}
              rows={rows} itemWord={g.key === 'opp' ? 'opponents' : 'rows'}
              columns={g.key === 'opp' && onOpenTeam ? COLS.map((c) => (c.key === 'split' ? { ...c, fmt: (v) => <Tap onClick={() => onOpenTeam(v)} title={`Open ${v}`} style={{ minWidth: 44, display: 'inline-block', fontWeight: 800 }}>{v}</Tap> } : c)) : COLS} />
          ))}
          {shownKey === 'combo' && <Combo games={games} />}
          {shownKey === 'without' && <Without games={games} playerId={playerId} />}
        </>
      )}
    </section>
  )
}
