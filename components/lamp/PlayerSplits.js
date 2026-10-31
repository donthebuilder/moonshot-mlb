'use client'
import { useMemo, useState } from 'react'
import LampTable from './LampTable'
import Tap from '../Tap'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import { flatChip, FLAT_CHIP_CLASS } from '../../lib/chips'
import { useLampSplits, useLampWithout } from '../../lib/nhl/useLamp'
import { useInjuryLayer } from '../injuries/InjuryLayer'
import { BLOCKS } from '../../lib/injuries/statuses'
import { findEntry } from '../../lib/injuries/lookup'
import { withoutLines, withoutScan, rankMates } from '../../lib/nba/without'
import { usePreview, ShowMoreButton } from '../ListPreview'
import { Kicker, Loading, EmptyState, DelayedBanner, fmtPct1, fmt2, fmtSec, plusMinus } from './ui'
import { SPLIT_GROUPS, THIN_GP, DOW_ORDER, splitRows, strengthRows, filterGames, aggregate, monthOf } from '../../lib/nhl/splits'

// 🏒 LAMP PLAYER SPLITS -- MOONSHOT's components/PlayerSplits.js, for a skater.
//
// Same shape as MOONSHOT's: one sheet of stacked tables under a jump strip
// (the pills jump, nothing hides), a per-row sample count with a THIN flag, an
// AND-combo filter over the game-level facts, and the caveat that nothing here
// is adjusted. MOONSHOT's component is built on the bot's MLB file and the MLB
// league's statSplits (its rows are PA/AVG/OPS), so it can't take a hockey
// game log as-is; the pieces that CAN be shared are shared -- LampTable
// (DenseTable skin v2, `group`ed columns), usePreview/ShowMoreButton ("+N
// more"), the pill-row jump strip and the combo's select row. The grouping
// itself is lib/nhl/splits.js (pure, checked by scripts/check-lamp-splits.mjs).
// Goalies get no splits: the page doesn't mount this for them, and the route
// answers an empty list.

const COLS = [
  { key: 'split', label: 'Split', group: 'Split', heat: false, w: 118, bold: true, sticky: true, numeric: false },
  { key: 'gp', label: 'GP', group: 'Sample', heat: false, w: 38, title: `Games in this row. Read this before any rate on the row.` },
  { key: 'thin', label: '', group: 'Sample', heat: false, numeric: false, w: 44, title: `THIN: under ${THIN_GP} games. A rate on this few games moves a lot on one night.`,
    fmt: (v) => (v ? <span style={{ color: C.amber, font: `900 10px/1 ${NUM_FONT}`, letterSpacing: '.06em' }}>THIN</span> : '') },
  { key: 'g', label: 'G', group: 'Scoring', w: 34 }, { key: 'a', label: 'A', group: 'Scoring', w: 34 }, { key: 'pts', label: 'PTS', group: 'Scoring', w: 40 },
  { key: 'shots', label: 'S', group: 'Rates', w: 36 }, { key: 'shPct', label: 'S%', group: 'Rates', w: 42, fmt: fmtPct1 },
  { key: 'gPg', label: 'G/GP', group: 'Rates', w: 46, fmt: fmt2 }, { key: 'ptsPg', label: 'PTS/GP', group: 'Rates', w: 52, fmt: fmt2 },
  { key: 'ppg', label: 'PPG', group: 'Special teams', w: 40, title: 'Power-play goals in these games.' },
  { key: 'toi', label: 'TOI/GP', group: 'Ice', w: 52, fmt: fmtSec, heat: false, title: 'Average time on ice per game.' },
  { key: 'pm', label: '+/-', group: 'Ice', w: 40, fmt: plusMinus },
]
const STRENGTH_COLS = [
  { key: 'split', label: 'Strength', group: 'Split', heat: false, w: 118, bold: true, sticky: true, numeric: false },
  { key: 'gp', label: 'GP', group: 'Sample', heat: false, w: 38 },
  { key: 'thin', label: '', group: 'Sample', heat: false, numeric: false, w: 44, fmt: COLS[2].fmt, title: COLS[2].title },
  { key: 'g', label: 'G', group: 'Goals', w: 40 },
  { key: 'share', label: '% of G', group: 'Goals', w: 52, fmt: (v) => (v == null ? '—' : `${Math.round(v * 100)}%`), title: 'Share of his goals scored at this strength.' },
  { key: 'gPg', label: 'G/GP', group: 'Goals', w: 46, fmt: fmt2 },
]

