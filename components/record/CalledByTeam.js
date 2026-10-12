'use client'
// CALLED ACCURACY: THIS WEEK, ALL SEASON, AND BY CLUB (2026-10-12, Donovan: "called picks by team, in the record, and overall
// called picks accuracy ... THIS WEEK'S called percent accuracy ... in each sport's respective record").
//
//   <CalledWeekStrip sport />          the top of the record: this week, last week and all season, each with its window, n and
//                                      95% Wilson range (counts and "tracking" under 30 graded calls)
//   <CalledByTeam sport Table />       the table: one row per club, "Club" (the club of the called player) or "Faced" (the club
//                                      he played against), most calls first
//
// Every number is a count of the graded called rows /api/record/calls already lists (the rows each sport's ledger reads);
// lib/record/byTeam.js does the counting and the words, so the team pages and /called agree with this table. Nothing is
// stored, graded or typed here. A call that did not play is out of every n. An ordering by volume, never by rate.
import { useMemo, useState } from 'react'
import { useLiveFetch } from '../../lib/useLiveFetch'
import { useSportTheme } from '../SportTheme'
import { useTeamNav } from '../../lib/teamNav'
import { teamHref } from '../../lib/routes'
import { alpha } from '../../lib/scales'
import { TYPE } from '../../lib/theme'
import { trackingWords } from '../../lib/record/nbaFloor'
import { CALLED_WORDS, calledAccuracy, byTeamFrom, stripLines, teamCells, TEAM_THIN_N } from '../../lib/record/byTeam'

const PREVIEW = 8

/** The shared read (one request per url, shared with CallHistory) and the figures counted from it. */
export function useCalledByTeam(sport) {
  const { data, error } = useLiveFetch(`/api/record/calls?sport=${sport}`)
  return useMemo(() => {
    if (!data) return { data: null, error, acc: null, ctx: null }
    const ctx = { today: data.meta?.today || null, nflWeek: data.meta?.nflWeek ?? null }
    return { data, error, ctx, acc: calledAccuracy(data.calls || [], sport, ctx) }
  }, [data, error, sport])
}

