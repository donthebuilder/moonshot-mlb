'use client'
import { useState } from 'react'
import { NHL_NAV, NHL_MORE_GROUPS } from '../../lib/nhl/routes'
import { C, NUM_FONT, GRADIENT } from '../../lib/nhl/theme'
import { setSport } from '../../lib/sport'
import SignUpPill from '../SignUpPill'
import { LampDot } from './ui'

// 🏒 LAMP'S HEADER — the same three rows MOONSHOT's and TUDDY's headers
// settled on (brand row · [ticker] · rail), minus the ticker, which arrives
// with the live wire in Phase 4 rather than as an empty strip now.
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
const PRIMARY = ['scores', 'schedule', 'standings', 'players', 'leaders']

export default function LampHeader({ tab, setTab, live = 0 }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const go = (next) => { setMoreOpen(false); setTab(next) }
  const inMore = (key) => !PRIMARY.includes(key) && key !== 'home'

  const tabBtn = (key, label, active, onClick, extra = {}) => (
    <button key={key} type="button" onClick={onClick} {...extra} aria-current={active ? 'page' : undefined} style={{
      padding: '0 10px', height: 44, fontSize: 11.5, fontWeight: active ? 800 : 600, letterSpacing: '.01em',
      cursor: 'pointer', border: 'none', borderRadius: 0, background: 'transparent',
      color: active ? C.ice : C.text3, position: 'relative', whiteSpace: 'nowrap', flex: '1 1 0', textAlign: 'center',
    }}>
      {label}
      {active && <div style={{ position: 'absolute', bottom: 0, left: 8, right: 8, height: 2, background: GRADIENT, borderRadius: '2px 2px 0 0' }} />}
    </button>
  )

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {live > 0 && <span style={{ color: C.lamp, font: `900 9px/1 ${NUM_FONT}`, letterSpacing: '.1em' }}><LampDot />{live} LIVE</span>}
          <SignUpPill accent={C.ice} />
        </div>
      </div>

      {/* ── row 2: the rail ── */}
      <nav className="rail lamp-header-rail" aria-label="LAMP sections" style={{ maxWidth: 1300, margin: '0 auto', padding: '0 16px 6px', display: 'flex', alignItems: 'stretch', width: '100%' }}>
        {PRIMARY.map((key) => tabBtn(key, `${NHL_NAV[key].icon} ${NHL_NAV[key].label}`, tab === key, () => go(key)))}
        {tabBtn('more', '••• More', inMore(tab), () => setMoreOpen((o) => !o), { 'aria-expanded': moreOpen })}
      </nav>

      {moreOpen && (
        <div className="lamp-header-more" style={{ borderTop: `1px solid ${C.border}`, background: C.bg2 }}>
          <div style={{ maxWidth: 1300, margin: '0 auto', padding: '9px 16px 11px', display: 'grid', gap: 6 }}>
            <a href="/" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 10px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.glass, color: C.text2, fontSize: 10, fontWeight: 750, textDecoration: 'none' }}>
              <span style={{ color: C.ice }}>⌂ DASH HOME</span>
              <span style={{ color: C.text3, fontWeight: 600 }}>Tonight across MOONSHOT · TUDDY · LAMP · FRANCHISE →</span>
            </a>
            {NHL_MORE_GROUPS.map(([group, keys]) => (
              <div key={group}>
                <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: '.14em', color: C.text3, textTransform: 'uppercase', margin: '8px 2px 5px' }}>{group}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(118px,1fr))', gap: 6 }}>
                  {keys.map((key) => (
                    <button key={key} type="button" onClick={() => go(key)} title={NHL_NAV[key].blurb} style={{
                      padding: '9px 10px', border: `1px solid ${tab === key ? C.ice + '66' : C.border}`, borderRadius: 8,
                      background: tab === key ? `${C.ice}20` : C.glass, color: tab === key ? C.ice : C.text2,
                      fontSize: 10, fontWeight: 750, textAlign: 'left', cursor: 'pointer',
                    }}>{NHL_NAV[key].icon} {NHL_NAV[key].label}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <style>{`
        @media (max-width: 760px) {
          .lamp-header-rail, .lamp-header-more { display: none !important; }
        }
      `}</style>
    </header>
  )
}
