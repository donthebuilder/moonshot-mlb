// /nhl/standings — the NHL standings by division, server-rendered for
// search (Batch 6 follow-up, 2026-09-26). Same read and the same season
// labelling as LAMP's Standings tab (lib/nhl/readers.js readStandings): in
// preseason the rows are LAST season's final table and the page says so
// before the table. Order is the league's own (divisionSequence), never
// re-sorted here.
import StaticPage, { kicker, table, th, td, num, teamHref, linkStyle } from '../../../components/lamp/StaticPage'
import { readStandings } from '../../../lib/nhl/readers'
import { fmtDay } from '../../../lib/nhl/format'
import { pageTitle } from '../../../lib/routes'
import { C, NUM_FONT } from '../../../lib/nhl/theme'

export const revalidate = 600

export const metadata = {
  title: pageTitle('nhl', 'standings'),
  description: 'NHL standings by division — games, wins, losses, overtime losses, points, point percentage, goal differential, last ten and streak — in the league’s own order.',
  alternates: { canonical: '/nhl/standings' },
}

const DIVS = ['Atlantic', 'Metropolitan', 'Central', 'Pacific']
const rec = (r) => (r && r.w != null ? `${r.w}-${r.l}-${r.otl}` : '—')
const COLS = [
  ['GP', (r) => r.gp], ['W', (r) => r.w], ['L', (r) => r.l], ['OTL', (r) => r.otl], ['PTS', (r) => r.pts],
  ['P%', (r) => (r.pPct == null ? '—' : r.pPct.toFixed(3).replace(/^0/, ''))], ['RW', (r) => r.rw], ['ROW', (r) => r.row],
  ['GF', (r) => r.gf], ['GA', (r) => r.ga], ['DIFF', (r) => (r.diff == null ? '—' : r.diff > 0 ? `+${r.diff}` : String(r.diff))],
  ['L10', (r) => rec(r.l10)], ['STRK', (r) => r.streak || '—'], ['HOME', (r) => rec(r.home)], ['ROAD', (r) => rec(r.road)],
]

export default async function Page() {
  const data = await readStandings().catch(() => null)
  const rows = data?.rows || []
  const opens = data?.current?.standingsStart
  return (
    <StaticPage here="/nhl/standings" eyebrow={`LAMP · NHL STANDINGS${data?.seasonLabel ? ` · ${data.seasonLabel}` : ''}`} h1="NHL standings"
      lede="Every division, in the league’s own order: points, then regulation wins, then regulation-plus-overtime wins."
      appHref="/app#sport=nhl&tab=standings" appLabel="Open Standings in LAMP (wild card, conference, league)"
      source="Source: NHL standings/now and standings-season, refreshed every ten minutes. Season and as-of date are the feed’s own.">
      {!data ? <p style={{ color: C.amber }}>The league’s standings feed didn’t answer. The same table is in LAMP, one tap above.</p> : null}
      {data?.stale ? (
        <p role="status" style={{ padding: '10px 12px', border: `1px solid ${C.amber}`, borderRadius: 10, color: C.text2, fontSize: 12.5, lineHeight: 1.5 }}>
          <b style={{ color: C.amber, fontFamily: NUM_FONT }}>{data.seasonLabel} FINAL TABLE</b> · This is how last season ended.{' '}
          {opens ? `The new table opens ${fmtDay(opens)}, when the regular season starts.` : 'The new season’s table starts with its first regular-season game.'}
        </p>
      ) : null}
      {data?.date ? <p style={{ color: C.text3, font: `11px/1 ${NUM_FONT}` }}>As of {fmtDay(data.date)}</p> : null}
      {DIVS.map((d) => {
        const div = rows.filter((r) => r.divName === d).sort((a, b) => (a.divRank ?? 99) - (b.divRank ?? 99))
        if (!div.length) return null
        return (
          <section key={d} aria-label={`${d} division`}>
            <h2 style={kicker}>{d.toUpperCase()} DIVISION</h2>
            {/* Wide on a phone: the table scrolls inside its box, never the page. */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ ...table, minWidth: 720 }}>
                <thead><tr><th style={th}>#</th><th style={th}>TEAM</th>{COLS.map(([h]) => <th key={h} style={{ ...th, textAlign: 'right' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {div.map((r) => (
                    <tr key={r.abbrev}>
                      <td style={{ ...td, fontFamily: NUM_FONT, color: C.text3, fontSize: 10.5 }}>{r.divRank}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}><a href={teamHref(r.abbrev)} style={linkStyle}><b>{r.abbrev}</b> {r.nickname}</a>{r.clinch ? <span style={{ color: C.text3 }}> ({r.clinch})</span> : null}</td>
                      {COLS.map(([h, f]) => <td key={h} style={{ ...num, fontWeight: h === 'PTS' ? 900 : 400 }}>{f(r) ?? '—'}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </StaticPage>
  )
}
