'use client'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampSchedule } from '../../../lib/nhl/useLamp'
import LampTable from '../LampTable'
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
          {/* THE SHARED SHEET (2026-10-01, BATCH-TABLE-SKIN-V2 4b; Donovan: "convert
              them all"). Puck-drop order; a live game wears the lamp edge, a
              postponed one is dimmed, a row opens the game. */}
          <LampTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={40}
            caption={`${fmtDay(d.date)}: every game`}
            rows={[...d.games].sort((a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc)).map((g) => ({ ...g, _key: g.id, t: Date.parse(g.startUtc), awayTm: g.away.abbrev, homeTm: g.home.abbrev }))}
            onRowClick={onOpenGame ? (g) => onOpenGame(g.id) : undefined}
            rowEdge={(g) => (g.state === 'live' ? C.lamp : null)}
            dimRow={(g) => g.scheduleState !== 'OK'}
            columns={[
              { key: 't', label: 'Puck drop', heat: false, numeric: false, sticky: true, w: 150, fmt: (_, g) => {
                const live = g.state === 'live'; const done = g.state === 'final'
                return (
                  <span style={{ whiteSpace: 'nowrap', color: live ? C.lamp : done ? C.text2 : C.text, font: `800 10.5px/1.2 ${NUM_FONT}` }}>
                    {live && <LampDot />}{g.statusLine || fmtPuckDrop(g.startUtc)}
                    {(live || done) && g.away.score != null && <span style={{ marginLeft: 8, color: C.text3 }}>{g.away.abbrev} {g.away.score}, {g.home.abbrev} {g.home.score}</span>}
                  </span>) } },
              { key: 'awayTm', label: 'Away', heat: false, w: 150, fmt: (_, g) => <TeamMark abbrev={g.away.abbrev} name={g.away.name} /> },
              { key: 'homeTm', label: 'Home', heat: false, w: 150, fmt: (_, g) => <TeamMark abbrev={g.home.abbrev} name={g.home.name} /> },
              { key: 'venue', label: 'Venue', heat: false, w: 180, fmt: (v, g) => <span style={{ color: C.text3, fontSize: 11 }}>{v}{g.neutralSite ? ' · neutral site' : ''}</span> },
            ]} />
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
