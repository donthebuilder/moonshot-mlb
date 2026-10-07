'use client'
import { useMemo } from 'react'
import PageHeader from '../../PageHeader'
import { MatchLogos } from '../../TeamMark'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsDefense } from '../../../lib/nba/useBuckets'
import BucketsTable from '../BucketsTable'
import { EmptyState, DelayedBanner, Loading, SourceLine, Kicker, DayPager, LastSeasonNote, Why, fmtDay, fmtTip } from '../ui'

// 🛡 MATCHUPS -- the defence-vs view (TUDDY's "what each defence gave up",
// LAMP's Matchups), basketball's version: each side tonight against what the
// OTHER club allows a game, every number with its rank among the 30 (1 =
// gives up the most). Then every defence in one table. All of it is the
// league's own opponent stats (/api/buckets/defense); nothing modelled here.
const STATS = [['oppPts', 'PTS', 1], ['oppReb', 'REB', 1], ['oppAst', 'AST', 1], ['oppTpm', '3PM', 1], ['oppFgPct', 'FG%', 3]]
const fmt = (k, v) => (v == null ? '—' : k === 'oppFgPct' ? `${(v * 100).toFixed(1)}%` : Number(v).toFixed(1))
const rankTone = (r) => (r == null ? C.text3 : r <= 5 ? C.purple : r >= 26 ? C.text3 : C.text2)

export default function Matchups({ date, setDate, onOpenTeam, onOpenGame }) {
  const { data, error, loading } = useBucketsDefense(date)
  const by = useMemo(() => new Map((data?.teams || []).map((t) => [t.abbrev, t])), [data])
  const games = data?.games || []
  const statCols = (sub) => STATS.map(([k, label]) => ({
    key: k, label, group: sub, w: 64, heat: false, mono: true,
    title: `${label} this defence allows a game, and its rank among the 30 (1 = gives up the most)`,
    fmt: (v, r) => <span style={{ display: 'inline-grid', lineHeight: 1.15 }}><b>{fmt(k, v)}</b><span style={{ fontSize: 10, color: rankTone(r.ranks?.[k]) }}>#{r.ranks?.[k] ?? '—'}</span></span>,
  }))
  const sides = games.flatMap((g) => [[g.away, g.home], [g.home, g.away]].map(([att, def]) => ({ _id: `${g.id}-${att.abbrev}`, gameId: g.id, att: att.abbrev, def: def.abbrev, tip: g.start, state: g.state, ...(by.get(def.abbrev) || {}), defName: by.get(def.abbrev)?.name || def.abbrev })))
  const sideCols = [
    { key: 'att', label: 'Attack', group: 'Matchup', w: 64, heat: false, sticky: true, mono: true, teamMark: 'nba', link: (r) => (onOpenTeam ? () => onOpenTeam(r.att) : null) },
    // its own column on a phone too: folded under the attack, a row didn't say which defence it was
    { key: 'def', label: 'vs D', group: 'Matchup', w: 52, heat: false, mono: true, teamMark: 'nba', fold: false, link: (r) => (onOpenTeam ? () => onOpenTeam(r.def) : null) },
    { key: 'tip', label: 'Game', group: 'Matchup', w: 76, heat: false, mono: true, dim: true, link: (r) => (onOpenGame ? () => onOpenGame(r.gameId) : null), fmt: (v, r) => (r.state === 'final' ? 'FINAL' : r.state === 'live' ? 'LIVE' : fmtTip(v)) },
    ...statCols('What that defence allows a game (rank of 30)'),
  ]
  const allCols = [
    { key: 'abbrev', label: 'Club', group: 'Defence', w: 64, heat: false, sticky: true, mono: true, teamMark: 'nba', link: (r) => (onOpenTeam ? () => onOpenTeam(r.abbrev) : null) },
    { key: 'name', label: 'Name', group: 'Defence', w: 150, heat: false, link: (r) => (onOpenTeam ? () => onOpenTeam(r.abbrev) : null) },
    ...STATS.map(([k, label], i) => ({ key: k, label, group: 'Allows a game', w: 60, mono: true, primary: i === 0, fmt: (v) => fmt(k, v) })),
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow="BUCKETS · MATCHUPS" title={data?.date ? fmtDay(data.date) : 'Tonight'} theme={C} numFont={NUM_FONT} accent={C.purple}
        note={<>Each side against what the other defence gives up. <Why label="Matchups" text="Each side against what the other defence gives up a game, with its rank among the 30 (1 = gives up the most). Measured from the league’s team stats, not projected." /></>} />
      <DayPager shown={data?.date || date} date={date} setDate={setDate} disabled={loading} />
      {data?.stale && <LastSeasonNote label={data.seasonLabel} what="defence numbers" />}
      <DelayedBanner error={error} what="the league’s team stats" />
      {loading && !data ? <Loading what="the defences" /> : null}
      <section>
        <Kicker>THAT DAY’S MATCHUPS</Kicker>
        {data && !games.length && <EmptyState title="NO GAMES THAT DAY" note="Try another day, or read every defence below." />}
        {sides.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>{games.map((g) => <span key={g.id} style={{ fontSize: 12, color: C.text3 }}><MatchLogos sport="nba" away={g.away.abbrev} home={g.home.abbrev} px={16} /></span>)}</div>
            <BucketsTable rows={sides} columns={sideCols} heatMode="none" maxHeight={9999} maxRows={sides.length}
              caption="Two rows a game: each club's attack against the other's defence. A rank of #1-5 (rim orange) is one of the five softest defences for that stat." />
          </>
        )}
      </section>
      {(data?.teams || []).length > 0 && (
        <section>
          <Kicker>EVERY DEFENCE · {data.seasonLabel}</Kicker>
          <BucketsTable rows={data.teams.map((t) => ({ ...t, _id: t.abbrev }))} columns={allCols} onRowClick={(r) => onOpenTeam?.((r?._raw ?? r).abbrev)}
            initialSort={{ key: 'oppPts', dir: 'desc' }} heatMode="sorted" maxHeight={620} maxRows={30}
            caption="What each club allows a game. Column headers sort; each row opens the club." />
        </section>
      )}
      <SourceLine>Source: ESPN’s league stats by team, the Opponent block (/api/buckets/defense).</SourceLine>
    </div>
  )
}
