'use client'
import { useState } from 'react'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampLeaders } from '../../../lib/nhl/useLamp'
import { EmptyState, DelayedBanner, Loading, SourceLine, Kicker, Pills, PlayerMark, StaleSeasonNote, fmtPct3, fmt2, fmtSec, plusMinus } from '../ui'

// 🏒 LEADERS — who leads the league, measured by the league. Regular
// season, ten deep per category, no model score anywhere on this page
// (the same sentence TUDDY's Leaders carries). Skaters and goalies are two
// views because they are two different games.
const SKATER = [
  ['points', 'POINTS', (v) => v], ['goals', 'GOALS', (v) => v], ['assists', 'ASSISTS', (v) => v],
  ['plusMinus', '+/-', plusMinus], ['toi', 'TIME ON ICE', fmtSec], ['faceoffLeaders', 'FACEOFF %', (v) => `${(v * 100).toFixed(1)}%`], ['penaltyMins', 'PENALTY MIN', (v) => v],
]
const GOALIE = [
  ['wins', 'WINS', (v) => v], ['savePctg', 'SAVE %', fmtPct3], ['goalsAgainstAverage', 'GAA', fmt2], ['shutouts', 'SHUTOUTS', (v) => v],
]

export default function Leaders({ onOpenPlayer, onOpenTeam }) {
  const [view, setView] = useState('skaters')
  const { data, error, loading } = useLampLeaders()
  const cats = view === 'skaters' ? SKATER : GOALIE
  const table = data?.[view] || {}
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader eyebrow="LAMP · LEADERS" title={data?.seasonLabel ? `${data.seasonLabel} leaders` : 'League leaders'}
        note="Regular season, ten deep in each category, straight from the league. Measured, not modelled: nothing on this page is a LAMP score." theme={C} numFont={NUM_FONT} accent={C.ice} />
      {/* Under the header, not in it: the header's right side hides on a phone. */}
      <Pills ariaLabel="Skaters or goalies" value={view} onChange={setView} options={[{ key: 'skaters', text: 'SKATERS' }, { key: 'goalies', text: 'GOALIES' }]} />
      {data?.stale && <StaleSeasonNote label={data.seasonLabel} opens={data.opens} what="leaders" />}
      <DelayedBanner error={error} what="the league’s leaders feed" />
      {loading && !data ? <Loading what="the leaders" /> : null}
      {!loading && data && !Object.keys(table).length && <EmptyState title="NO LEADERS YET" note="The league publishes leaders once games have been played." />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {cats.filter(([k]) => table[k]?.length).map(([k, title, fmt]) => (
          <section key={k} aria-label={title}>
            <Kicker>{title}</Kicker>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {table[k].map((r) => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ ...td, width: 22, fontFamily: NUM_FONT, color: C.text3, fontSize: 10 }}>{r.rank}</td>
                    <td style={td}><PlayerMark headshot={r.headshot} name={r.name} onClick={() => onOpenPlayer?.(r.id)} /></td>
                    <td style={{ ...td, fontFamily: NUM_FONT, fontSize: 10, color: C.text3, whiteSpace: 'nowrap' }}>
                      <button type="button" onClick={() => onOpenTeam?.(r.team)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: C.text3, font: 'inherit' }}>{r.team}</button>
                      {' '}<span className="sm-hide">{r.pos}</span>
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: NUM_FONT, fontWeight: 900, color: r.rank === 1 ? C.ice : C.text }}>{fmt(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
      <SourceLine>Source: NHL skater-stats-leaders and goalie-stats-leaders/{'{season}'}/2 via /api/lamp/leaders, cached ten minutes. The season shown is the newest one with games in it.</SourceLine>
    </div>
  )
}
const td = { padding: '7px 6px', verticalAlign: 'middle' }
