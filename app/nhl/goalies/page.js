// /nhl/goalies — NHL goalie leaders and every goalie on a roster, server-
// rendered for search (Batch 6 follow-up, 2026-09-26). Leaders lead: a list
// of names alone would be a thin page. Same reads as LAMP's Leaders and
// Goalies tabs (lib/nhl/readers.js).
import StaticPage, { kicker, table, th, td, more, playerHref, teamHref } from '../../../components/lamp/StaticPage'
import LeaderList from '../../../components/lamp/LeaderList'
import GoalieGiveUps from '../../../components/lamp/GoalieGiveUps'
import { readLeaders, readRosters } from '../../../lib/nhl/readers'
import { readGoalieGiveUps } from '../../../lib/nhl/goalieZones'
import { giveUps, chooseGiveUps, GIVEUP_FLOOR } from '../../../lib/nhl/goalieGiveUps'
import { whichSeason } from '../../../lib/nhl/whichSeason'
import StaticPlayerCell from '../../../components/lamp/StaticPlayerCell'
import { fmtDay, fmt2, fmtPct3 } from '../../../lib/nhl/format'
import { pageTitle } from '../../../lib/routes'
import { C } from '../../../lib/nhl/theme'

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
  // WHO SCORES ON A GOALIE (2026-10-13): this season's table once enough goalies have faced enough goals, else the last full
  // season's, named. Hidden until the SQL has run or when the read fails: never a guess in its place.
  const who = (id) => { const g = goalies.find((x) => String(x.id) === String(id)); return g ? { name: g.name, team: g.team, photo: g.headshot || null } : null }
  const cur = await whichSeason().then((s) => s.current ?? s.id, () => null)
  const curTable = cur ? giveUps(await readGoalieGiveUps(cur).catch(() => null), who) : null
  const prevTable = cur && !(curTable?.state === 'ok' && curTable.enough >= GIVEUP_FLOOR.rows) ? giveUps(await readGoalieGiveUps(cur - 10001).catch(() => null), who) : null
  const giveUpView = chooseGiveUps(curTable, prevTable)
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
      <GoalieGiveUps view={giveUpView} />
      {goalies.length ? (
        <section aria-label="Every goalie on a roster">
          <h2 style={kicker}>EVERY GOALIE ON A ROSTER · {goalies.length}</h2>
          <details>
            <summary style={more}>Show all {goalies.length}, by club</summary>
            <table style={table}>
              <thead><tr><th style={th}>GOALIE</th></tr></thead>
              <tbody>
                {goalies.map((g) => (
                  <tr key={g.id} className="spc-row">
                    <td style={{ ...td, padding: '0 6px' }}><StaticPlayerCell name={g.name} href={playerHref(g.id)} photo={g.headshot || null} team={g.team} teamHref={teamHref(g.team)} number={g.number} /></td>
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
