'use client'
import { useMemo, useState } from 'react'
import LampTable from './LampTable'
import Tap from '../Tap'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import { useLampSplits } from '../../lib/nhl/useLamp'
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

const pillStyle = (on) => ({
  flex: '0 0 auto', minHeight: 44, padding: '0 14px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
  border: `1px solid ${on ? C.ice : C.border2}`, background: on ? `${C.ice}1a` : 'transparent',
  color: on ? C.ice : C.text2, font: `800 12px/1 ${NUM_FONT}`, letterSpacing: '.04em',
})

function Section({ id, title, meta, rows, columns, caption, preview = 6, itemWord = 'rows' }) {
  const pv = usePreview(rows, preview)
  return (
    <div id={`lsplit-${id}`} style={{ scrollMarginTop: 60, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: C.text }}>{title}</span>
        {meta && <span style={{ fontSize: 12, color: C.text3, fontFamily: NUM_FONT }}>{meta}</span>}
      </div>
      <LampTable rows={pv.shown} columns={columns} maxHeight={9999} maxRows={200} heatMode="standouts" initialSort={null} caption={caption} />
      <ShowMoreButton open={pv.open} restN={pv.restN} toggle={pv.toggle} itemWord={itemWord} />
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

export default function PlayerSplits({ id, goalie = false, onOpenTeam = null }) {
  const { data, error, loading } = useLampSplits(id, !goalie)
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
  const jump = (k) => {
    setActive(k)
    try { document.getElementById(`lsplit-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) } catch { /* no DOM */ }
  }
  return (
    <section aria-label="Splits" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14, minWidth: 0 }}>
      <div>
        <Kicker>SPLITS · {label}{hasPost ? ' REGULAR SEASON + PLAYOFFS' : ' REGULAR SEASON'}{games.length ? ` · ${games.length} GAMES` : ''}</Kicker>
        <DelayedBanner error={error} what="the league’s game log" />
        {loading && !data && <Loading what="his splits" />}
      </div>
      {data && !games.length && <EmptyState title="NO SPLITS YET" note={`The league has no ${label || 'current-season'} games for him yet.`} />}
      {games.length > 0 && (
        <>
          <div role="group" aria-label="Jump to a split" style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '0 -2px', padding: '0 2px', WebkitOverflowScrolling: 'touch' }}>
            {pills.map((p) => <button key={p.key} type="button" aria-pressed={active === p.key} onClick={() => jump(p.key)} style={pillStyle(active === p.key)}>{p.label}</button>)}
          </div>
          <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.6, maxWidth: 760 }}>
            One sheet, every split: the pills jump, nothing hides. Every row prints its games (GP) and is flagged <b style={{ color: C.amber }}>THIN</b> under {THIN_GP}.
            Columns are shaded within each table, so a bright cell means high for him across that one split.
          </div>
          {sections.map(({ g, rows }) => (
            <Section key={g.key} id={g.key} title={g.label} caption={g.caption}
              meta={`${rows.length} row${rows.length === 1 ? '' : 's'} · thinnest ${Math.min(...rows.map((r) => r.gp))} GP`}
              rows={rows} columns={g.key === 'opp' && onOpenTeam ? COLS.map((c) => (c.key === 'split' ? { ...c, fmt: (v) => <Tap onClick={() => onOpenTeam(v)} title={`Open ${v}`} style={{ minWidth: 44, display: 'inline-block', fontWeight: 800 }}>{v}</Tap> } : c)) : COLS} itemWord={g.key === 'opp' ? 'opponents' : g.key === 'venue' ? 'rinks' : 'rows'} />
          ))}
          {strength.length > 0 && (
            <Section id="strength" title="Goals by strength" meta={`${strength[0].gp} GP · EV = G − PP − SH`} rows={strength} columns={STRENGTH_COLS} preview={3}
              caption="Even-strength goals are his goals minus power-play minus short-handed goals: the game log has no even-strength column, so this is that subtraction." />
          )}
          <Combo games={games} />
          <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.6 }}>
            Situational splits are the most over-read numbers in a season. Nothing here is opponent- or rink-adjusted, so a home/road or by-rink gap partly measures the opponents and buildings, not him.
            The game log carries no overtime or day/night flag, so there is no split for either.
          </div>
        </>
      )}
    </section>
  )
}
