'use client'
// THE LEDGER'S SHELL, ONE FOR EVERY SPORT (2026-10-07; Donovan 10-06: "one coherent DASH ledger
// concept ... visible, trustworthy, easy to understand"). Each sport had two or three ledger-ish pages
// under More with near-identical names; they are one thing seen four ways. This is the frame: four
// sub-tabs in one order and one set of words -- TONIGHT | CALLED | RECORD | ARCHIVE (lib/ledger/views.js) --
// around the pages each sport already has. It lays out NO content of its own: every body is the sport's
// existing component, handed in as a function so only the open one is built.
//
//   <LedgerShell sport="nhl" bodies={{ tonight: () => <Ledger/>, called: () => <LampLedger/>,
//                                      record: () => <Results/>, archive: () => <LampLedger initialView="season"/> }} />
//
// A sport with no body for a sub-tab simply doesn't show it (BUCKETS has no called table or archive yet).
// `bands` is an optional second pill INSIDE Record (MLB's Score bands).
//
// THE SUB-TAB IS IN THE ADDRESS (`lv=`, lib/ledger/views.js): a refresh or a shared link reopens it,
// choosing one pushes an entry so Back steps back through them, and an old key (#tab=calledledger,
// setTab('results')) lands on the right one. Phone first: four 44px targets across one row.
import { useCallback, useEffect, useState } from 'react'
import { useSportTheme } from '../SportTheme'
import ErrorBoundary from '../ErrorBoundary'
import HelpTip from '../HelpTip'
import TopTotals from '../TopTotals'
import {
  LEDGER_VIEWS, ledgerWord, ledgerBlurb, cleanView, tabOfView,
  readLedgerView, writeLedgerView, takeLedgerView, peekLedgerView,
} from '../../lib/ledger/views'

export default function LedgerShell({ sport, bodies = {} }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  const shown = LEDGER_VIEWS.filter((v) => typeof bodies[v] === 'function')
  const pick = (raw) => {
    const v = cleanView(raw)
    if (v === 'bands') return bodies.bands ? 'bands' : 'record'
    return shown.includes(v) ? v : 'tonight'
  }
  // the address says; a queued sub-tab (an old key opened from inside the app) wins on arrival
  const [view, setView] = useState(() => {
    if (typeof window === 'undefined') return 'tonight'
    return pick(peekLedgerView() || readLedgerView())
  })

  const choose = useCallback((next) => {
    setView((cur) => (cur === next ? cur : next))
    writeLedgerView(next, { push: true })
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  // a cold arrival on a queued or aliased sub-tab: put it in the address (a replace -- same page)
  useEffect(() => {
    takeLedgerView()
    if (readLedgerView() !== view) writeLedgerView(view, { push: false })
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Back / Forward / a typed lv= : follow the address
    const onHash = () => setView(pick(readLedgerView()))
    // an old key opened from inside the app while this is already showing
    const onQueued = () => { const q = takeLedgerView(); if (q) choose(pick(q)) }
    window.addEventListener('hashchange', onHash)
    window.addEventListener('ledgerview', onQueued)
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('ledgerview', onQueued) }
  }, [choose])   // eslint-disable-line react-hooks/exhaustive-deps

  const active = tabOfView(view)
  const body = bodies[view] || bodies[active]
  const pill = (on) => ({
    minHeight: 44, minWidth: 0, padding: '0 4px', borderRadius: 10, cursor: 'pointer',
    border: `1px solid ${on ? `${accent}99` : C.border}`,
    background: on ? `${accent}22` : 'rgba(255,255,255,.035)',
    color: on ? accent : C.text2,
    font: `800 11px/1.2 ${NUM_FONT}`, letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
  })

  return (
    <div data-ledger-shell={sport}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 2px 6px', font: `900 11px/1 ${NUM_FONT}`, letterSpacing: '.14em', color: C.text3 }}>
        <span aria-hidden="true">{'\u{1F4D2}'}</span><span>THE LEDGER</span>
        <HelpTip label={ledgerWord(sport, active)} color={C.text3} text={ledgerBlurb(sport, active)} />
      </div>
      <div role="tablist" aria-label="The Ledger" style={{ display: 'grid', gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))`, gap: 6 }}>
        {shown.map((v) => (
          <button key={v} type="button" role="tab" aria-selected={active === v} data-lv={v}
            onClick={() => choose(v)} style={pill(active === v)}>
            {ledgerWord(sport, v)}
          </button>
        ))}
      </div>
      <div style={{ height: 12 }} />
      {active === 'record' && bodies.bands && (
        <div role="tablist" aria-label="The record" style={{ display: 'flex', gap: 6, margin: '0 0 12px' }}>
          {[['record', 'The record'], ['bands', 'Score bands']].map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} data-lv={k} onClick={() => choose(k)}
              style={{ ...pill(view === k), padding: '0 14px', textTransform: 'none', letterSpacing: '.02em' }}>{label}</button>
          ))}
        </div>
      )}
      <ErrorBoundary resetKey={view} label={`the Ledger's ${view} view`}>
        <div role="tabpanel" key={view}>{body ? body() : null}</div>
        {/* TOP TOTALS (2026-10-09): the market's record and graded rows ride the Record view of every sport's Ledger */}
        {active === 'record' && <div style={{ marginTop: 12 }}><TopTotals sport={sport} mode="record" /></div>}
      </ErrorBoundary>
    </div>
  )
}
