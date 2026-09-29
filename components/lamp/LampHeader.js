'use client'
import { C, NUM_FONT, GRADIENT } from '../../lib/nhl/theme'
import { setSport } from '../../lib/sport'
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


  return (
    <header style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
      {/* ── row 1: brand · account ── */}
      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '10px 16px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="/" title="DASH Network home — MOONSHOT · TUDDY · LAMP · FRANCHISE" aria-label="DASH Network home"
            style={{ display: 'flex', textDecoration: 'none', borderRadius: 10 }}>
            <div style={{ position: 'relative', width: 46, height: 46, borderRadius: 12, boxShadow: `0 0 18px ${C.ice}55` }}>
              <img src="/icon-192.png" alt="" width={46} height={46} style={{ display: 'block', width: '100%', height: '100%', borderRadius: 12 }} />
              {live > 0 && <div style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: '50%', background: C.lamp, border: `2px solid ${C.bg}` }} />}
            </div>
          </a>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <button type="button" onClick={() => go('home')} title="LAMP home — tonight in one page" aria-label="LAMP home" style={{
              padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1,
              backgroundImage: GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>LAMP</button>
            <span style={{ color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.14em', marginLeft: 6, alignSelf: 'center' }}>NHL</span>
            <span className="sport-switch" style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 8, alignSelf: 'center' }}>
              {[['mlb', 'MOONSHOT', C.orange], ['nfl', 'TUDDY', C.green]].map(([key, name, col]) => (
                <button key={key} type="button" onClick={() => setSport(key)} title={`Switch to ${name}`} aria-label={`Switch to ${name}`} style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 20, minHeight: 20, padding: '0 9px', lineHeight: 1,
                  fontSize: 9.5, fontWeight: 900, letterSpacing: '0.08em', borderRadius: 999, cursor: 'pointer',
                  border: `1px solid ${col}70`, background: `${col}10`, color: col,
                }}>{name}</button>
              ))}
            </span>
          </div>
        </div>
        {/* date · account · settings -- MOONSHOT's cluster, in LAMP's colours.
            Today / Tmrw move the shell's one day (LampDashboard); a day paged
            to in a tab shows here as its date with neither lit. The gear
            carries Quiet only: the palette and light/dark switches repaint
            MOONSHOT's and TUDDY's themes and do nothing to LAMP's, so they
            are not offered here. */}
        <div className="hdr-meta" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
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
        </div>
      </div>

      {/* ── row 2: the moving header, above the rail (as MOONSHOT's) ── */}
      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '0 16px 4px' }}>
        <LampTicker date={date} scores={scores} liveScores={liveScores} onOpenPlayer={onOpenPlayer} onOpenGame={onOpenGame} />
      </div>

      {/* TOP RAIL REMOVED (2026-09-28, Donovan: "remove the top line nav site wide... keep the bottom nav"). The dock (MobileTabBar) is the one navigation on every screen; its More is the side drawer. */}

    </header>
  )
}