export function CalledWeekStrip({ sport, style = null }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  const { data, error, acc } = useCalledByTeam(sport)
  if (error && !data) return null
  if (!data) return null
  const words = CALLED_WORDS[sport] || CALLED_WORDS.mlb
  const tracking = data.tracking || []
  if (!(data.calls || []).length) {
    // a market under the BUCKETS public-number floor: counts and the word, no hit count (lib/record/nbaFloor.js)
    if (!tracking.length) return null
    return (
      <section aria-label="Called accuracy" style={{ borderLeft: `3px solid ${alpha(accent, 0.6)}`, paddingLeft: 10, margin: '0 0 12px', ...style }}>
        <div style={{ font: `900 ${TYPE.label}px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: C.text3, margin: '0 0 4px' }}>CALLED ACCURACY</div>
        {tracking.map((t) => <div key={t.market || t.label} style={{ fontSize: TYPE.body, color: C.text2, lineHeight: 1.5 }}><b style={{ color: C.text }}>{t.label}</b> {trackingWords({ n: t.n, nights: t.nights })}</div>)}
      </section>
    )
  }
  const lines = stripLines(acc, { what: words.what })
  return (
    <section aria-label="Called accuracy" style={{ borderLeft: `3px solid ${alpha(accent, 0.6)}`, paddingLeft: 10, margin: '0 0 12px', ...style }}>
      <div style={{ font: `900 ${TYPE.label}px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: C.text3, margin: '0 0 4px' }}>CALLED ACCURACY · {words.what.toUpperCase()}</div>
      {lines.map((l, i) => (
        <div key={l.key} style={{ fontSize: i === 0 ? 13 : TYPE.body, lineHeight: 1.5, color: i === 0 ? C.text : C.text2, fontWeight: i === 0 ? 700 : 400 }}>{l.text}</div>
      ))}
      {tracking.length ? <div style={{ fontSize: TYPE.label, color: C.text3, lineHeight: 1.45, marginTop: 4 }}>Markets still tracking are left out: {tracking.map((t) => `${t.label} (n=${t.n})`).join(', ')}.</div> : null}
    </section>
  )
}

const BYS = [
  { id: 'team', name: 'His club', head: 'Club', about: 'the club the called player belongs to, as stored on the call' },
  { id: 'opp', name: 'Club faced', head: 'Faced', about: 'the club the called player faced' },
]

export default function CalledByTeam({ sport, Table, title = 'Called picks by club' }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  const teamNav = useTeamNav()
  const [by, setBy] = useState('team')
  const { data, acc, ctx } = useCalledByTeam(sport)
  const words = CALLED_WORDS[sport] || CALLED_WORDS.mlb
  const view = useMemo(() => (data && ctx ? byTeamFrom(data.calls || [], sport, ctx, { by }) : null), [data, ctx, sport, by])
  if (!view || !acc || !view.rows.length) return null
  const meta = BYS.find((b) => b.id === by)
  const go = (code) => (teamNav ? () => teamNav(code) : (() => { const h = teamHref(sport, code); return h ? () => { window.location.href = h } : null })())
  const rows = view.rows.map((r) => ({ ...r, _key: `${by}-${r.team}`, ...(() => { const c = teamCells(r); return { range: c.range, weekTxt: c.week, lastTxt: c.last10 } })() }))
  const wkLabel = acc.windows.this ? acc.windows.this.label : 'this week'
  const columns = [
    { key: 'team', label: meta.head, group: meta.head, sticky: true, heat: false, teamMark: sport, code: true, w: 78, link: (r) => go(r.team) },
    { key: 'n', label: 'Called', group: 'Record', w: 50, heat: false, numeric: true, title: `Graded ${words.what} on ${meta.about}. Did not play is not counted.` },
    { key: 'hits', label: 'Cleared', group: 'Record', w: 56, heat: false, numeric: true },
    { key: 'rate', label: 'Rate', group: 'Record', w: 62, primary: true, scale: 'seq', domain: [0, 100], numeric: true, title: `Cleared ÷ called, with n beside it when under ${TEAM_THIN_N}. A few calls is a wide range.`,
      fmt: (v, r) => (v == null ? '—' : (
        <span style={{ display: 'grid', lineHeight: 1.15 }}>
          <span>{`${Number(v).toFixed(0)}%`}</span>
          {r.thin ? <span style={{ fontSize: 10, color: C.text3 }}>n={r.n}</span> : null}
        </span>)) },
    { key: 'range', label: '95% range', group: 'Record', w: 74, heat: false, mono: true, sortable: false, numeric: false, title: 'The Wilson 95% range for that rate: the wider it is, the less the sample says.' },
    { key: 'weekTxt', label: 'This week', group: 'Form', w: 66, heat: false, mono: true, sortable: false, numeric: false, title: `Cleared of called, ${wkLabel}` },
    { key: 'lastTxt', label: 'Last 10', group: 'Form', w: 62, heat: false, mono: true, sortable: false, numeric: false, title: 'Cleared of the 10 most recent graded calls' },
  ]
  return (
    <section aria-label={title} style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', margin: '4px 0 6px' }}>
        <div style={{ color: accent, font: `900 ${TYPE.label}px/1 ${NUM_FONT}`, letterSpacing: '.14em' }}>{title.toUpperCase()}</div>
        <div role="group" aria-label="Which club" style={{ display: 'flex', gap: 4 }}>
          {BYS.map((b) => (
            <button key={b.id} type="button" aria-pressed={by === b.id} onClick={() => setBy(b.id)}
              style={{ minHeight: 44, minWidth: 44, padding: '0 12px', borderRadius: 10, border: `1px solid ${by === b.id ? accent : C.border2}`, background: by === b.id ? alpha(accent, 0.14) : 'transparent', color: by === b.id ? accent : C.text2, fontWeight: 800, fontSize: TYPE.label, cursor: 'pointer', whiteSpace: 'nowrap' }}>{b.name}</button>
          ))}
        </div>
      </div>
      <p style={{ margin: '0 0 8px', fontSize: TYPE.body, color: C.text2, lineHeight: 1.5 }}>
        <b style={{ color: C.text }}>{view.clubs} {view.clubs === 1 ? 'club' : 'clubs'}</b>, by {meta.about}, most calls first (an order by volume, not by rate).
        {view.noClub ? ` ${view.noClub} graded ${view.noClub === 1 ? 'call has' : 'calls have'} no club stored and ${view.noClub === 1 ? 'is' : 'are'} left out.` : ''}
      </p>
      <Table rows={rows} columns={columns} maxRows={PREVIEW} maxHeight={9999} heatMode={rows.filter((r) => !r.thin).length >= 6 ? 'standouts' : 'none'} initialSort="n" dimRow={(r) => r.thin}
        caption={`One row per club. Called = graded ${words.what} (a call that did not play is not counted). A club under ${TEAM_THIN_N} calls shows n=K and does not set the colour scale; with fewer than six clubs past that, nothing is coloured. The club is the one stored on each call, so a player counts for the club he was with that day. Weeks are counted by each call's own game date (${acc.kind === 'nfl' ? 'the NFL week' : 'the 7 days ending today'}). There is no per-club base rate on file, so there is no comparison column.`} />
    </section>
  )
}
