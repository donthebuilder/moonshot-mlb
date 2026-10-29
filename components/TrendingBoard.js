'use client'
import { useEffect, useMemo, useState } from 'react'
import SlipPlus from './SlipPlus'
import PageHeader from './PageHeader'
import FiltersDrawer, { DrawerSection, drawerChip } from './FiltersDrawer'
import { flatChip, FLAT_CHIP_CLASS, chipSelect, chipCaret } from '../lib/chips'
import { useLiveFetch } from '../lib/useLiveFetch'
import { fmtOdds } from '../lib/odds'
import { BRAND, playerHref } from '../lib/routes'
import { SPORT_ACCENT } from '../lib/sportAccent'
import { readParam, writeParam } from '../lib/useShellRoute'
import { usePreview, ShowMoreButton } from './ListPreview'
import { SPORTS, WINDOWS, BARS, MIN_GAMES, defaults, filterRows, sortRows, propOptions, teamOptions, gameOptions, sportCounts, fromParams, toParams, describe } from '../lib/trendingFilters'

// 🔥 ONE TRENDING PAGE FOR EVERY PRODUCT (2026-10-25; BUCKETS' page, made shared when LAMP got its own). 2026-10-26 (Donovan: "the trending
// tab can use more filters ... especially when you add the other sports ... toggle only a couple sports"): ONE page, sports on and off
// (any mix), and the filters that make a list of every prop on the network usable: prop type, hit-rate bar on the window you pick, price,
// home / away, team, game, name. Each product's Trending tab opens it set to that product (`sport`).
// Data: /api/trending (every product's Hit Rater rows, held 15 minutes at the edge) read ONCE; every filter runs in the page
// (lib/trendingFilters.js), so no filter costs a request. The one exception: a product-only filter (BUCKETS minutes / shots, LAMP ice time)
// asks that product's own route, and only while that product is the only sport on. The view rides the address (tr_*), so a link opens
// the same view and Back returns to it. A hit rate counts games that happened; nothing here is a chance (no implied %).

