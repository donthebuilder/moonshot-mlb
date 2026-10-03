'use client'
import PageHeader from '../../PageHeader'
import TeamMark from '../../TeamMark'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { NBA_TEAMS, nbaTeam } from '../../../lib/nba/teams'
import { useBucketsStandings } from '../../../lib/nba/useBuckets'
import { Kicker, SourceLine } from '../ui'

// 🏟 TEAMS -- the 30 clubs by division, each with its record (the standings
// BUCKETS reads), each a door to its page. The club list is lib/nba/teams.js
// (ESPN's own ids); nothing here is typed by hand twice.
export default function Teams({ onOpenTeam }) {
  const { data } = useBucketsStandings(null)
  const rec = new Map((data?.confs || []).flatMap((c) => c.rows.map((r) => [r.abbrev, r])))
  const divs = [...new Set(NBA_TEAMS.map((t) => `${t[4]}|${t[5]}`))]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow="BUCKETS · TEAMS" title="The 30 clubs" theme={C} numFont={NUM_FONT} accent={C.purple}
        note={data?.seasonLabel ? `By division, with ${data.seasonLabel} records. Tap a club for its roster, schedule and season lines.` : 'By division. Tap a club for its roster, schedule and season lines.'} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {divs.map((d) => {
          const [conf, div] = d.split('|')
          return (
            <section key={d}>
              <Kicker>{conf === 'E' ? 'EAST' : 'WEST'} · {div.toUpperCase()}</Kicker>
              <div style={{ display: 'grid', gap: 4 }}>
                {NBA_TEAMS.filter((t) => t[4] === conf && t[5] === div).map((t) => {
                  const tm = nbaTeam(t[0]), r = rec.get(t[0])
                  return (
                    <button key={t[0]} type="button" onClick={() => onOpenTeam?.(t[0])} style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg2, color: C.text, cursor: 'pointer', textAlign: 'left' }}>
                      <TeamMark sport="nba" abbr={t[0]} variant="logo" px={24} />
                      <span style={{ flex: 1, fontWeight: 800, fontSize: 13 }}>{tm.place} {tm.nick}</span>
                      {r ? <span style={{ fontFamily: NUM_FONT, fontSize: 12, color: C.text2 }}>{r.w}-{r.l}</span> : null}
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
      <SourceLine>Clubs and divisions: ESPN’s NBA teams and groups (lib/nba/teams.js). Records: /api/buckets/standings.</SourceLine>
    </div>
  )
}
