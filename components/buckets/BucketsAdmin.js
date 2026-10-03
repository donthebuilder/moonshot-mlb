'use client'
// BUCKETS, ADMIN ONLY (BATCH-BUCKETS B4, 2026-10-02). MOONSHOT's pieces with
// BUCKETS' words and its purple (the theme's own token, no new colour): the
// day's games, the market chips, the board on table skin v2 with the shared
// status badge, and a running record of whatever has been graded so far.
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { SportTheme } from '../SportTheme'
import DenseTable from '../DenseTable'
import CallStatusBadge from '../CallStatusBadge'
import ShotChart from './ShotChart'
import dynamic from 'next/dynamic'
import { LEG_LABEL, fmtLeg } from '../../lib/nba/legs'

// the 3D court loads only when opened (next/dynamic, as the other 3D views)
const CourtArena = dynamic(() => import('./CourtArena'), { ssr: false })

const ACCENT = C.purple
// BUCKETS has no glossary yet: an empty one, so the table doesn't borrow MOONSHOT's baseball terms
const BUCKETS_GLOSSARY = {}
const chip = (on) => ({ minHeight: 44, padding: '0 14px', borderRadius: 999, border: `1px solid ${on ? ACCENT : C.border2}`, background: on ? `${ACCENT}22` : 'transparent', color: on ? ACCENT : C.text2, fontWeight: 800, fontSize: 12, fontFamily: NUM_FONT, cursor: 'pointer', whiteSpace: 'nowrap' })
const linkBtn = { ...chip(false), display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }
const day = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

