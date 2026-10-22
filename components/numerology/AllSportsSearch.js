'use client'
import { useEffect, useMemo, useState } from 'react'
import { sharedJSON } from '../../lib/sharedRead'
import { flatChip, FLAT_CHIP_CLASS } from '../../lib/chips'
import { BRAND, playerHref } from '../../lib/routes'
import { SPORT_ACCENT } from '../../lib/sportAccent'
import { easternToday } from '../../lib/data'
import { loadInjuries } from '../injuries/InjuryLayer'
import { indexEntries, findEntry } from '../../lib/injuries/lookup'
import InjuryChip from '../injuries/InjuryChip'
import { usePreview, ShowMoreButton } from '../ListPreview'
import { TeamTap } from '../EntityTap'
import Tap from '../Tap'

// 🔮 EVERY SPORT, ONE SEARCH (2026-10-21, Donovan: "shared ability to have somewhere where you can search all the aligned
// players across all sports today"). The ALL SPORTS switch on any product's Numerology filters: the same search box and
// the same 1-9 number row, run over every open product's slate at once (/api/numerology/all, lib/numerology/allSports.js).
// Rows carry the numbers every product shares -- jersey, birth day, life path, next HR / TD / goal -- each against HIS
// game's own number (a TUDDY Sunday man against Sunday's). With nothing typed or picked it answers first: who lines up
// today (2+ of his own numbers on his game's number), every sport, strongest first. Filters ride the address (nf.all,
// nf.sp, nf.gm = one game, plus the shared nf.q / nf.root). For fun: never graded, never in a score.

const AX = ['next', 'jersey', 'day', 'path']
const AX_LABEL = { next: (r) => `next ${r.unit || ''}`.trim(), jersey: () => 'jersey', day: () => 'birth day', path: () => 'life path' }
const AX_RAW = { next: (r) => r.next, jersey: (r) => r.jersey, day: (r) => Number(String(r.birthDate || '').slice(8, 10)) || null, path: () => null }
const AX_WHY = {
  next: (r) => `his next ${r.unit} is #${r.next}`, jersey: (r) => `jersey #${r.jersey}`,
  day: (r) => `born on the ${String(r.birthDate).slice(8, 10)}`, path: (r) => `life path from ${r.birthDate}`,
}
const weekday = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase()

/** Each listed sport's injury index (the same 20-minute shared read the products' own layer uses). */
function useInjuryIndexes(sports) {
  const [idx, setIdx] = useState({})
  const key = sports.join(',')
  useEffect(() => {
    let alive = true
    for (const s of sports) loadInjuries(s).then((snap) => { if (alive && snap && !snap.unavailable) setIdx((m) => ({ ...m, [s]: indexEntries(s, snap.entries) })) })
    return () => { alive = false }
  }, [key])   // eslint-disable-line react-hooks/exhaustive-deps
  return idx
}

