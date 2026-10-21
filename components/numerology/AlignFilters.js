'use client'
import { useMemo } from 'react'
import useHashFilters from '../../lib/useHashFilters'
import { flatChip, FLAT_CHIP_CLASS } from '../../lib/chips'
import { alignModel, alignedWithBy } from '../../lib/numerology/align'
import { TeamTap } from '../EntityTap'
import Tap from '../Tap'

// 🔮 NUMEROLOGY FILTERS, EVERY SPORT (2026-10-20, Donovan: "any way to make the numerology thing have filters like by
// game or by whatever pathway ... like if I wanted to search a player by alignments"). Three filters over the night's
// rows, then the SAME engine (lib/numerology/align.js) re-run on what's left, so every section below -- tonight's
// number, the clubs, the braids, the expected-by-chance counts -- describes the filtered set honestly:
//   search   a player or a team; a name that narrows to 1-3 players also gets HIS NUMBERS: every axis, raw -> root,
//            with the ones on tonight's number lit
//   game     one matchup
//   pathway  which numbers count (jersey, birth day, life path, next HR ...): the others drop out of the reduction
// The filters ride the address (nf.q / nf.game / nf.ax, lib/useHashFilters) so a filtered view is a link.
// Nothing here is computed but the filter; the arithmetic is the engine's.

// The game a row plays in: the numerology route's own label when it has one (LAMP / BUCKETS 'MIN@EDM'), else the
// row's two clubs (MOONSHOT / TUDDY carry team + opponent), never a guess.
export function gameOf(a) {
  const p = a?.p || {}
  if (p.game) return String(p.game)
  const t = a?.team || p.team
  const o = p.opp || p.opponent || p.opp_team
  if (!t || !o) return null
  if (p.home === true || p.home === 1) return `${o}@${t}`
  if (p.home === false || p.home === 0) return `${t}@${o}`
  return [t, o].sort().join(' · ')
}

/** The night's rows, filtered, and the model + tonight re-run on them. */
export function useAlignFilters({ model, tonight, todayRoot, scoreOf, AXIS_META = {}, sport }) {
  const [f, setF, reset] = useHashFilters('nf', { q: '', game: '', ax: '' })
  const axes = useMemo(() => new Set(String(f.ax || '').split(',').filter((k) => AXIS_META[k])), [f.ax, AXIS_META])
  const games = useMemo(() => [...new Set(model.rows.map(gameOf).filter(Boolean))].sort(), [model.rows])
  // only the pathways somebody tonight actually carries
  const axisKeys = useMemo(() => Object.keys(AXIS_META).filter((k) => model.rows.some((a) => a.axes?.[k] != null)), [AXIS_META, model.rows])
  const needle = String(f.q || '').trim().toLowerCase()
  const active = Boolean(needle || f.game || axes.size)
  const out = useMemo(() => {
    if (!active) return { model, tonight, matches: [] }
    let rows = model.rows
    if (f.game) rows = rows.filter((a) => gameOf(a) === f.game)
    if (needle) rows = rows.filter((a) => `${a.name || ''} ${a.team || ''}`.toLowerCase().includes(needle))
    if (axes.size) rows = rows.map((a) => ({ ...a, axes: Object.fromEntries(Object.entries(a.axes || {}).filter(([k]) => axes.has(k))) })).filter((a) => Object.values(a.axes).some((v) => v != null))
    const m = alignModel(rows, scoreOf)
    const t = tonight && todayRoot ? alignedWithBy(todayRoot, rows, scoreOf) : tonight
    // HIS NUMBERS: a search that narrows to a few players
    const matches = needle && rows.length <= 3 ? rows : []
    return { model: m, tonight: t, matches }
  }, [active, model, tonight, todayRoot, scoreOf, f.game, needle, axes])
  return { ...out, active, f, setF, reset, axes, games, axisKeys, sport }
}