function Section({ id, title, meta, rows, columns, caption, preview = 6, itemWord = 'rows' }) {
  const pv = usePreview(rows, preview)
  return (
    <div id={`lsplit-${id}`} style={{ scrollMarginTop: 60, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: C.text }}>{title}</span>
        {meta && <span style={{ fontSize: 12, color: C.text3, fontFamily: NUM_FONT }}>{meta}</span>}
      </div>
      <LampTable rows={pv.shown} columns={columns} maxHeight={9999} maxRows={200} heatMode="standouts" initialSort={null} caption={caption} />
      <ShowMoreButton open={pv.open} restN={pv.restN} toggle={pv.toggle} total={pv.total} itemWord={itemWord} />
    </div>
  )
}

const selStyle = (on) => ({
  minHeight: 44, fontSize: 13, fontWeight: 700, padding: '0 10px', borderRadius: 8, maxWidth: '100%',
  background: C.bg2, border: `1px solid ${on ? C.ice : C.border}`, color: on ? C.text : C.text3, cursor: 'pointer',
})
function Sel({ value, onChange, options, placeholder, label }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} style={selStyle(!!value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  )
}

function Combo({ games }) {
  const [f, setF] = useState({ ha: '', dow: '', rest: '', type: '', month: '', opp: '' })
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }))
  const anyOn = Object.values(f).some(Boolean)
  const line = useMemo(() => {
    if (!anyOn) return null
    const m = filterGames(games, f)
    return m.length ? { ...aggregate(m), _key: 'combo', split: 'Your filter' } : { gp: 0 }
  }, [games, f, anyOn])
  const opps = useMemo(() => [...new Set(games.map((x) => x.opp).filter(Boolean))].sort(), [games])
  const months = useMemo(() => [...new Set(games.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((x) => monthOf(x.date)).filter(Boolean))], [games])
  const hasPost = games.some((x) => x.type === 3)
  const hasRest = games.some((x) => x.rest !== undefined)
  return (
    <div id="lsplit-combo" style={{ scrollMarginTop: 60, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: C.text }}>Combine filters</span>
        <span style={{ fontSize: 12, color: C.text3, fontFamily: NUM_FONT }}>home/away + day + rest + opponent + month, all at once</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <Sel label="Home or away" value={f.ha} onChange={set('ha')} placeholder="Home/Away" options={[{ v: 'home', label: 'Home' }, { v: 'away', label: 'Away' }]} />
        <Sel label="Day of week" value={f.dow} onChange={set('dow')} placeholder="Any day" options={DOW_ORDER.slice(1).concat(DOW_ORDER[0]).map((d) => ({ v: d, label: d }))} />
        {hasRest && <Sel label="Rest days" value={f.rest} onChange={set('rest')} placeholder="Any rest" options={[{ v: '0', label: 'Back-to-back' }, { v: '1', label: '1 day rest' }, { v: '2+', label: '2+ days rest' }]} />}
        {hasPost && <Sel label="Game type" value={f.type} onChange={set('type')} placeholder="Any game type" options={[{ v: '2', label: 'Regular season' }, { v: '3', label: 'Playoffs' }]} />}
        <Sel label="Month" value={f.month} onChange={set('month')} placeholder="Any month" options={months.map((m) => ({ v: m, label: m }))} />
        <Sel label="Opponent" value={f.opp} onChange={set('opp')} placeholder="Any opponent" options={opps.map((o) => ({ v: o, label: o }))} />
        {anyOn && (
          <button type="button" onClick={() => setF({ ha: '', dow: '', rest: '', type: '', month: '', opp: '' })}
            style={{ minHeight: 44, padding: '0 10px', fontSize: 12, fontWeight: 700, color: C.text2, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>clear</button>
        )}
      </div>
      {!anyOn ? (
        <div style={{ fontSize: 12, color: C.text3, padding: '2px 0' }}>Pick at least one filter to see a combined line. Mix as many as you want.</div>
      ) : line.gp === 0 ? (
        <div style={{ fontSize: 12, color: C.text3, padding: '2px 0' }}>No games matched that combination this season.</div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: line.thin ? C.amber : C.text3, fontFamily: NUM_FONT, marginBottom: 4 }}>
            {line.gp} game{line.gp === 1 ? '' : 's'}{line.thin ? ` · under ${THIN_GP}, read it as a curiosity, not a signal` : ''}
          </div>
          <LampTable rows={[line]} columns={COLS} maxHeight={9999} heatMode="none" initialSort={null} />
        </>
      )}
    </div>
  )
}

