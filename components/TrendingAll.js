'use client'
import { useMemo, useState } from 'react'
import SlipPlus from './SlipPlus'
import { flatChip, FLAT_CHIP_CLASS } from '../lib/chips'
import { useLiveFetch } from '../lib/useLiveFetch'
import { trending, HR_THIN } from '../lib/hitRater'
import { fmtOdds } from '../lib/odds'
import { BRAND, playerHref } from '../lib/routes'
import { SPORT_ACCENT } from '../lib/sportAccent'
import { usePreview, ShowMoreButton } from './ListPreview'

// 🔥 TRENDING · ALL SPORTS (2026-10-25, Donovan: "look at all the sports and show what's trending"; "5 good props from different
// sports"). The network's Hit Rater rows in one list (/api/trending: BUCKETS + TUDDY today; LAMP when its box table exists),
// sorted the Trending way (lib/hitRater.js). The product's own page hosts it (its theme, its table skin = `Table`); each row says
// its product in that product's accent and its "+" goes to THAT product's slip. Percent first, the count small under it.

export default function TrendingAll({ C, NUM_FONT, accent, Table }) {
  const { data, loading } = useLiveFetch('/api/trending')
  const [hot, setHot] = useState(false)
  const rows = useMemo(() => {
    const ranked = trending(data?.rows || [], { minN: HR_THIN, take: 9999 })
    return (hot ? ranked.filter((r) => (r.own.L10?.pct ?? 0) >= 70) : ranked).map((r) => ({
      _key: `${r.sport}:${r.key}`, _raw: r, name: r.name, product: BRAND[r.sport]?.name || r.sport, prop: `${r.word} o${r.line}`,
      l10: r.own.L10?.pct ?? null, l5: r.own.L5?.pct ?? null, season: r.own.Season?.pct ?? null, price: r.odds,
    }))
  }, [data, hot])
  const pv = usePreview(rows, 25)
  const pct = (k) => (v, r) => {
    const c = r._raw.own[k]
    return !c || !c.n ? '—' : (
      <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.15 }}>
        <span>{c.pct}%</span><span style={{ font: `600 10px/1.1 ${NUM_FONT}`, color: C.text3 }}>{`${c.ok}/${c.n}`}</span>
      </span>
    )
  }
  const columns = [
    // the product rides under the name, in its own accent (a separate Sport column is folded into the name cell by the table skin)
    { key: 'name', label: 'Player', group: 'Player', w: 140, sticky: true, bold: true, numeric: false, heat: false, link: (r) => () => window.location.assign(playerHref(r.sport, r.id)),
      fmt: (v, r) => <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.2 }}><span>{v}</span><span style={{ font: `800 9px/1.2 ${NUM_FONT}`, letterSpacing: '.08em', color: SPORT_ACCENT[r._raw.sport] }}>{r.product}</span></span> },
    { key: 'prop', label: 'Prop', group: 'Tonight', w: 110, numeric: false, heat: false, mono: true },
    { key: 'l10', label: 'L10', group: 'Over the line', w: 52, fmt: pct('L10'), primary: true },
    { key: 'l5', label: 'L5', group: 'Over the line', w: 52, fmt: pct('L5') },
    { key: 'season', label: 'LONG RUN', group: 'Over the line', w: 64, fmt: pct('Season'), title: 'Every game on file: since last season (BUCKETS) or since 2025 (TUDDY)' },
    { key: 'price', label: 'PRICE', group: 'Book', w: 62, heat: false, mono: true, fmt: (v) => (v == null ? '—' : fmtOdds(v)) },
    { key: 'slip', label: '', group: 'Book', w: 48, heat: false, numeric: false, fmt: (v, r) => {
      const x = r._raw
      return <SlipPlus sport={x.sport} C={C} NUM_FONT={NUM_FONT} accent={SPORT_ACCENT[x.sport] || accent}
        leg={{ key: `${x.id}|${x.lane}|o${x.line}`, id: String(x.id), name: x.name, team: x.team, market: x.word, line: `o${x.line}`, side: 'over', price: x.odds, game: null }} />
    } },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      <div role="group" aria-label="Sport" className="chip-row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className={FLAT_CHIP_CLASS} aria-pressed={hot} onClick={() => setHot((v) => !v)} title="L10 at 70% or better" style={flatChip(hot, accent, C, NUM_FONT)}>{hot ? '✓ 70%+ L10' : '70%+ L10'}</button>
      </div>
      {loading && !data ? <div style={{ fontSize: 12, color: C.text3 }}>Reading every product’s lines…</div> : null}
      {data && !rows.length ? <div style={{ fontSize: 12, color: C.text3 }}>No lines on file for a game that has not started.</div> : null}
      {rows.length ? (
        <>
          <div style={{ font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: C.text3 }}>{rows.length} PROPS · EVERY SPORT · L10 FIRST</div>
          <Table rows={pv.shown} columns={columns} maxHeight={9999} maxRows={rows.length} heatMode="standouts" initialSort={null} />
          <ShowMoreButton open={pv.open} restN={pv.restN} toggle={pv.toggle} total={pv.total} itemWord="props" />
          <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.5 }}>% = games he went over tonight’s line; small = the count. + goes to that sport’s slip.</div>
        </>
      ) : null}
    </div>
  )
}