export default function AlignFilters({ ctl, AXIS_META = {}, todayRoot, theme: C, numFont, accent, words = {}, onName = null }) {
  const { f, setF, reset, axes, games, axisKeys, active, matches, model } = ctl
  const chip = (on) => flatChip(on, accent, C, numFont)
  const toggleAxis = (k) => { const n = new Set(axes); if (n.has(k)) n.delete(k); else n.add(k); setF('ax', [...n].join(',')) }
  const field = { minHeight: 44, padding: '0 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg2, color: C.text, font: 'inherit', fontSize: 16, minWidth: 0, outlineColor: accent }
  return (
    <div style={{ margin: '0 0 10px' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input type="search" value={f.q} onChange={(e) => setF('q', e.target.value)} placeholder={`Search a ${words.person || 'player'} or team`}
          aria-label="Search numerology by player or team" style={{ ...field, flex: '1 1 auto' }} />
        {games.length > 1 ? (
          <select value={f.game} onChange={(e) => setF('game', e.target.value)} aria-label="Filter numerology by game" style={{ ...field, flex: '0 0 auto', maxWidth: '42%', fontSize: 14 }}>
            <option value="">All games</option>
            {games.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        ) : null}
      </div>
      {axisKeys.length > 1 ? (
        <div role="group" aria-label="Count only these numbers" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '11px 0', margin: '-5px 0 -11px', scrollbarWidth: 'none', alignItems: 'center' }}>
          <span style={{ flex: '0 0 auto', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: C.text3, fontFamily: numFont }}>COUNT</span>
          {axisKeys.map((k) => (
            <button key={k} type="button" className={FLAT_CHIP_CLASS} style={chip(axes.has(k))} aria-pressed={axes.has(k)} onClick={() => toggleAxis(k)}>{AXIS_META[k].label}</button>
          ))}
          {active ? <button type="button" className={FLAT_CHIP_CLASS} style={chip(false)} onClick={reset}>Clear</button> : null}
        </div>
      ) : active ? (
        <button type="button" className={FLAT_CHIP_CLASS} style={{ ...chip(false), marginTop: 8 }} onClick={reset}>Clear</button>
      ) : null}
      {active ? (
        <div style={{ marginTop: 8, fontSize: 11, color: C.text3 }}>
          {model.rows.length
            ? <>Showing <b style={{ color: C.text2, fontFamily: numFont }}>{model.rows.length}</b> {model.rows.length === 1 ? (words.person || 'player') : (words.persons || 'players')}{axes.size ? <>, counting only {[...axes].map((k) => AXIS_META[k]?.label).join(' + ')}</> : null}. The chance numbers below are for this set.
              {axes.size === 1 ? <> With one number counted nobody can carry tonight&apos;s {todayRoot} twice: the {todayRoot} club below is everyone on it.</> : null}</>
            : <>Nobody matches these filters.</>}
        </div>
      ) : null}
      {matches.length ? (
        <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
          {matches.map((a) => (
            <div key={a.pid} style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg2, padding: '8px 10px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text }}><Tap onClick={onName ? () => onName(a) : null}>{a.name}</Tap> <span style={{ color: C.text3, fontWeight: 600 }}><TeamTap abbr={a.team} sport={ctl.sport} px={14} /></span>
                <span style={{ float: 'right', fontSize: 10, fontWeight: 900, letterSpacing: '.08em', color: C.text3, fontFamily: numFont }}>HIS NUMBERS</span></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {Object.entries(a.axes || {}).filter(([, v]) => v != null).map(([k, v]) => {
                  const raw = AXIS_META[k]?.raw?.(a)
                  const on = Number(v) === Number(todayRoot)
                  return (
                    <span key={k} title={AXIS_META[k]?.why?.(a) || k} style={{ ...chip(on), cursor: 'default' }}>
                      {AXIS_META[k]?.label || k} {raw != null && raw !== '' ? <>{raw}→</> : null}{v}
                    </span>
                  )
                })}
              </div>
              <div style={{ marginTop: 5, fontSize: 10.5, color: C.text3 }}>
                {(() => { const n = Object.values(a.axes || {}).filter((v) => Number(v) === Number(todayRoot)).length; return n ? <>{n} of his numbers on tonight&apos;s {todayRoot}.</> : <>None of his numbers on tonight&apos;s {todayRoot}.</> })()}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
