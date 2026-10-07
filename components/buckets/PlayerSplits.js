'use client'
import { useMemo, useState } from 'react'
import BucketsTable from './BucketsTable'
import Tap from '../Tap'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { usePreview, ShowMoreButton } from '../ListPreview'
import { Kicker, EmptyState } from './ui'
import { SPLIT_GROUPS, THIN_GP, splitRows, recentRows, filterGames, aggregate } from '../../lib/nba/splits'

// 🏀 BUCKETS PLAYER SPLITS -- LAMP's components/lamp/PlayerSplits.js (itself MOONSHOT's PlayerSplits) for a
// basketball player: one split on screen under a pill row, a GP column with a THIN flag on every row, an AND-combo
// filter over the game-level facts, and the caveat that nothing is adjusted. The rows come from the page's own
// game log (lib/nba/splits.js, pure, checked by scripts/check-nba-splits.mjs): no extra request.
// WHAT CAN'T BE ANSWERED IS SAID: ESPN's game log does not say who started and holds no game he did not play, so
// there is no starter/bench split and no with-or-without-a-teammate split.

const f1 = (v) => (v == null ? '—' : Number(v).toFixed(1))
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const COLS = [
  { key: 'split', label: 'Split', group: 'Split', heat: false, w: 118, bold: true, sticky: true, numeric: false },
  { key: 'gp', label: 'GP', group: 'Sample', heat: false, w: 38, title: 'Games in this row. Read this before any rate on the row.' },
  { key: 'thin', label: '', group: 'Sample', heat: false, numeric: false, w: 44, title: `THIN: under ${THIN_GP} games. A rate on this few games moves a lot on one night.`,
    fmt: (v) => (v ? <span style={{ color: C.amber, font: `900 10px/1 ${NUM_FONT}`, letterSpacing: '.06em' }}>THIN</span> : '') },
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

const pillStyle = (on) => ({
  flex: '0 0 auto', minHeight: 44, padding: '0 14px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
  border: `1px solid ${on ? C.purple : C.border2}`, background: on ? `${C.purple}1a` : 'transparent',
  color: on ? C.purple : C.text2, font: `800 12px/1 ${NUM_FONT}`, letterSpacing: '.04em',
})

function Section({ id, title, meta, rows, columns, caption, preview = 6, itemWord = 'rows' }) {
  const pv = usePreview(rows, preview)
  return (
    <div id={`bsplit-${id}`} style={{ scrollMarginTop: 60, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: C.text }}>{title}</span>
        {meta && <span style={{ fontSize: 12, color: C.text3, fontFamily: NUM_FONT }}>{meta}</span>}
      </div>
      <BucketsTable rows={pv.shown} columns={columns} maxHeight={9999} maxRows={200} heatMode="standouts" initialSort={null} caption={caption} />
      <ShowMoreButton open={pv.open} restN={pv.restN} toggle={pv.toggle} itemWord={itemWord} />
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
          <div style={{ fontSize: 12, color: line.thin ? C.amber : C.text3, fontFamily: NUM_FONT, marginBottom: 4 }}>
            {line.gp} game{line.gp === 1 ? '' : 's'}{line.thin ? ` · under ${THIN_GP}, read it as a curiosity, not a signal` : ''}
          </div>
          <BucketsTable rows={[line]} columns={COLS} maxHeight={9999} heatMode="none" initialSort={null} />
        </>
      )}
    </div>
  )
}

export default function PlayerSplits({ games = [], label = '', onOpenTeam = null }) {
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
            {pills.map((p) => <button key={p.key} type="button" aria-pressed={shownKey === p.key} onClick={() => setActive(p.key)} style={pillStyle(shownKey === p.key)}>{p.label}</button>)}
          </div>
          <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.6, maxWidth: 760 }}>
            Pick a split. Every row shows its games (GP) and is flagged <b style={{ color: C.amber }}>THIN</b> under {THIN_GP}: a few games prove little.
          </div>
          {sections.filter(({ g }) => g.key === shownKey).map(({ g, rows }) => (
            <Section key={g.key} id={g.key} title={g.label} caption={g.caption}
              meta={`${rows.length} row${rows.length === 1 ? '' : 's'}${g.key === 'recent' ? '' : ` · thinnest ${Math.min(...rows.map((r) => r.gp))} GP`}`}
              rows={rows} itemWord={g.key === 'opp' ? 'opponents' : 'rows'}
              columns={g.key === 'opp' && onOpenTeam ? COLS.map((c) => (c.key === 'split' ? { ...c, fmt: (v) => <Tap onClick={() => onOpenTeam(v)} title={`Open ${v}`} style={{ minWidth: 44, display: 'inline-block', fontWeight: 800 }}>{v}</Tap> } : c)) : COLS} />
          ))}
          {shownKey === 'combo' && <Combo games={games} />}
          <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.6 }}>
            <b style={{ color: C.text2 }}>Starter vs bench: not here.</b> ESPN&apos;s game log does not say who started, and it holds no game he did not play, so that split (and a with-or-without-a-teammate split) can&apos;t be answered from what we hold.
            {noRest ? ' Rest days are left out: his club’s schedule could not be read.' : ''}
          </div>
          <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.6 }}>
            Situational splits are the most over-read numbers in a season. Nothing here is opponent-adjusted, so a home/away or by-opponent gap partly measures the opponents, not him.
          </div>
        </>
      )}
    </section>
  )
}
