'use client'
import { useState } from 'react'
import Ledger from '../../ledger/Ledger'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampLedger } from '../../../lib/nhl/useLamp'
import { fmtDay } from '../ui'

// 📒 THE LAMP LEDGER (lamp research step 4, 2026-09-26) — MOONSHOT's Called
// Ledger and TUDDY's Tuddy Ledger, hockey edition, through the same shared
// components/ledger/Ledger.js. Every scorer on a locked, graded night:
// CALLED / ON THE BOARD / NOT ON THE BOARD straight from the record (never
// re-derived), how he scored from the shot archive, a season block and each
// scorer's history. Preseason nights are shown and labelled; the season
// numbers are regular season only. Data: /api/lamp/ledger.
export default function LampLedger({ onOpenPlayer, onOpenTeam, initialView = 'night' }) {
  const [date, setDate] = useState(null)       // null = the latest graded night
  const [days, setDays] = useState(initialView === 'season' ? 30 : null)   // the Archive opens with the last 30 days loaded
  const [view, setView] = useState(initialView)   // The Ledger's Archive opens it on the season view
  const night = useLampLedger({ date })
  const season = useLampLedger({ days, enabled: Boolean(days) })
  const nights = night.data?.nights || []
  const shown = night.data?.date || null
  const i = shown ? nights.indexOf(shown) : -1
  const note = night.error ? 'LIVE DATA DELAYED — the record did not answer. Try again in a minute.'
    : night.data && !shown ? 'No graded nights yet. The ledger fills in after the first locked night is graded.'
    : null
  const s = season.data?.season
  // Ledger prints its note only for an empty night, so the preseason label
  // rides above it: a camp-lineup night is shown, never passed off as the season.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    {night.data?.pre && shown ? (
      <div role="status" style={{ padding: '8px 12px', borderRadius: 10, border: `1px solid ${C.amber}`, color: C.text2, fontSize: 11.5, lineHeight: 1.5 }}>
        <b style={{ color: C.amber, fontFamily: NUM_FONT, letterSpacing: '.06em' }}>PRESEASON</b> · Graded and shown, and kept out of the season numbers.
      </div>
    ) : null}
    <Ledger
      eventLabel="G"
      eventLabelLong="Goal scorer"
      multiSport="nhl"
      noteSport="nhl"
      scorerWord="scorers"
      accent={C.ice}
      baseRate={null}
      periodWord="night"
      periodWordPlural="nights"
      todayLabel="Latest"
      formatPeriod={(d) => fmtDay(d)}
      seasonLoadOptions={[
        { n: 30, label: 'Last 30 days' },
        { n: 90, label: 'Last 90 days' },
        { n: 240, label: 'Full season' },
      ]}
      date={shown}
      onPrevDate={() => { if (i > 0) setDate(nights[i - 1]) }}
      onNextDate={() => { if (i >= 0 && i < nights.length - 1) setDate(nights[i + 1]) }}
      onToday={() => setDate(null)}
      canGoNext={i >= 0 && i < nights.length - 1}
      night={night.data && shown ? { totals: night.data.totals, rows: night.data.rows } : null}
      nightLoading={night.loading && !night.data}
      nightNote={note}
      season={s ? { from: s.from, to: s.to, nightsCount: s.nightsCount, totalEvents: s.totalEvents, called: s.called, board: s.board, off: s.off, perNight: s.perNight } : null}
      hitterRows={s?.hitters || []}
      seasonLoading={season.loading}
      seasonMessage={days && season.data && !s ? 'No regular-season nights graded in this window yet — the regular season opens Tue, Sep 29.' : season.error ? 'The record did not answer.' : ''}
      onLoadSeason={(n) => setDays(n)}
      onPlayerClick={(r) => onOpenPlayer?.(r.player_id ?? r.id)}
      onTeamClick={onOpenTeam}
      view={view}
      onViewChange={setView}
    />
    </div>
  )
}
