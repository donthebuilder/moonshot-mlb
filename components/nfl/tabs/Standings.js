'use client'
import { useEffect, useState } from 'react'
import PageHeader from '../../PageHeader'
import NflTeamMark from '../NflTeamMark'
import { C, NUM_FONT } from '../../../lib/nfl/theme'
import { fetchNflStandings } from '../../../lib/nfl/standings'

// 🏈 STANDINGS (2026-09-26, shell-parity step 3) -- the slot LAMP's bar has
// and TUDDY's didn't. Tables lead: one per division, the feed's own order,
// every column the feed publishes for a standings line. No logos and no
// other site's names on the page (Donovan): the team is TUDDY's own text
// mark, and the source line names the kind of feed, not a brand.
// Data: lib/nfl/standings.js (public feed, read in the browser, 10 min).
const COLS = [
  ['W', (t) => t.w], ['L', (t) => t.l], ['T', (t) => t.t],
  ['PCT', (t) => (t.pct == null ? '—' : t.pct.toFixed(3).replace(/^0/, ''))],
  ['PF', (t) => t.pf], ['PA', (t) => t.pa],
  ['DIFF', (t) => (t.diff == null ? '—' : t.diff > 0 ? `+${t.diff}` : String(t.diff))],
  ['HOME', (t) => t.home || '—'], ['ROAD', (t) => t.road || '—'],
  ['DIV', (t) => t.div || '—'], ['CONF', (t) => t.conf || '—'], ['STRK', (t) => t.strk || '—'],
]

export default function Standings({ onOpenTeam }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let alive = true
    fetchNflStandings().then((d) => { if (alive) { setData(d); setError(null) } }).catch((e) => { if (alive) setError(e) })
    return () => { alive = false }
  }, [])
  const teams = (data?.conferences || []).flatMap((c) => c.divisions.flatMap((d) => d.teams))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader
        eyebrow="TUDDY · STANDINGS"
        title="NFL standings"
        note="Every division, in the order the feed publishes it: record, points for and against, home and road, division and conference records, streak. Nothing here is a TUDDY score."
        theme={C} numFont={NUM_FONT} accent={C.cyan}
        stats={data ? [{ value: teams.length, label: 'TEAMS', tone: C.text2 }, { value: (data.conferences || []).reduce((n, c) => n + c.divisions.length, 0), label: 'DIVISIONS', tone: C.text2 }] : null}
      />
      {error ? (
        <div role="status" style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.amber || C.border2}`, color: C.text2, fontSize: 12 }}>
          <b style={{ fontFamily: NUM_FONT }}>LIVE DATA DELAYED</b> · The standings feed didn’t answer. Try again in a minute.
        </div>
      ) : null}
      {!data && !error ? <div style={{ color: C.text3, fontSize: 11, fontFamily: NUM_FONT }}>Loading the standings…</div> : null}
      {(data?.conferences || []).map((conf) => (
        <section key={conf.name} aria-label={conf.name} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {conf.divisions.map((div) => (
            <div key={div.name}>
              <div style={{ color: C.text3, font: `900 9px/1 ${NUM_FONT}`, letterSpacing: '.14em', margin: '4px 0 6px' }}>{div.name.toUpperCase()}</div>
              {/* Wide on a phone: the table scrolls inside its box, never the page. */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr>
                    <th style={th}>TEAM</th>
                    {COLS.map(([h]) => <th key={h} style={{ ...th, textAlign: 'right' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {div.teams.map((t) => (
                      <tr key={t.abbr} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          <button type="button" onClick={() => onOpenTeam?.(t.abbr)} title={`${t.place} ${t.nickname} — open their players`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: C.text, font: 'inherit' }}>
                            <NflTeamMark abbr={t.abbr} />
                            <span style={{ fontWeight: 700 }}>{t.nickname}</span>
                          </button>
                        </td>
                        {COLS.map(([h, f]) => <td key={h} style={{ ...td, textAlign: 'right', fontFamily: NUM_FONT, color: h === 'W' ? C.text : C.text2, fontWeight: h === 'W' ? 800 : 400 }}>{f(t) ?? '—'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      ))}
      <div style={{ color: C.text3, fontSize: 10, fontFamily: NUM_FONT, lineHeight: 1.5 }}>
        Source: the public NFL standings feed, read in your browser, refreshed every ten minutes. Order and records as published.
      </div>
    </div>
  )
}

const th = { padding: '0 8px 6px', color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.12em', textAlign: 'left', whiteSpace: 'nowrap' }
const td = { padding: '7px 8px', verticalAlign: 'middle' }
