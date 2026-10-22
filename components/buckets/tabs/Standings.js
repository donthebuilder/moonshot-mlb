'use client'
import { useState } from 'react'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsStandings } from '../../../lib/nba/useBuckets'
import BucketsTable from '../BucketsTable'
import { DelayedBanner, Loading, Kicker, Pills } from '../ui'
import { NBA_TEAMS } from '../../../lib/nba/teams'
import ComebacksTable from '../ComebacksTable'

// 📈 STANDINGS -- both conferences, seeded, the league's own order (ESPN
// standings). Before opening night it is last season's final table, labelled;
// the other season is one tap.
//
// BEFORE ANY GAME IS PLAYED (2026-10-17: Teams folded into Standings, and the old Teams page listed all 30 clubs): the
// table is the 30 clubs themselves, by conference and division from lib/nba/teams.js, 0-0 each (true: no games), each
// row opening its club. No seed, no percentage, no number that does not exist yet.
const DIV_ORDER = { E: ['Atlantic', 'Central', 'Southeast'], W: ['Northwest', 'Pacific', 'Southwest'] }
const PRE_GROUPS = [['E', 'Eastern'], ['W', 'Western']].flatMap(([conf, name]) => DIV_ORDER[conf].map((div) => ({
  key: `${conf}-${div}`, name: `${name} · ${div}`,
  rows: NBA_TEAMS.filter((t) => t[4] === conf && t[5] === div)
    .map(([abbrev, , place, nick]) => ({ abbrev, name: `${place} ${nick}`, w: 0, l: 0, _id: abbrev }))
    .sort((x, y) => x.name.localeCompare(y.name)),
})))
export default function Standings({ onOpenTeam }) {
  const [season, setSeason] = useState(null)
  const { data, error, loading } = useBucketsStandings(season)
  const cols = [
    { key: 'seed', label: '#', group: 'Team', w: 32, heat: false, mono: true, dim: true },
    { key: 'abbrev', label: 'Team', group: 'Team', w: 120, heat: false, sticky: true, bold: true, fmt: (v, r) => <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>{r.name}{r.clinch ? <span style={{ fontSize: 10, color: C.purple }}>{r.clinch}</span> : null}</span>, link: (r) => (onOpenTeam ? () => onOpenTeam(r.abbrev) : null) },
    { key: 'w', label: 'W', group: 'Record', w: 36, mono: true },
    { key: 'l', label: 'L', group: 'Record', w: 36, mono: true },
    { key: 'pct', label: 'PCT', group: 'Record', w: 48, mono: true, primary: true, fmt: (v) => (Number.isFinite(v) ? v.toFixed(3).replace(/^0/, '') : '—') /* was rounded to 1/0 */ },
    { key: 'gb', label: 'GB', group: 'Record', w: 40, heat: false, mono: true },
    { key: 'home', label: 'Home', group: 'Splits', w: 52, heat: false, mono: true },
    { key: 'road', label: 'Road', group: 'Splits', w: 52, heat: false, mono: true },
    { key: 'last10', label: 'L10', group: 'Splits', w: 44, heat: false, mono: true },
    { key: 'streak', label: 'Strk', group: 'Splits', w: 44, heat: false, mono: true },
    { key: 'ppg', label: 'PPG', group: 'Scoring', w: 52, mono: true, dp: 1 },
    { key: 'oppg', label: 'OPPG', group: 'Scoring', w: 52, mono: true, dp: 1 },
    { key: 'diff', label: 'Diff', group: 'Scoring', w: 48, heat: false, mono: true },
  ]
  const preCols = [cols[1], cols[2], cols[3]]   // Team, W, L
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow="BUCKETS · STANDINGS" title={data?.seasonLabel ? `${data.seasonLabel} standings` : 'Standings'} theme={C} numFont={NUM_FONT} accent={C.purple}
        note={data?.stale ? `The season hasn’t started: this is ${data.seasonLabel}’s final table.` : 'Both conferences, seeded.'} />
      {data?.other ? <Pills ariaLabel="Season" value={String(data.season)} onChange={(k) => setSeason(Number(k))} options={[{ key: String(data.season), text: data.seasonLabel }, { key: String(data.other), text: data.otherLabel }].sort((a, b) => b.key.localeCompare(a.key))} /> : null}
      <DelayedBanner error={error} what="the standings" />
      {loading && !data ? <Loading what="the standings" /> : null}
      {data && !data.played && (
        <>
          <div role="status" style={{ color: C.text2, fontSize: 12, lineHeight: 1.5 }}>NO GAMES PLAYED YET: every club is 0-0 in {data.seasonLabel}. {data.otherLabel ? `${data.otherLabel} is one tap above.` : ''}</div>
          {PRE_GROUPS.map((c) => (
            <section key={c.key}>
              <Kicker>{c.name.toUpperCase()}</Kicker>
              <BucketsTable rows={c.rows} columns={preCols} onRowClick={(r) => onOpenTeam?.((r?._raw ?? r).abbrev)}
                heatMode="sorted" maxHeight={9999} maxRows={5} caption={`${c.name}. Each row opens the club.`} />
            </section>
          ))}
        </>
      )}
      {data?.played && data.confs.map((c) => (
        <section key={c.conf}>
          <Kicker>{String(c.name).toUpperCase()}</Kicker>
          <BucketsTable rows={c.rows.map((r) => ({ ...r, _id: r.abbrev }))} columns={cols} onRowClick={(r) => onOpenTeam?.((r?._raw ?? r).abbrev)}
            initialSort={{ key: 'seed', dir: 'asc' }} heatMode="sorted" maxHeight={9999} maxRows={15}
            caption={`${c.name}, seeded. Each row opens the club.`} />
        </section>
      ))}
      {data ? <ComebacksTable onOpenTeam={onOpenTeam} /> : null}
    </div>
  )
}
