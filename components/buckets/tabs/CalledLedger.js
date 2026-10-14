'use client'
import { useState } from 'react'
import Ledger from '../../ledger/Ledger'
import { C } from '../../../lib/nba/theme'
import { useBucketsCalledLedger } from '../../../lib/nba/useBuckets'
import { fmtDay } from '../ui'

// 📒 THE BUCKETS CALLED LEDGER + ARCHIVE (2026-10-13, parity audit gap 8) -- LAMP's LampLedger through the same shared
// components/ledger/Ledger.js. Every 25-point game on a locked, graded regular-season night: CALLED / ON THE BOARD / NOT ON
// THE BOARD straight from the record (lib/nba/calledLedger.js, never re-derived), one night at a time (Called) or the
// season window (Archive opens it on the season view). While points is under the public-number floor the counts say
// "tracking" (lib/record/nbaFloor.js). Data: /api/buckets/calledledger.
export default function CalledLedger({ onOpenPlayer, onOpenTeam, initialView = 'night' }) {
  const [date, setDate] = useState(null)       // null = the latest graded night
  const [days, setDays] = useState(initialView === 'season' ? 30 : null)
  const [view, setView] = useState(initialView)
  const night = useBucketsCalledLedger({ date })
  const season = useBucketsCalledLedger({ days, enabled: Boolean(days) })
  const nights = night.data?.nights || []
  const shown = night.data?.date || null
  const i = shown ? nights.indexOf(shown) : -1
  const note = night.error ? 'LIVE DATA DELAYED — the record did not answer. Try again in a minute.'
    : night.data && night.data.dbReady === false ? 'The record is not connected yet.'
    : night.data && !shown ? 'No graded regular-season nights yet. The ledger fills in after the first locked night is graded.'
    : null
  const s = season.data?.season
  const tracking = night.data?.tracking || s?.tracking || null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Ledger
        eventLabel="PTS"
        eventLabelLong="25-point game"
        noteSport="nba"
        scorerWord="players"
        accent={C.purple}
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
        seasonMessage={days && season.data && !s ? 'No regular-season nights graded in this window yet.' : season.error ? 'The record did not answer.' : ''}
        onLoadSeason={(n) => setDays(n)}
        onPlayerClick={(r) => onOpenPlayer?.(r.player_id ?? r.id)}
        onTeamClick={onOpenTeam}
        view={view}
        onViewChange={setView}
        tracking={tracking}
      />
    </div>
  )
}