export default function BucketsAdmin({ date, prev, next, games, markets, defs, season, error, graded, gradedError, chart = null }) {
  const [m, setM] = useState('pts')
  const [calledOnly, setCalledOnly] = useState(false)
  const [three, setThree] = useState(false)
  const D = defs[m]
  // a starters-only market with nobody scored yet has no board (not 120 'not a starter' rows)
  const noBoard = D?.startersOnly && !(markets[m] || []).some((r) => r.score != null)
  const rows = useMemo(() => (noBoard ? [] : markets[m] || [])
    .filter((r) => !calledOnly || r.status === 'called')
    .sort((a, b) => (a.nightRank ?? 9999) - (b.nightRank ?? 9999))
    .map((r) => {
      const g = games.find((x) => x.id === r.gameId)
      return { _id: `${r.gameId}-${r.id}`, rank: r.nightRank, name: r.name, team: r.team, game: g ? `${g.away.abbrev}@${g.home.abbrev}` : '', score: r.score, status: r.status, role: r.role, why: r.why, injury: r.injury, ...Object.fromEntries((D?.legs || []).map((l) => [l, r.legs?.[l] ?? null])) }
    }), [markets, m, calledOnly, games, D, noBoard])
  const columns = [
    { key: 'rank', label: '#', group: 'Player', w: 34, heat: false },
    { key: 'name', label: 'Player', group: 'Player', sticky: true, heat: false, w: 150, fmt: (v, r) => (
      <span style={{ display: 'grid', lineHeight: 1.2, whiteSpace: 'normal' }}><b>{v}</b><span style={{ fontSize: 10, color: C.text3 }}>{r.team} · {r.game}{r.injury ? ` · ${r.injury}` : ''}</span></span>) },
    { key: 'score', label: 'Score', group: 'Model', primary: true, scale: 'seq', domain: [0, 100], w: 52 },
    { key: 'status', label: 'Status', group: 'Model', heat: false, w: 118, fmt: (v, r) => <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><CallStatusBadge status={v} accent={ACCENT} />{r.role ? <b style={{ fontSize: 10, color: ACCENT }}>{r.role}</b> : null}</span> },
    ...(D?.legs || []).map((l) => ({ key: l, label: LEG_LABEL[l] || l, group: 'Legs (pooled per game)', w: 62, heat: false, fmt: (v) => fmtLeg(l, v) })),
    { key: 'why', label: 'Why', group: 'Model', heat: false, w: 420, fmt: (v) => <span style={{ fontSize: 11, color: C.text3, whiteSpace: 'nowrap' }}>{v}</span> },
  ]
  // the running record of what's graded (regular season; preseason counted apart)
  const rec = useMemo(() => {
    const out = {}
    for (const r of graded || []) {
      if (r.status !== 'called' || r.hit == null) continue
      const k = `${r.market}|${r.season_type === 1 ? 'pre' : 'reg'}`
      out[k] ||= { n: 0, hit: 0, nights: new Set() }
      out[k].n += 1; if (r.hit) out[k].hit += 1; out[k].nights.add(r.game_date)
    }
    return out
  }, [graded])

  return (
    <SportTheme theme={C} accent={ACCENT} numFont={NUM_FONT}>
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 16px 60px', color: C.text, background: C.bg, minHeight: '100vh' }}>
        <header style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: ACCENT, letterSpacing: '.02em' }}>BUCKETS</h1>
          <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.1em', color: C.text3, fontFamily: NUM_FONT }}>ADMIN ONLY · NOT PUBLIC</span>
        </header>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <a href={`/admin/buckets?date=${prev}`} style={linkBtn}>‹ Prev</a>
          <b style={{ fontFamily: NUM_FONT, fontSize: 14 }}>{day(date)}</b>
          <a href={`/admin/buckets?date=${next}`} style={linkBtn}>Next ›</a>
          <a href="/admin/buckets?date=2026-10-20" style={linkBtn}>Opening night</a>
          {season ? <span style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT }}>season {season - 1}-{String(season).slice(2)}</span> : null}
        </div>
        {error ? <p style={{ color: C.text3, fontSize: 13 }}>{error}</p> : null}
        {games.length ? (
          <p style={{ fontSize: 12, color: C.text2, fontFamily: NUM_FONT, margin: '0 0 10px' }}>
            {games.map((g) => `${g.away.abbrev} @ ${g.home.abbrev} ${new Date(g.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET${g.seasonType === 1 ? ' (pre)' : ''}`).join('  ·  ')}
          </p>
        ) : null}
        <div role="tablist" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 6 }}>
          {Object.entries(defs).map(([k, d]) => <button key={k} type="button" role="tab" aria-selected={m === k} onClick={() => setM(k)} style={chip(m === k)}>{d.label}</button>)}
          <button type="button" aria-pressed={calledOnly} onClick={() => setCalledOnly((v) => !v)} style={chip(calledOnly)}>Called only</button>
        </div>
        {D?.highVariance ? <p style={{ fontSize: 12, color: C.text3, margin: '0 0 8px' }}>A high-variance lane: the ten starters only, scored once the pre-tip box score lists them.</p> : null}
        {rows.length
          ? <DenseTable rows={rows} columns={columns} heatMode="primary" maxRows={30} maxHeight={9999} accent={ACCENT} dict={BUCKETS_GLOSSARY}
              caption="Every player on tonight's rosters, ranked by the market's score. Calls are one per team; the second only while he's in the top third." />
          : <p style={{ fontSize: 13, color: C.text3 }}>{D?.startersOnly ? 'No starters listed yet for these games.' : 'No games on this date.'}</p>}

        {chart ? (
          <section style={{ marginTop: 22 }}>
            <h2 style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.1em', color: C.text2, fontFamily: NUM_FONT }}>SHOT CHART · {chart.title}{chart.sample ? ' · LAST SEASON SAMPLE' : ''}</h2>
            {chart.finals.length > 1 ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {chart.finals.map((g) => <a key={g.id} href={`/admin/buckets?date=${date}&game=${g.id}`} style={{ ...linkBtn, ...(g.id === chart.id ? chip(true) : {}) }}>{g.label}</a>)}
              </div>
            ) : null}
            <ShotChart shots={chart.shots} names={chart.names} teams={chart.teams} title={`Shot chart ${chart.title}`} />
            <div style={{ marginTop: 10 }}>
              <button type="button" aria-pressed={three} onClick={() => setThree((v) => !v)} style={chip(three)}>{three ? 'Close the 3D court' : '🏀 3D court'}</button>
            </div>
            {three ? <div style={{ marginTop: 8 }}><CourtArena shots={chart.shots} names={chart.names} /></div> : null}
          </section>
        ) : null}

        <section style={{ marginTop: 22 }}>
          <h2 style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.1em', color: C.text2, fontFamily: NUM_FONT }}>THE RECORD SO FAR</h2>
          {gradedError ? <p style={{ fontSize: 12, color: C.text3 }}>Not recording yet: {/does not exist|relation|schema/i.test(gradedError) ? 'the BUCKETS tables are created by RUN-IN-SUPABASE-2026-10-03-QUEUE.sql part 3' : gradedError}</p>
            : !Object.keys(rec).length ? <p style={{ fontSize: 12, color: C.text3 }}>Nothing graded yet. Calls lock before tip and grade after the final.</p>
            : <div style={{ display: 'grid', gap: 4, fontFamily: NUM_FONT, fontSize: 12 }}>
                {Object.entries(rec).sort().map(([k, v]) => { const [mk, ph] = k.split('|'); return <div key={k}>{defs[mk.startsWith('first') ? 'first' : mk]?.label || mk}{mk === 'first_pts' ? ' (first points)' : mk === 'first_fg' ? ' (first field goal)' : ''} · {ph === 'pre' ? 'preseason' : 'regular season'}: <b>{v.hit} of {v.n}</b> calls over {v.nights.size} night{v.nights.size === 1 ? '' : 's'}</div> })}
              </div>}
        </section>
      </main>
    </SportTheme>
  )
}