export default function AllSportsSearch({ f, setF, sport, theme: C, numFont, accent, onName = null, numberRow = null }) {
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    sharedJSON('/api/numerology/all').then((j) => { if (!alive) return; if (j && Array.isArray(j.rows)) setData(j); else setFailed(true) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])
  const today = easternToday()
  const sports = useMemo(() => (data?.sports || []).map((s) => s.sport), [data])
  const injuries = useInjuryIndexes(sports)
  const needle = String(f.q || '').trim().toLowerCase()
  const root = /^[1-9]$/.test(String(f.root || '')) ? Number(f.root) : null
  const sp = sports.includes(f.sp) ? f.sp : ''
  const gm = String(f.gm || '')   // `${sport}|${game}`: two leagues can share a matchup label

  const list = useMemo(() => {
    let rows = data?.rows || []
    if (sp) rows = rows.filter((r) => r.sport === sp)
    if (gm) rows = rows.filter((r) => `${r.sport}|${r.game}` === gm)
    if (needle) rows = rows.filter((r) => `${r.name} ${r.team || ''}`.toLowerCase().includes(needle))
    const order = new Map(sports.map((s, i) => [s, i]))
    return rows.map((r) => {
      const target = root ?? r.dateRoot
      const keys = AX.filter((k) => r.axes?.[k] != null && Number(r.axes[k]) === Number(target))
      return { r, target, keys, strength: keys.length }
    }).filter((x) => (needle ? true : root ? x.strength >= 1 : x.strength >= 2))
      // strongest first; on a tie today's games before later ones (TUDDY's Sunday men after tonight's), then product, then name
      .sort((a, b) => (b.strength - a.strength) || String(a.r.gameDate).localeCompare(String(b.r.gameDate)) || (order.get(a.r.sport) - order.get(b.r.sport)) || a.r.name.localeCompare(b.r.name))
  }, [data, sp, gm, needle, root, sports])
  const pv = usePreview(list, 6)
  const full = needle && list.length <= 3   // a search down to a few men shows every number he has
  const chip = (on, tone = accent) => flatChip(on, tone, C, numFont)

  const scope = sp ? BRAND[sp].name : 'EVERY SPORT'
  const title = root ? `EVERYONE ON ${root}` : needle ? `SEARCH, ${scope}` : `LINED UP TODAY, ${scope}`
  const sub = root
    ? `${list.length} ${list.length === 1 ? 'player' : 'players'}${sp ? ` · ${BRAND[sp].name}` : ' · every sport'}`
    : needle ? `${list.length} ${list.length === 1 ? 'match' : 'matches'} · each against his game's number`
      : `${list.length} with 2+ of his own numbers on his game's number`
  return (
    <>
      <div role="group" aria-label="Sports in the search" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '11px 0', margin: '-5px 0 -11px', scrollbarWidth: 'none', alignItems: 'center' }}>
        <span style={{ flex: '0 0 auto', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: C.text3, fontFamily: numFont }}>TODAY</span>
        {(data?.sports || []).map((s) => {
          const off = !s.players
          const tone = SPORT_ACCENT[s.sport] || accent
          return (
            <button key={s.sport} type="button" className={FLAT_CHIP_CLASS} disabled={off} aria-pressed={sp === s.sport}
              title={off ? s.note || 'No games' : `${BRAND[s.sport].name}: ${s.players} players. ${s.date === today ? "Today's" : `${weekday(s.date)}'s`} number is ${s.dateRoot}.`}
              onClick={() => setF('sp', sp === s.sport ? '' : s.sport)}
              style={{ ...flatChip(sp === s.sport, tone, C, numFont, { disabled: off }), ...(sp !== s.sport && !off ? { color: C.text } : null) }}>
              {BRAND[s.sport].name}{' '}
              {off ? <span style={{ color: C.text3 }}>{s.delayed ? 'delayed' : 'no game'}</span>
                : <><b style={{ color: tone }}>{s.dateRoot}</b>{s.date !== today ? <span style={{ color: C.text3 }}>{weekday(s.date)}</span> : null}</>}
            </button>
          )
        })}
        {!data && !failed ? <span style={{ fontSize: 10.5, color: C.text3 }}>Loading every sport…</span> : null}
      </div>
      {numberRow}
      {failed ? <div style={{ marginTop: 8, fontSize: 11, color: C.text3 }}>LIVE DATA DELAYED: the every-sport list did not load. This product&apos;s own numbers are below.</div> : null}
      {data ? (
        <section aria-label="Every sport" style={{ marginTop: 8, border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg2, padding: '8px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.08em', color: accent, fontFamily: numFont }}>{title}</span>
            <span style={{ fontSize: 10.5, color: C.text3 }}>{sub}</span>
            {gm ? <button type="button" className={FLAT_CHIP_CLASS} onClick={() => setF('gm', '')} title="Show every game again" style={chip(true)}>{gm.split('|')[1]} ✕</button> : null}
          </div>
          {pv.shown.map(({ r, target, keys, strength }) => {
            const tone = SPORT_ACCENT[r.sport] || accent
            const entry = injuries[r.sport] ? findEntry(injuries[r.sport], { player_id: r.pid, name: r.name, team: r.team }) : null
            const mine = r.sport === sport && onName
            const shown = full ? AX.filter((k) => r.axes?.[k] != null) : keys
            return (
              <div key={`${r.sport}|${r.pid}`} style={{ display: 'flex', alignItems: 'center', gap: '2px 6px', flexWrap: 'wrap', padding: '5px 0', borderTop: `1px solid ${C.border}` }}>
                <span title={BRAND[r.sport].league} style={{ fontSize: 9, fontWeight: 900, letterSpacing: '.06em', color: tone, fontFamily: numFont }}>{BRAND[r.sport].name}</span>
                {mine
                  ? <Tap onClick={() => onName({ pid: r.pid, name: r.name, team: r.team })}><b style={{ color: C.text, fontSize: 12.5 }}>{r.name}</b></Tap>
                  : <a className="tap-link" href={playerHref(r.sport, r.pid)} style={{ color: C.text, fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>{r.name}</a>}
                {entry ? <InjuryChip entry={entry} C={C} font={numFont} size={9} /> : null}
                <TeamTap abbr={r.team} sport={r.sport} px={14} />
                {r.game ? <Tap onClick={() => setF('gm', gm ? '' : `${r.sport}|${r.game}`)}><span title={gm ? 'Show every game again' : 'Show only this game'} style={{ fontSize: 10.5, color: C.text3 }}>{r.game}{r.gameDate !== today ? ` · ${weekday(r.gameDate)}` : ''}</span></Tap> : null}
                {strength >= 2 ? <b style={{ fontSize: 11, color: accent, fontFamily: numFont }}>{strength}×</b> : null}
                <span style={{ flexBasis: '100%', fontSize: 11, color: C.text2, fontFamily: numFont }}>
                  {shown.length ? shown.map((k, i) => {
                    const raw = AX_RAW[k](r); const on = Number(r.axes[k]) === Number(target)
                    return <span key={k} title={AX_WHY[k](r)}>{i ? ' · ' : ''}{AX_LABEL[k](r)} {raw != null ? <>{raw}→</> : null}<b style={{ color: on ? accent : C.text2 }}>{r.axes[k]}</b></span>
                  }) : <span style={{ color: C.text3 }}>none of his numbers on {target}</span>}
                  {!root && full ? <span style={{ color: C.text3 }}> · his game&apos;s number {r.dateRoot}</span> : null}
                </span>
              </div>
            )
          })}
          {!list.length ? <div style={{ fontSize: 11, color: C.text3, paddingTop: 6 }}>{needle ? 'Nobody in today’s games matches that.' : root ? `Nobody today carries ${root} with these filters.` : 'Nobody lines up twice yet. Rosters fill in as games post.'}</div> : null}
          <ShowMoreButton open={pv.open} restN={pv.restN} toggle={pv.toggle} itemWord="players" />
        </section>
      ) : null}
    </>
  )
}
