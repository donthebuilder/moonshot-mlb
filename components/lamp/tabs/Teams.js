'use client'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampStandings } from '../../../lib/nhl/useLamp'
import { nhlTeam } from '../../../lib/nhl/teams'
import LampTable from '../LampTable'
import SiteTeamMark from '../../TeamMark'
import { TeamMark, EmptyState, DelayedBanner, Loading, SourceLine, Kicker, StaleSeasonNote, plusMinus } from '../ui'

// 🏒 TEAMS — the 32 clubs by division, each with its record, each a door to
// its own page. The records are the standings feed's (one route, already
// cached), so this page costs nothing the Standings page has not paid.
const ORDER = ['Atlantic', 'Metropolitan', 'Central', 'Pacific']
const rec = (r) => `${r.w}-${r.l}-${r.otl}`

export default function Teams({ onOpenTeam }) {
  const { data, error, loading } = useLampStandings()
  const rows = data?.rows || []
  const divs = ORDER.filter((d) => rows.some((r) => r.divName === d))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader eyebrow="LAMP · TEAMS" title="The 32 clubs" note="By division, with the record beside each. Tap a club for its roster, schedule and season lines." theme={C} numFont={NUM_FONT} accent={C.ice}
        stats={data ? [{ value: rows.length, label: 'CLUBS', tone: C.text2 }, data.seasonLabel ? { value: data.seasonLabel, label: data.stale ? 'FINAL' : 'SEASON', tone: data.stale ? C.amber : C.text2 } : null] : null} />
      {data?.stale && <StaleSeasonNote label={data.seasonLabel} opens={data.current?.standingsStart} what="records" />}
      <DelayedBanner error={error} what="the league’s standings feed" />
      {loading && !data ? <Loading what="the clubs" /> : null}
      {!loading && data && rows.length === 0 && <EmptyState title="SEASON NOT STARTED" note="No standings table yet; the clubs page reads its records from it." />}
      {divs.map((d) => (
        <section key={d} aria-label={d}>
          <Kicker>{d.toUpperCase()}</Kicker>
          {/* THE SHARED TABLE (2026-10-01, BATCH-TABLE-SKIN-V2 4b / R8): the
              hand-rolled <table> is LampTable now -- every column sorts, the club
              stays pinned on a phone with its nickname (a directory of codes is
              not a directory). Division order until you sort. */}
          <LampTable rows={rows.filter((r) => r.divName === d).sort((a, b) => (a.divRank ?? 99) - (b.divRank ?? 99)).map((r) => ({ ...r, _key: r.abbrev, club: nhlTeam(r.abbrev)?.nickname || r.nickname, recTxt: rec(r) }))}
            columns={TEAM_COLS} heatMode="sorted" maxHeight={9999} maxRows={40} bare
            onRowClick={onOpenTeam ? (r) => onOpenTeam(r.abbrev) : undefined}
            caption={`${d}: division order. Every column sorts; each row opens that club.`} />
        </section>
      ))}
      <SourceLine>Source: NHL standings/now via /api/lamp/standings. Season and as-of date are the feed’s own.</SourceLine>
    </div>
  )
}
const TG = {
  club: { key: 'club', label: 'Club', order: 0 }, rec: { key: 'rec', label: 'Record', order: 1 },
  goals: { key: 'goals', label: 'Goals', order: 2 }, form: { key: 'form', label: 'Form', order: 3 },
}
const TEAM_COLS = [
  { key: 'club', label: 'Team', heat: false, sticky: true, bold: true, w: 150, group: TG.club,
    fmt: (v, r) => <span title={`${v} (${r.abbrev})`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><SiteTeamMark sport="nhl" abbr={r.abbrev} variant="logo" px={16} /><span>{v}</span></span> },
  { key: 'recTxt', label: 'REC', heat: false, mono: true, w: 64, group: TG.rec },
  { key: 'pts', label: 'PTS', w: 44, dp: 0, primary: true, group: TG.rec },
  { key: 'gf', label: 'GF', w: 44, dp: 0, group: TG.goals }, { key: 'ga', label: 'GA', w: 44, dp: 0, invert: true, group: TG.goals },
  { key: 'diff', label: 'DIFF', w: 50, dp: 0, scale: 'div', anchor: 0, ceiling: 40, anchorLabel: 'even', group: TG.goals, fmt: (v) => plusMinus(v) },
  { key: 'streak', label: 'STRK', heat: false, mono: true, w: 52, group: TG.form, fmt: (v) => v || '—' },
]
