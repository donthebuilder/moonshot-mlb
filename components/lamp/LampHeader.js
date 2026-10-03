'use client'
import { C, NUM_FONT, GRADIENT } from '../../lib/nhl/theme'
import HeaderShell from '../header/HeaderShell'
import SignUpPill from '../SignUpPill'
import DateMode from '../DateMode'
import SettingsSheet, { SheetLabel, SheetRow } from '../SettingsSheet'
import QuietButton from '../QuietButton'
import LampTicker from './LampTicker'
import { etToday } from '../../lib/freshness'
import { fmtDay, shiftDay } from './ui'

// 🏒 LAMP'S HEADER — the same three rows MOONSHOT's and TUDDY's headers
// settled on: brand row (date · account · gear) · the moving ticker · rail.
// The date control, the gear and the ticker arrived 2026-09-26
// (.claude-notes/BATCH-LAMP-SHELL-PLAN.md step 1), each built from the shared
// piece the other two use -- DateMode, SettingsSheet, TickerPill.
//
// Kept deliberately small. claude/header-parity-spec-2026-09-18.md wants the
// three headers folded into one <SiteHeader/>; a third hand-rolled 700-line
// header would make that fold harder, so this one carries only what a rail
// needs and takes its words from lib/nhl/routes.js like the other two.
//
//   · the DASH mark goes to the network's front door (one convention, all
//     three products); the LAMP wordmark is this product's home button.
//   · the sport pills name the OTHER two products, never this one.
//   · under 760px the rail hides; components/MobileTabBar owns switching.
// The board leads the rail, the way MOONSHOT's Props and TUDDY's Touchdowns
// lead theirs (2026-09-25, batch 3).

export default function LampHeader({ tab, setTab, live = 0, date = null, setDate = () => {}, scores = null, liveScores = null, onOpenPlayer, onOpenGame }) {
  const today = etToday()
  const tomorrow = shiftDay(today, 1)
  const go = (next) => setTab(next)


  // THE FRAME IS MOONSHOT'S (2026-09-29): components/header/HeaderShell.js --
  // the bar, the mark, the wordmark, the other products' pills and the phone
  // rules. LAMP's own pieces (its day, its gear, its ticker) stay here.
  return (
    <HeaderShell sport="nhl" theme={C} wordmark={GRADIENT}
      onHome={() => go('home')} homeTitle="LAMP home — tonight in one page"
      glow={`${C.ice}55`} dot={live > 0 ? { color: C.lamp, pulse: false } : null}
      meta={<>
        {/* date · account · settings -- MOONSHOT's cluster, in LAMP's colours.
            Today / Tmrw move the shell's one day (LampDashboard); a day paged
            to in a tab shows here as its date with neither lit. */}
        <DateMode
          label={fmtDay(date || today)}
          value={!date ? 'today' : date === tomorrow ? 'tomorrow' : ''}
          onChange={(k) => setDate(k === 'tomorrow' ? tomorrow : null)}
          options={[{ key: 'today', text: 'Today', color: C.ice }, { key: 'tomorrow', text: 'Tmrw', color: C.teal }]}
          theme={C} numFont={NUM_FONT}
        />
        <SignUpPill accent={C.ice} />
        <SettingsSheet theme={C} accent={C.ice} title="View settings — quiet mode" hint="Quiet mode. Sticks on this device.">
          <SheetLabel theme={C}>View</SheetLabel>
          <SheetRow><QuietButton /></SheetRow>
        </SettingsSheet>
      </>}>
      {/* ── row 2: the moving header (as MOONSHOT's) ── */}
      <LampTicker date={date} scores={scores} liveScores={liveScores} onOpenPlayer={onOpenPlayer} onOpenGame={onOpenGame} />
    </HeaderShell>
  )
}
