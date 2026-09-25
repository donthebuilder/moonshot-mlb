'use client'
import { useMemo, useState } from 'react'
import PageHeader from '../../PageHeader'
import LampTable from '../LampTable'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampStandings } from '../../../lib/nhl/useLamp'
import { EmptyState, DelayedBanner, Loading, Pills, SourceLine, Kicker, fmtDay } from '../ui'

// 🏒 STANDINGS — division, wild card, conference, league. Four views of one
// table; the ORDER within each is the feed's own sequence fields
// (divisionSequence / wildcardSequence / conferenceSequence / leagueSequence),
// never re-sorted here, because the league's tiebreak chain (points, then
// regulation wins, then ROW, …) is theirs to apply and ours to display.
//
// THE SEASON IS LABELLED FROM THE ROWS (seasonId), and when that season is
// older than the one standings-season says should be current, the page says
// so in capitals before the table — this is last season's final table, the
// new one opens on <date>. During preseason that is exactly the state.
//
// Data: /api/lamp/standings → reduceStandings + reduceStandingsSeasons.
const VIEWS = [
  { key: 'division', text: 'DIVISION' },
  { key: 'wildcard', text: 'WILD CARD' },
  { key: 'conference', text: 'CONFERENCE' },
  { key: 'league', text: 'LEAGUE' },
]
const rec = (r) => (r && r.w != null ? `${r.w}-${r.l}-${r.otl}` : '—')
const COLUMNS = [
  { key: 'rank', label: '#', w: 30, heat: false, fmt: (v) => v ?? '' },
  { key: 'team', label: 'Team', w: 150, heat: false, sticky: true },
  { key: 'gp', label: 'GP', w: 36, heat: false },
  { key: 'w', label: 'W', w: 36 },
  { key: 'l', label: 'L', w: 36, invert: true },
  { key: 'otl', label: 'OTL', w: 40, heat: false },
  { key: 'pts', label: 'PTS', w: 44 },
  { key: 'pPct', label: 'P%', w: 48, fmt: (v) => (v == null ? '' : v.toFixed(3).replace(/^0/, '')) },
  { key: 'rw', label: 'RW', w: 36 },
  { key: 'row', label: 'ROW', w: 40 },
  { key: 'gf', label: 'GF', w: 40 },
  { key: 'ga', label: 'GA', w: 40, invert: true },
  { key: 'diff', label: 'DIFF', w: 46, fmt: (v) => (v == null ? '' : v > 0 ? `+${v}` : String(v)) },
  { key: 'l10', label: 'L10', w: 58, heat: false },
  { key: 'strk', label: 'STRK', w: 46, heat: false },
  { key: 'home', label: 'Home', w: 62, heat: false },
  { key: 'road', label: 'Road', w: 62, heat: false },
]

function rowsFor(rows, view, rankKey) {
  return rows.map((r) => ({
    rank: r[rankKey], team: r.clinch ? `${r.abbrev} ${r.nickname} (${r.clinch})` : `${r.abbrev} ${r.nickname}`,
    gp: r.gp, w: r.w, l: r.l, otl: r.otl, pts: r.pts, pPct: r.pPct, rw: r.rw, row: r.row, gf: r.gf, ga: r.ga, diff: r.diff,
    l10: rec(r.l10), strk: r.streak || '—', home: rec(r.home), road: rec(r.road), _abbrev: r.abbrev,
  })).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
}

export default function Standings() {
  const [view, setView] = useState('division')
  const { data, error, loading } = useLampStandings()
  const rows = data?.rows || []

  const groups = useMemo(() => {
    if (!rows.length) return []
    if (view === 'league') return [{ title: 'NHL', rows: rowsFor(rows, view, 'leagueRank') }]
    if (view === 'conference') {
      return ['E', 'W'].map((c) => ({ title: `${c === 'E' ? 'Eastern' : 'Western'} Conference`, rows: rowsFor(rows.filter((r) => r.conf === c), view, 'confRank') }))
    }
    if (view === 'wildcard') {
      // Division top-3 (wcRank 0) under their division, then the chase under
      // WILD CARD with the line after the second — the league's own shape.
      const out = []
      for (const c of ['E', 'W']) {
        const conf = rows.filter((r) => r.conf === c)
        const divs = [...new Set(conf.map((r) => r.divName))].sort()
        for (const d of divs) out.push({ title: `${d} · top 3`, rows: rowsFor(conf.filter((r) => r.divName === d && r.wcRank === 0), view, 'divRank') })
        out.push({ title: `${c === 'E' ? 'Eastern' : 'Western'} wild card`, rows: rowsFor(conf.filter((r) => r.wcRank > 0), view, 'wcRank'), cutAfter: 2 })
      }
      return out
    }
    const divs = [...new Set(rows.map((r) => r.divName))]
    const order = ['Atlantic', 'Metropolitan', 'Central', 'Pacific']
    divs.sort((a, b) => order.indexOf(a) - order.indexOf(b))
    return divs.map((d) => ({ title: d, rows: rowsFor(rows.filter((r) => r.divName === d), view, 'divRank') }))
  }, [rows, view])

  const stale = data?.stale
  const opens = data?.current?.standingsStart
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader
        eyebrow="LAMP · STANDINGS"
        title={data?.seasonLabel ? `${data.seasonLabel} standings` : 'Standings'}
        note="Ordered the way the league orders them: points, then regulation wins, then regulation-plus-overtime wins. Tap a column’s ⓘ for what it means."
        theme={C} numFont={NUM_FONT} accent={C.ice}
        stats={data ? [{ value: rows.length, label: 'TEAMS', tone: C.text2 }, data.date ? { value: fmtDay(data.date), label: 'AS OF', tone: C.text2 } : null] : null}
        right={<Pills ariaLabel="Standings view" value={view} onChange={setView} options={VIEWS} />}
      />
      {stale && (
        <div role="status" style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.amber}`, background: 'rgba(251,191,36,.08)', color: C.text2, fontSize: 12, lineHeight: 1.5 }}>
          <b style={{ color: C.amber, fontFamily: NUM_FONT, letterSpacing: '.06em' }}>{data.seasonLabel} FINAL TABLE</b>
          {' · '}This is how last season ended. {opens ? `The ${String(data.current.id).slice(0, 4)}-${String(data.current.id).slice(6, 8)} table opens ${fmtDay(opens)}, when the regular season starts.` : 'The new season’s table starts with its first regular-season game.'}
        </div>
      )}
      <DelayedBanner error={error} what="the league’s standings feed" />
      {loading && !data ? <Loading what="the standings" /> : null}
      {!loading && data && rows.length === 0 && (
        <EmptyState title="SEASON NOT STARTED" note={opens ? `The standings table opens ${fmtDay(opens)}.` : 'No standings table has been published for this season yet.'} />
      )}
      {groups.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <Kicker>{g.title.toUpperCase()}</Kicker>
          <LampTable rows={g.rows} columns={COLUMNS} maxHeight={9999} heatMode="standouts" maxRows={40} />
          {g.cutAfter && g.rows.length > g.cutAfter && (
            <div style={{ color: C.text3, font: `800 8px/1.4 ${NUM_FONT}`, letterSpacing: '.08em', marginTop: 4 }}>THE LINE IS AFTER #{g.cutAfter} — two wild cards per conference make the playoffs.</div>
          )}
        </section>
      ))}
      <SourceLine>Source: NHL (api-web.nhle.com) standings/now and standings-season, read server-side by /api/lamp/standings, cached ten minutes. Season and as-of date are the feed’s own.</SourceLine>
    </div>
  )
}