const PREFIX = 'tr_'
const readP = (k) => readParam(`${PREFIX}${k}`)
// one price band per chip (American odds, read in the order a bettor means: -200 is shorter than +100)
// [chip label, band, the short word the removable chip wears]
const PRICES = [['Any price', null, 'Any'], ['Favorites −200 to even', [-200, 100], '−200 to even'], ['Plus money +100 to +300', [100, 300], '+100 to +300'], ['Long shots +300 up', [300, 10000], '+300 up']]
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export default function TrendingBoard({ sport, C, NUM_FONT, accent, Table, onOpenPlayer = null, product = null, eyebrow, emptyNote }) {
  // product = { route, filters: [{ param, pills: [[value, label]], note(v) }], sinceLabel? } -- that product's own route and filters, for its sport only
  const base = useMemo(() => defaults([sport]), [sport])
  const [f, setF] = useState(() => fromParams(readP, base))
  const [picked, setPicked] = useState({})   // a product's own filter: param -> value
  const [findOpen, setFindOpen] = useState(false)
  const set = (patch) => setF((x) => ({ ...x, ...patch }))

  // the address carries the view; leaving the page takes it off again (the next tab starts clean)
  useEffect(() => {
    const p = toParams(f, base)
    for (const [k, v] of Object.entries(p)) { if ((readP(k) || null) !== (v || null)) writeParam(`${PREFIX}${k}`, v) }
  }, [f, base])
  useEffect(() => () => { for (const k of ['sp', 'prop', 'bar', 'win', 'price', 'min', 'ha', 'q', 'team', 'game']) { if (readP(k)) writeParam(`${PREFIX}${k}`, null) } }, [])

  const all = useLiveFetch('/api/trending', { keep: 'trending:all' })
  const own = product && f.sports.length === 1 && f.sports[0] === sport
  const ownQs = own ? new URLSearchParams(Object.fromEntries(Object.entries(picked).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))).toString() : ''
  const prod = useLiveFetch(`${product?.route || ''}${ownQs ? `?${ownQs}` : ''}`, { keep: `trending:${sport}`, enabled: Boolean(product && own && ownQs) })
  const fromProduct = own && ownQs
  const loading = fromProduct ? prod.loading && !prod.data : all.loading && !all.data
  const rawRows = fromProduct ? prod.data?.rows || [] : all.data?.rows || []
  const counts = useMemo(() => sportCounts(all.data?.rows || []), [all.data])

  const rows = useMemo(() => sortRows(filterRows(rawRows, f), f.win), [rawRows, f])
  const pool = useMemo(() => filterRows(rawRows, { ...defaults(f.sports), win: f.win, minN: f.minN }), [rawRows, f.sports, f.win, f.minN])
  const props = useMemo(() => propOptions(rawRows, f.sports), [rawRows, f.sports])
  const teams = useMemo(() => teamOptions(rawRows, f.sports), [rawRows, f.sports])
  const games = useMemo(() => gameOptions(rawRows, f.sports), [rawRows, f.sports])
  const pv = usePreview(rows, 25)
  const names = Object.fromEntries(SPORTS.map((s) => [s, BRAND[s]?.name || s.toUpperCase()]))
  const winLabel = (WINDOWS.find(([k]) => k === f.win) || [])[1]
  const many = f.sports.length > 1

  const toggleSport = (s) => setF((x) => {
    const on = x.sports.includes(s)
    if (on && x.sports.length === 1) return x   // one stays on
    const sports = on ? x.sports.filter((y) => y !== s) : SPORTS.filter((y) => y === s || x.sports.includes(y))
    // a prop / team / game from a sport that is no longer on cannot stay chosen
    return { ...x, sports, props: [], team: '', game: '' }
  })
  const toggleProp = (w) => set({ props: f.props.includes(w) ? f.props.filter((x) => x !== w) : [...f.props, w] })
  const resetAll = () => { setF(base); setPicked({}) }

  const accentOf = (s) => SPORT_ACCENT[s] || accent
  const chip = (on, a = accent) => flatChip(on, a, C, NUM_FONT)
  const pctCell = (c) => (!c || !c.n ? '—' : (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.15 }}>
      <span>{c.pct}%</span><span style={{ font: `600 10px/1.1 ${NUM_FONT}`, color: C.text3 }}>{`${c.ok}/${c.n}`}</span>
    </span>
  ))
  const open = (r) => {
    if (r.sport === sport && onOpenPlayer) onOpenPlayer(r.id, r._raw?.lane, r._raw)
    else window.location.assign(playerHref(r.sport, r.id))
  }
  const tableRows = useMemo(() => pv.shown.map((r) => ({
    _key: `${r.sport}:${r.key}`, _raw: r, sport: r.sport, id: r.id, name: r.name, team: r.team, prop: `${r.word} o${r.line}`,
    l5: r.own.L5?.pct ?? null, l10: r.own.L10?.pct ?? null, l20: r.own.L20?.pct ?? null, season: r.own.Season?.pct ?? null,
    ha: r.own.HA?.pct ?? null, h2h: r.own.H2H?.pct ?? null, dL10: r.dvp?.L10?.pct ?? null, dSeason: r.dvp?.Season?.pct ?? null, avg: r.avg, price: r.odds,
  })), [pv.shown])
  const cell = (k) => (v, r) => pctCell(r._raw.own[k])
  const dcell = (k) => (v, r) => pctCell(r._raw.dvp?.[k])
  const columns = [
    { key: 'name', label: 'Player', group: 'Player', w: 140, sticky: true, bold: true, numeric: false, heat: false, link: (r) => () => open(r),
      // more than one sport on: the product rides under the name in its own accent
      fmt: many ? (v, r) => <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.2 }}><span>{v}</span><span style={{ font: `800 9px/1.2 ${NUM_FONT}`, letterSpacing: '.08em', color: accentOf(r.sport) }}>{names[r.sport]}{r.team ? <span style={{ color: C.text3 }}>{` · ${r.team}`}</span> : null}</span></span> : undefined },
    { key: 'prop', label: 'Prop', group: 'Tonight', w: 92, numeric: false, heat: false, mono: true },
    { key: 'price', label: 'PRICE', group: 'Tonight', w: 58, heat: false, mono: true, title: 'The best book’s over, American odds', fmt: (v) => (v == null ? '—' : fmtOdds(v)) },
    { key: 'l10', label: 'L10', group: 'Over the line', w: 52, fmt: cell('L10'), primary: f.win === 'L10' },
    { key: 'l5', label: 'L5', group: 'Over the line', w: 52, fmt: cell('L5'), primary: f.win === 'L5' },
    { key: 'l20', label: 'L20', group: 'Over the line', w: 52, fmt: cell('L20'), primary: f.win === 'L20' },
    { key: 'season', label: 'LONG RUN', group: 'Over the line', w: 64, fmt: cell('Season'), primary: f.win === 'Season', title: 'Every game on file: since last season (BUCKETS, LAMP) or since 2025 (TUDDY)' },
    { key: 'ha', label: 'HM/AW', group: 'Over the line', w: 56, fmt: cell('HA'), title: 'His games at tonight’s venue side (home or away)' },
    { key: 'h2h', label: 'H2H', group: 'Over the line', w: 52, fmt: cell('H2H'), title: 'His games against tonight’s club' },
    { key: 'dL10', label: 'D L10', group: 'Tonight’s defense', w: 56, fmt: dcell('L10'), title: 'Players at his spot against tonight’s defense: how many went over his line (last 10 games)' },
    { key: 'dSeason', label: 'D LONG', group: 'Tonight’s defense', w: 62, fmt: dcell('Season'), title: 'The same, over the long run' },
    { key: 'avg', label: 'AVG', group: 'His games', w: 48, fmt: (v) => (v == null ? '—' : v.toFixed(1)) },
    { key: 'slip', label: '', group: 'Book', w: 48, heat: false, numeric: false, fmt: (v, r) => {
      const x = r._raw
      return <SlipPlus sport={x.sport} C={C} NUM_FONT={NUM_FONT} accent={accentOf(x.sport)}
        // the BOOK's line, keyed with it: a board leg on his card (the product's own bar) is a different bet
        leg={{ key: `${x.id}|${x.lane}|o${x.line}`, id: String(x.id), name: x.name, team: x.team, market: x.word, line: `o${x.line}`, side: 'over', price: x.odds, game: null }} />
    } },
  ]

  // what narrows the list (the removable chips in the Filters bar) and how many things
  const activeFilters = [
    f.bar ? { key: 'bar', label: `${winLabel} ${f.bar}%+`, onRemove: () => set({ bar: 0 }) } : null,
    f.price ? { key: 'price', label: PRICES.find(([, v]) => same(v, f.price))?.[2] || 'Price', onRemove: () => set({ price: null }) } : null,
    f.minN !== base.minN ? { key: 'min', label: `${f.minN}+ games`, onRemove: () => set({ minN: base.minN }) } : null,
    f.ha ? { key: 'ha', label: f.ha === 'home' ? 'Home' : 'Away', onRemove: () => set({ ha: null }) } : null,
    f.win !== base.win ? { key: 'win', label: `By ${winLabel}`, onRemove: () => set({ win: base.win }) } : null,
    ...Object.entries(picked).filter(([, v]) => v != null).map(([k, v]) => ({ key: `p-${k}`, label: `${k === 'min' ? `${v}+ min` : `${v}+ ${k.toUpperCase()}`}`, onRemove: () => setPicked((p) => ({ ...p, [k]: null })) })),
  ].filter(Boolean)
  const narrowed = activeFilters.length + f.props.length + (f.q ? 1 : 0) + (f.team ? 1 : 0) + (f.game ? 1 : 0)
  const sel = { ...chipSelect(Boolean(f.team), accent, C, NUM_FONT), width: '100%' }
  const noRows = !loading && !rows.length
  const findOn = findOpen || Boolean(f.q || f.team || f.game)
  const findBtn = <button type="button" className={FLAT_CHIP_CLASS} aria-pressed={findOn} onClick={() => setFindOpen((v) => !v)} style={chip(findOn)}>🔎 Find</button>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      <PageHeader eyebrow={eyebrow} title="Trending" theme={C} numFont={NUM_FONT} accent={accent}
        note="Tonight’s lines that keep clearing. Pick your sports, narrow it down, tap + to build a slip." />

      <div role="group" aria-label="Sports" className="chip-row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {SPORTS.map((s) => {
          const n = counts[s] || 0
          const dead = Boolean(all.data) && !n && s !== sport   // not 'no lines' until the read has landed
          return (
            <button key={s} type="button" className={FLAT_CHIP_CLASS} aria-pressed={f.sports.includes(s)} disabled={dead && !f.sports.includes(s)} onClick={() => toggleSport(s)}
              title={s === 'mlb' ? 'MOONSHOT’s hit rates come back in the spring' : dead ? 'No lines on file for a game that has not started' : undefined}
              style={chip(f.sports.includes(s), accentOf(s))}>
              {names[s]}{n ? <span style={{ opacity: 0.65 }}> {n}</span> : null}
            </button>
          )
        })}
      </div>

      {/* Find leads the prop chips: it used to take a whole row of its own on a phone, and at the end of a scrolling row it would be out of sight */}
      <div role="group" aria-label="Prop" className="chip-row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {findBtn}
        {props.length > 1 ? (
          <>
            <button type="button" className={FLAT_CHIP_CLASS} aria-pressed={!f.props.length} onClick={() => set({ props: [] })} style={chip(!f.props.length)}>All</button>
            {props.map(({ word }) => (
              <button key={word} type="button" className={FLAT_CHIP_CLASS} aria-pressed={f.props.includes(word)} onClick={() => toggleProp(word)} style={chip(f.props.includes(word))}>{word}</button>
            ))}
          </>
        ) : null}
      </div>

      <FiltersDrawer compact active={narrowed > 0} activeCount={narrowed} activeFilters={activeFilters} reset={resetAll} shown={rows.length} total={pool.length}
        accent={accent} accentInk={C.bg} poolTitle="Props that clear the filters, out of every prop with enough games in the window you picked."
        emptyNote="Nothing clears every filter at once. Loosen one."
        >
        <DrawerSection label="Hit-rate bar" hint="The window you pick below decides which column the bar reads and the list sorts on.">
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {BARS.map((b) => <button key={b} type="button" onClick={() => set({ bar: b })} style={drawerChip(f.bar === b)}>{b ? `${b}%+` : 'Any'}</button>)}
          </div>
        </DrawerSection>
        <DrawerSection label="Window">
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {WINDOWS.map(([k, l]) => <button key={k} type="button" onClick={() => set({ win: k })} style={drawerChip(f.win === k)}>{l}</button>)}
          </div>
        </DrawerSection>
        <DrawerSection label="Price" hint="The best book's over, American odds. A prop with no price is left out while a band is on.">
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {PRICES.map(([l, v]) => <button key={l} type="button" onClick={() => set({ price: v })} style={drawerChip(same(v, f.price))}>{l}</button>)}
          </div>
        </DrawerSection>
        <DrawerSection label="Games in the window" hint="A hit rate over fewer games than this is left out.">
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {MIN_GAMES.map((n) => <button key={n} type="button" onClick={() => set({ minN: n })} style={drawerChip(f.minN === n)}>{n}+</button>)}
          </div>
        </DrawerSection>
        <DrawerSection label="Home or away" hint="Only props whose game is at that venue side tonight.">
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {[[null, 'Either'], ['home', 'Home'], ['away', 'Away']].map(([v, l]) => <button key={l} type="button" onClick={() => set({ ha: v })} style={drawerChip(f.ha === v)}>{l}</button>)}
          </div>
        </DrawerSection>
        {own ? product.filters.map((pf) => (
          <DrawerSection key={pf.param} label={pf.label || pf.param} hint="Counts only the games that clear it, his and the defense's.">
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
              {pf.pills.map(([v, l]) => <button key={l} type="button" onClick={() => setPicked((p) => ({ ...p, [pf.param]: v }))} style={drawerChip((picked[pf.param] ?? null) === v)}>{l}</button>)}
            </div>
          </DrawerSection>
        )) : null}
      </FiltersDrawer>

      {findOpen || f.q || f.team || f.game ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6, alignItems: 'center' }}>
          <input type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Player or team" aria-label="Find a player or team" autoComplete="off" autoCorrect="off" spellCheck={false}
            style={{ boxSizing: 'border-box', width: '100%', minHeight: 44, fontSize: 16, background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0 12px' }} />
          <span style={{ position: 'relative', display: 'block' }}>
            <select value={f.team} onChange={(e) => set({ team: e.target.value })} aria-label="Team" className={FLAT_CHIP_CLASS} style={sel}>
              <option value="">All teams</option>
              {teams.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <span aria-hidden="true" style={chipCaret(Boolean(f.team), accent, C)}>▾</span>
          </span>
          {games.length ? (
            <span style={{ position: 'relative', display: 'block' }}>
              <select value={f.game} onChange={(e) => set({ game: e.target.value })} aria-label="Game" className={FLAT_CHIP_CLASS} style={{ ...chipSelect(Boolean(f.game), accent, C, NUM_FONT), width: '100%' }}>
                <option value="">All games tonight</option>
                {games.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
              </select>
              <span aria-hidden="true" style={chipCaret(Boolean(f.game), accent, C)}>▾</span>
            </span>
          ) : null}
        </div>
      ) : null}

      {loading ? <div role="status" style={{ fontSize: 12, color: C.text3 }}>Reading tonight’s lines…</div> : null}
      {noRows && (all.data || fromProduct) ? (
        <div style={{ fontSize: 12, color: C.text3, padding: '12px 0', lineHeight: 1.5 }}>
          {narrowed ? 'Nothing clears every filter at once. Loosen one, or ' : (fromProduct ? prod.data?.why : all.data?.why) || emptyNote || 'No lines on file for a game that has not started.'}
          {narrowed ? <button type="button" onClick={resetAll} style={{ ...drawerChip(false), border: 'none', textDecoration: 'underline', color: C.text2, padding: 0 }}>reset them all</button> : null}
        </div>
      ) : null}
      {rows.length ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', font: `600 12px/1.4 ${NUM_FONT}`, color: C.text3 }}>
            <b style={{ color: C.text, font: `900 16px/1 ${NUM_FONT}` }}>{rows.length}</b>
            <span style={{ color: C.text2 }}>props</span>
            <span>{describe(f, names)}</span>
          </div>
          {/* sorted on the window you picked, so that column carries the full ramp (the others glow only at their top fifth) */}
          <Table key={f.win} rows={tableRows} columns={columns} maxHeight={9999} maxRows={rows.length} heatMode="standouts" initialSort={{ key: f.win === 'Season' ? 'season' : f.win.toLowerCase(), dir: 'desc' }} />
          <ShowMoreButton open={pv.open} restN={pv.restN} toggle={pv.toggle} total={pv.total} itemWord="props" />
          <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.5 }}>Sorted by {winLabel}; a hit rate over fewer than {f.minN} games is left out. % = games he went over tonight’s line; small = the count. D = players at his spot against tonight’s defense, at his line. Price = the best book over. + goes to that sport’s slip.</div>
        </>
      ) : null}
    </div>
  )
}
