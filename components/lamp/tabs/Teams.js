'use client'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampStandings } from '../../../lib/nhl/useLamp'
import { nhlTeam } from '../../../lib/nhl/teams'
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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.12em', textAlign: 'left' }}><th style={th}>TEAM</th><th style={{ ...th, textAlign: 'right' }}>REC</th><th style={{ ...th, textAlign: 'right' }}>PTS</th><th className="sm-hide" style={{ ...th, textAlign: 'right' }}>GF</th><th className="sm-hide" style={{ ...th, textAlign: 'right' }}>GA</th><th style={{ ...th, textAlign: 'right' }}>DIFF</th><th className="sm-hide" style={{ ...th, textAlign: 'right' }}>STRK</th></tr></thead>
            <tbody>
              {rows.filter((r) => r.divName === d).sort((a, b) => (a.divRank ?? 99) - (b.divRank ?? 99)).map((r) => {
                const t = nhlTeam(r.abbrev)
                return (
                  <tr key={r.abbrev} onClick={() => onOpenTeam?.(r.abbrev)} tabIndex={0} role="link" aria-label={`${r.name}, open team`}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenTeam?.(r.abbrev) } }}
                    style={{ cursor: 'pointer', borderTop: `1px solid ${C.border}` }}>
                    {/* The nickname stays visible on a phone here (TeamMark's name is
                        sm-hide elsewhere): a directory of three-letter codes is not a
                        directory for someone who does not know the league. */}
                    <td style={td}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><TeamMark abbrev={r.abbrev} size={20} /><span style={{ color: C.text2, fontSize: 11.5 }}>{t ? t.nickname : r.nickname}</span></span></td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: NUM_FONT, color: C.text2 }}>{rec(r)}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: NUM_FONT, fontWeight: 900 }}>{r.pts}</td>
                    <td className="sm-hide" style={{ ...td, textAlign: 'right', fontFamily: NUM_FONT, color: C.text3 }}>{r.gf}</td>
                    <td className="sm-hide" style={{ ...td, textAlign: 'right', fontFamily: NUM_FONT, color: C.text3 }}>{r.ga}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: NUM_FONT, color: r.diff > 0 ? C.teal : r.diff < 0 ? C.text3 : C.text2 }}>{plusMinus(r.diff)}</td>
                    <td className="sm-hide" style={{ ...td, textAlign: 'right', fontFamily: NUM_FONT, color: C.text3 }}>{r.streak || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ))}
      <SourceLine>Source: NHL standings/now via /api/lamp/standings. Season and as-of date are the feed’s own.</SourceLine>
    </div>
  )
}
const th = { padding: '0 8px 8px', fontWeight: 800 }
const td = { padding: '8px 8px', verticalAlign: 'middle' }
