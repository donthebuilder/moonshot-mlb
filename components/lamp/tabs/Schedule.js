'use client'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampSchedule } from '../../../lib/nhl/useLamp'
import { TeamMark, EmptyState, DelayedBanner, Loading, SourceLine, GameTypeChip, LampDot, fmtDay, fmtPuckDrop, zoneAbbrev } from '../ui'

// 🏒 SCHEDULE — the league week, day by day. Football's unit is a week and
// baseball's is a night; hockey's is both, so this page is the week and
// Scores is the night. The feed decides where a week starts and ends
// (previousStartDate / nextStartDate), and it says which season boundary
// the week sits against, so PRESEASON / REGULAR SEASON is read, not guessed.
//
// Data: /api/lamp/schedule?date= → reduceScheduleWeek. Finals in the past
// part of the week show their score; games to come show puck drop in the
// viewer's zone. Tap a row for the game.
// The day is the LAMP shell's (LampDashboard, 2026-09-26): one date for the
// header's Today/Tmrw, every dated tab and the address -- this tab's day
// buttons move it for all of them.
export default function Schedule({ onOpenGame, date = null, setDate = () => {} }) {
  const { data, error, loading } = useLampSchedule(date)
  const week = data
  const days = (week?.days || []).filter((d) => d.games.length)
  const first = week?.days?.[0]?.date
  const last = week?.days?.[week.days.length - 1]?.date
  const total = week?.days?.reduce((n, d) => n + d.games.length, 0) || 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader
        eyebrow="LAMP · SCHEDULE"
        title={first && last ? `${fmtDay(first)} – ${fmtDay(last)}` : 'This week'}
        note={`The league week, day by day. Puck-drop times are in your zone (${zoneAbbrev()}). Games already played show the score.`}
        theme={C} numFont={NUM_FONT} accent={C.ice}
        stats={week ? [{ value: total, label: 'GAMES', tone: C.text2 }, { value: days.length, label: 'DAYS', tone: C.text2 }] : null}
      />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <NavBtn onClick={() => setDate(week?.prevStart)} disabled={loading || !week?.prevStart}>‹ Previous week</NavBtn>
        <NavBtn onClick={() => setDate(null)} disabled={loading || !date} strong>This week</NavBtn>
        <NavBtn onClick={() => setDate(week?.nextStart)} disabled={loading || !week?.nextStart}>Next week ›</NavBtn>
        {week?.regularSeasonStart && (
          <span style={{ color: C.text3, font: `800 8px/1.4 ${NUM_FONT}`, letterSpacing: '.08em' }}>
            REGULAR SEASON {fmtDay(week.regularSeasonStart).toUpperCase()} – {fmtDay(week.regularSeasonEnd).toUpperCase()}
          </span>
        )}
      </div>

      <DelayedBanner error={error} what="the league’s schedule feed" />
      {loading && !week ? <Loading what="the schedule" /> : null}
      {!loading && week && days.length === 0 && (
        <EmptyState title="NO GAMES THIS WEEK" note="The league has nothing scheduled in this week. Page forward for the next one." />
      )}
      {days.map((d) => (
        <section key={d.date} aria-label={fmtDay(d.date)}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '6px 0 6px' }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, letterSpacing: '-.02em', color: C.cream }}>{fmtDay(d.date)}</h3>
            <span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}` }}>{d.games.length} GAME{d.games.length === 1 ? '' : 'S'}</span>
            {[...new Set(d.games.map((g) => g.gameTypeLabel))].map((t) => <GameTypeChip key={t} label={t} />)}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.12em', textAlign: 'left' }}>
                  <th style={th}>PUCK DROP</th><th style={th}>AWAY</th><th style={th}>HOME</th><th className="sm-hide" style={th}>VENUE</th>
                </tr>
              </thead>
              <tbody>
                {[...d.games].sort((a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc)).map((g) => {
                  const live = g.state === 'live'; const done = g.state === 'final'; const off = g.scheduleState !== 'OK'
                  const label = g.statusLine || fmtPuckDrop(g.startUtc)
                  return (
                    <tr key={g.id} onClick={() => onOpenGame?.(g.id)} tabIndex={0} role="link"
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenGame?.(g.id) } }}
                      aria-label={`${g.away.abbrev} at ${g.home.abbrev}, ${label}. Open game.`}
                      style={{ cursor: 'pointer', borderTop: `1px solid ${C.border}`, opacity: off ? .55 : 1, background: live ? `linear-gradient(90deg, ${C.lamp}12, transparent 40%)` : 'transparent' }}>
                      <td style={{ ...td, whiteSpace: 'nowrap', color: live ? C.lamp : done ? C.text2 : C.text, font: `800 10.5px/1.2 ${NUM_FONT}` }}>
                        {live && <LampDot />}{label}
                        {(live || done) && g.away.score != null && <span style={{ marginLeft: 8, color: C.text3 }}>{g.away.abbrev} {g.away.score}, {g.home.abbrev} {g.home.score}</span>}
                      </td>
                      <td style={td}><TeamMark abbrev={g.away.abbrev} name={g.away.name} /></td>
                      <td style={td}><TeamMark abbrev={g.home.abbrev} name={g.home.name} /></td>
                      <td className="sm-hide" style={{ ...td, color: C.text3, fontSize: 11 }}>{g.venue}{g.neutralSite ? ' · neutral site' : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <SourceLine>Source: NHL (api-web.nhle.com) schedule/{'{date}'}, read server-side by /api/lamp/schedule, cached five minutes.</SourceLine>
    </div>
  )
}

function NavBtn({ children, onClick, disabled, strong = false }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      height: 28, padding: '0 11px', borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
      border: `1px solid ${strong ? C.ice : C.border2}`, background: strong ? `${C.ice}14` : C.bg2,
      color: strong ? C.ice : C.text2, font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.04em', opacity: disabled ? .5 : 1,
    }}>{children}</button>
  )
}
const th = { padding: '0 8px 8px', fontWeight: 800 }
const td = { padding: '8px 8px', verticalAlign: 'middle' }