const sgn = (v, d = 2) => (v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(d)}`)
const NOT_STATS = ['split', 'gp', 'thin']
// THE CHANGE ROW: the same columns, each cell = without minus with (rates only: a count of a few games would mislead).
const RATE_KEYS = ['shPct', 'gPg', 'ptsPg', 'toi']
const DELTA_COLS = COLS.map((c) => (NOT_STATS.includes(c.key) ? c : { ...c, fmt: (v, r) => (r._delta ? (RATE_KEYS.includes(c.key) ? (c.key === 'toi' ? plusMinus(v == null ? null : Math.round(v)) : c.key === 'shPct' ? sgn(v == null ? null : v * 100, 1) : sgn(v)) : '') : (c.fmt ? c.fmt(v, r) : v)) }))
const deltaOf = (a, b) => Object.fromEntries(RATE_KEYS.map((k) => [k, a[k] != null && b[k] != null ? b[k] - a[k] : null]))
// THE SCAN: every teammate, his points and goals a game with and without that man, and how his shots and ice time move.
const SCAN_COLS = [
  { key: 'who', label: 'Teammate out', group: 'Teammate', heat: false, w: 118, bold: true, sticky: true, numeric: false },
  { key: 'gp', label: 'GP', group: 'Sample', heat: false, w: 38, title: 'His games while this teammate was out.' },
  COLS[2],
  { key: 'ptsW', label: 'WITH', group: 'PTS/GP', w: 46, fmt: fmt2, heat: false },
  { key: 'ptsO', label: 'W/O', group: 'PTS/GP', w: 46, fmt: fmt2, bold: true },
  { key: 'ptsPg', label: 'CHG', group: 'PTS/GP', w: 46, fmt: (v) => sgn(v) },
  { key: 'gPg', label: 'G/GP', group: 'Change', w: 46, fmt: (v) => sgn(v) },
  { key: 'shotsPg', label: 'S/GP', group: 'Change', w: 46, fmt: (v) => sgn(v, 1) },
  { key: 'toi', label: 'TOI', group: 'Change', w: 52, fmt: (v) => plusMinus(v == null ? null : Math.round(v)), title: 'Seconds of ice time a game, without minus with.' },
]
const shotsPg = (a) => (a.gp ? a.shots / a.gp : null)

// WITHOUT (2026-10-31, BUCKETS' twin: lib/nba/without.js runs both): his line in the games a teammate did not dress for. Teammates as chips
// (whoever the injury report has OUT tonight first, then most points a game); two picked = both out. The splits rows join the box archive by game id.
function Without({ games, playerId }) {
  const { data: wo, loading } = useLampWithout(playerId)
  const mates = wo?.mates ?? (loading ? null : [])
  const [pick, setPick] = useState(null)
  const layer = useInjuryLayer()
  const gs = useMemo(() => games.map((g) => ({ ...g, id: String(g.gameId) })), [games])
  const list = useMemo(() => rankMates(mates, new Set(gs.map((g) => g.id)), (m) => {
    const e = layer?.index ? findEntry(layer.index, { player_id: m.id, name: m.name, team: m.team }) : null
    return e && BLOCKS.has(e.status)
  }), [mates, gs, layer])
  const chosen = pick || (list[0] ? [list[0].id] : [])
  const picked = chosen.map((id) => list.find((m) => m.id === id)).filter(Boolean)
  const toggle = (id) => setPick(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id].slice(-2))
  const names = picked.map((m) => m.label).join(' + ')
  const lines = withoutLines(gs, picked, aggregate)
  const pairRows = lines && lines.without.gp && lines.with.gp ? [
    { _key: 'w', split: `With ${names}`, ...lines.with },
    { _key: 'o', split: `Without ${names}`, ...lines.without },
    { _key: 'd', _delta: true, split: 'Change', ...deltaOf(lines.with, lines.without), gp: null, thin: false },
  ] : null
  const scan = useMemo(() => withoutScan(gs, list, { agg: aggregate }).map(({ m, with: w, without: o }) => ({
    _key: m.id, _raw: m, who: m.label, gp: o.gp, thin: o.gp < THIN_GP, ptsW: w.ptsPg, ptsO: o.ptsPg,
    ptsPg: o.ptsPg != null && w.ptsPg != null ? o.ptsPg - w.ptsPg : null, gPg: o.gPg != null && w.gPg != null ? o.gPg - w.gPg : null,
    shotsPg: shotsPg(o) != null && shotsPg(w) != null ? shotsPg(o) - shotsPg(w) : null, toi: o.toi != null && w.toi != null ? o.toi - w.toi : null,
  })).sort((a, b) => (a.thin - b.thin) || ((b.ptsPg ?? -9) - (a.ptsPg ?? -9))), [gs, list])
  const pv = usePreview(scan, 5)
  if (mates == null) return <Loading what="his teammates" />
  if (!list.length) return <EmptyState title="NO TEAMMATE MISSED A GAME" note={wo?.why || 'Nobody on his club sat out one of his games in this window.'} />
  return (
    <div id="lsplit-without" style={{ scrollMarginTop: 60, minWidth: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      <div role="group" aria-label="Teammate out" className="chip-row" style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '0 -2px', padding: '0 2px', WebkitOverflowScrolling: 'touch' }}>
        {list.map((m) => {
          const on = chosen.includes(m.id)
          return (
            <button key={m.id} type="button" aria-pressed={on} onClick={() => toggle(m.id)} title={m.tonight ? `${m.name}: out tonight` : m.name} className={FLAT_CHIP_CLASS} style={{ ...flatChip(on, C.ice, C, NUM_FONT), flexShrink: 0 }}>
              {m.label}{m.tonight ? <span style={{ font: `900 9px/1 ${NUM_FONT}`, color: C.bg, background: on ? C.ice : C.text2, borderRadius: 999, padding: '2px 5px' }}>OUT</span> : null}
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
        <LampTable rows={pv.shown} columns={SCAN_COLS.map((c) => (c.key === 'who' ? { ...c, link: (m) => () => setPick([m._raw.id]) } : c))} maxHeight={9999} maxRows={200} heatMode="standouts" initialSort={null} />
        <ShowMoreButton open={pv.open} restN={pv.restN} toggle={pv.toggle} total={pv.total} itemWord="teammates" />
      </div>
      <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.5 }}>Out = his club played, the teammate didn&apos;t dress, while on the club.</div>
    </div>
  )
}

export default function PlayerSplits({ id, goalie = false, onOpenTeam = null, season = 'this' }) {
  const { data, error, loading } = useLampSplits(id, !goalie, season)
  const [active, setActive] = useState(null)
  const games = data?.games || []
  const sections = useMemo(() => SPLIT_GROUPS.map((g) => {
    if (g.needsBoth && !(games.some((x) => x.type === 3) && games.some((x) => x.type === 2))) return null
    const rows = splitRows(games, g)
    return rows.length ? { g, rows } : null
  }).filter(Boolean), [games])
  const strength = useMemo(() => (games.length ? strengthRows(games) : []), [games])
  if (goalie || !id) return null
  const label = data?.seasonLabel || ''
  const hasPost = games.some((x) => x.type === 3)
  const pills = [...sections.map((s) => ({ key: s.g.key, label: s.g.label })), ...(strength.length ? [{ key: 'strength', label: 'EV / PP / SH' }] : []), ...(games.length ? [{ key: 'combo', label: 'Combine' }] : [])]
  if (games.length && id) pills.splice(Math.min(1, pills.length), 0, { key: 'without', label: 'Without' })
  // ONE SPLIT ON SCREEN (2026-10-06, the player card's tabs): a pill shows its own table, so the tab is one screen, not seven stacked.
  const shownKey = pills.some((x) => x.key === active) ? active : pills[0]?.key
  const jump = (k) => setActive(k)
  return (
    <section aria-label="Splits" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14, minWidth: 0 }}>
      <div>
        <Kicker>{label}{hasPost ? ' · REGULAR SEASON + PLAYOFFS' : ' · REGULAR SEASON'}{games.length ? ` · ${games.length} GAMES` : ''}</Kicker>
        <DelayedBanner error={error} what="his game log" />
        {loading && !data && <Loading what="his splits" />}
      </div>
      {data && !games.length && <EmptyState title="NO SPLITS YET" note={`No ${label || 'current-season'} games for him yet. Try another season above.`} />}
      {games.length > 0 && (
        <>
          <div role="group" aria-label="Jump to a split" style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '0 -2px', padding: '0 2px', WebkitOverflowScrolling: 'touch' }}>
            {pills.map((p) => <button key={p.key} type="button" className={FLAT_CHIP_CLASS} aria-pressed={shownKey === p.key} onClick={() => jump(p.key)} style={{ ...flatChip(shownKey === p.key, C.ice, C, NUM_FONT), flexShrink: 0 }}>{p.label}</button>)}
          </div>
          {/* the words, short (2026-10-23, Donovan: quick, not wordy): what THIN means, nothing else */}
          <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.5 }}>
            <b style={{ color: C.amber }}>THIN</b> = under {THIN_GP} games.
          </div>
          {sections.filter(({ g }) => g.key === shownKey).map(({ g, rows }) => (
            <Section key={g.key} id={g.key} title={g.label} caption={g.caption}
              meta={`${rows.length} row${rows.length === 1 ? '' : 's'} · thinnest ${Math.min(...rows.map((r) => r.gp))} GP`}
              rows={rows} columns={g.key === 'opp' && onOpenTeam ? COLS.map((c) => (c.key === 'split' ? { ...c, fmt: (v) => <Tap onClick={() => onOpenTeam(v)} title={`Open ${v}`} style={{ minWidth: 44, display: 'inline-block', fontWeight: 800 }}>{v}</Tap> } : c)) : COLS} itemWord={g.key === 'opp' ? 'opponents' : g.key === 'venue' ? 'rinks' : 'rows'} />
          ))}
          {strength.length > 0 && shownKey === 'strength' && (
            <Section id="strength" title="Goals by strength" meta={`${strength[0].gp} GP · EV = G − PP − SH`} rows={strength} columns={STRENGTH_COLS} preview={3}
              caption="Even-strength goals are his goals minus power-play minus short-handed goals: the game log has no even-strength column, so this is that subtraction." />
          )}
          {shownKey === 'combo' && <Combo games={games} />}
          {shownKey === 'without' && <Without games={games} playerId={id} />}
        </>
      )}
    </section>
  )
}
