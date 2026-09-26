// /nhl/leaders — NHL skater leaders, server-rendered for search (Batch 6
// follow-up, 2026-09-26). Same read as LAMP's Leaders tab
// (lib/nhl/readers.js readLeaders); goalies have their own page.
import StaticPage from '../../../components/lamp/StaticPage'
import LeaderList from '../../../components/lamp/LeaderList'
import { readLeaders } from '../../../lib/nhl/readers'
import { fmtDay, fmtSec, plusMinus } from '../../../lib/nhl/format'
import { pageTitle } from '../../../lib/routes'
import { C } from '../../../lib/nhl/theme'

export const revalidate = 600

export const metadata = {
  title: pageTitle('nhl', 'leaders'),
  description: 'NHL goal, point and assist leaders for the season, ten deep in every category, straight from the league — plus plus/minus, ice time, faceoffs and penalty minutes.',
  alternates: { canonical: '/nhl/leaders' },
}

// Goals first: it's the question people search, and LAMP's own.
const SKATER = [
  ['goals', 'GOALS', (v) => v], ['points', 'POINTS', (v) => v], ['assists', 'ASSISTS', (v) => v],
  ['plusMinus', 'PLUS / MINUS', plusMinus], ['toi', 'TIME ON ICE PER GAME', fmtSec],
  ['faceoffLeaders', 'FACEOFF %', (v) => `${(v * 100).toFixed(1)}%`], ['penaltyMins', 'PENALTY MINUTES', (v) => v],
]

export default async function Page() {
  const data = await readLeaders().catch(() => null)
  const sk = data?.skaters || {}
  return (
    <StaticPage here="/nhl/leaders" eyebrow={`LAMP · NHL LEADERS${data?.seasonLabel ? ` · ${data.seasonLabel}` : ''}`} h1="NHL goal leaders"
      lede="Who leads the league in goals, points and assists — regular season, ten deep in each category, straight from the league. Measured, not modelled: nothing here is a LAMP score."
      appHref="/app#sport=nhl&tab=leaders" appLabel="Open Leaders in LAMP"
      source="Source: NHL skater-stats-leaders/{season}/2 (regular season), refreshed every ten minutes.">
      {!data ? <p style={{ color: C.amber }}>The league’s leaders feed didn’t answer. The same table is in LAMP, one tap above.</p> : null}
      {data?.stale ? <p style={{ color: C.amber, fontSize: 12.5 }}>{data.seasonLabel} leaders — the new season’s have no games yet{data.opens ? ` (it opens ${fmtDay(data.opens)})` : ''}.</p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '4px 22px' }}>
        {SKATER.map(([k, title, fmt]) => <LeaderList key={k} title={title} rows={sk[k]} fmt={fmt} />)}
      </div>
      <p style={{ marginTop: 18, fontSize: 12.5 }}><a href="/nhl/goalies" style={{ color: C.ice }}>Goalie leaders — wins, save %, GAA, shutouts →</a></p>
    </StaticPage>
  )
}
