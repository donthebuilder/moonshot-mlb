// /nhl/goalies — NHL goalie leaders and every goalie on a roster, server-
// rendered for search (Batch 6 follow-up, 2026-09-26). Leaders lead: a list
// of names alone would be a thin page. Same reads as LAMP's Leaders and
// Goalies tabs (lib/nhl/readers.js).
import StaticPage, { kicker, table, th, td, more, playerHref, teamHref, linkStyle } from '../../../components/lamp/StaticPage'
import LeaderList from '../../../components/lamp/LeaderList'
import { readLeaders, readRosters } from '../../../lib/nhl/readers'
import { fmtDay, fmt2, fmtPct3 } from '../../../lib/nhl/format'
import { pageTitle } from '../../../lib/routes'
import { C, NUM_FONT } from '../../../lib/nhl/theme'

export const revalidate = 600

export const metadata = {
  title: pageTitle('nhl', 'goalies'),
  description: 'NHL goalie leaders — wins, save percentage, goals-against average and shutouts, ten deep, straight from the league — and every goalie on a current roster, by club.',
  alternates: { canonical: '/nhl/goalies' },
}

const GOALIE = [
  ['wins', 'WINS', (v) => v], ['savePctg', 'SAVE %', fmtPct3],
  ['goalsAgainstAverage', 'GOALS-AGAINST AVERAGE', fmt2], ['shutouts', 'SHUTOUTS', (v) => v],
]

export default async function Page() {
  const [leaders, rosters] = await Promise.all([readLeaders().catch(() => null), readRosters().catch(() => null)])
  const gl = leaders?.goalies || {}
  const goalies = (rosters?.players || []).filter((p) => p.group === 'goalies')
    .sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name))
  return (
    <StaticPage here="/nhl/goalies" eyebrow={`LAMP · NHL GOALIES${leaders?.seasonLabel ? ` · ${leaders.seasonLabel}` : ''}`} h1="NHL goalies"
      lede="The league’s goalie leaders — wins, save percentage, goals-against average and shutouts, regular season — and every goalie on a current roster, camp invites included."
      appHref="/app#sport=nhl&tab=goalies" appLabel="Open Goalies in LAMP"
      source="Source: NHL goalie-stats-leaders/{season}/2 and roster/{team}/current, refreshed every ten minutes.">
      {!leaders ? <p style={{ color: C.amber }}>The league’s leaders feed didn’t answer. The same tables are in LAMP, one tap above.</p> : null}
      {leaders?.stale ? <p style={{ color: C.amber, fontSize: 12.5 }}>{leaders.seasonLabel} leaders — the new season’s have no games yet{leaders.opens ? ` (it opens ${fmtDay(leaders.opens)})` : ''}.</p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '4px 22px' }}>
        {GOALIE.map(([k, title, fmt]) => <LeaderList key={k} title={title} rows={gl[k]} fmt={fmt} />)}
      </div>
      {goalies.length ? (
        <section aria-label="Every goalie on a roster">
          <h2 style={kicker}>EVERY GOALIE ON A ROSTER · {goalies.length}</h2>
          <details>
            <summary style={more}>Show all {goalies.length}, by club</summary>
            <table style={table}>
              <thead><tr><th style={th}>CLUB</th><th style={th}>#</th><th style={th}>GOALIE</th></tr></thead>
              <tbody>
                {goalies.map((g) => (
                  <tr key={g.id}>
                    <td style={{ ...td, fontFamily: NUM_FONT, fontSize: 11 }}><a href={teamHref(g.team)} style={{ color: C.text3, textDecoration: 'none' }}>{g.team}</a></td>
                    <td style={{ ...td, fontFamily: NUM_FONT, color: C.text3, fontSize: 11 }}>{g.number ?? ''}</td>
                    <td style={td}><a href={playerHref(g.id)} style={linkStyle}>{g.name}</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      ) : null}
    </StaticPage>
  )
}
