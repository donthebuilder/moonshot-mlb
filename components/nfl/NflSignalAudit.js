'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
import { NFL_DATA_BASE } from '../../lib/nfl/dataSource'
import { SignalRow } from '../SignalAudit'
import { SportTheme } from '../SportTheme'

// 🔬 SIGNALS — TUDDY's SignalAudit (2026-09-23). The NFL sibling of
// components/SignalAudit.js: every flag the football side wears, graded against
// real touchdowns, the same treatment the card gets.
//
// THE MATH IS NOT DONE HERE. The inputs are run-stamped archives on the data
// branch whose names a browser cannot guess, so bots/nfl/nfl_signal_audit.py
// does the grading and publishes nfl_signal_audit.json (a few KB). This file
// only renders it. Every number on screen has its origin in that script's
// docstring: each player frozen at the last run before HIS kickoff, pool =
// TD-scored players who actually played at an eligible position, baseline per
// flag = the TD rate where that field exists.
//
// NOTHING INVENTED. A flag with no graded weeks yet renders as BANKING with the
// date its history started — never a zero rate, never a placeholder number.

// The row and its verdict pill are MOONSHOT's (SignalRow in components/
// SignalAudit.js, 2026-09-29), drawn in TUDDY's theme.

const day = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function NflSignalAudit() {
  const [doc, setDoc] = useState(null)
  const [state, setState] = useState('loading')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await fetch(`${NFL_DATA_BASE}/nfl_signal_audit.json?t=${Date.now()}`, { cache: 'no-store' })
        if (r.status === 404) { if (alive) setState('missing'); return }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const j = await r.json()
        if (!alive) return
        if (!Array.isArray(j?.signals)) throw new Error('no signals array')
        setDoc(j); setState('ok')
      } catch (e) {
        console.error('[NflSignalAudit] fetch failed:', e)
        if (alive) setState('error')
      }
    })()
    return () => { alive = false }
  }, [])

  const note = (text) => (
    <div style={{
      border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 22,
      textAlign: 'center', color: C.text3, fontSize: TYPE.body, lineHeight: 1.6,
    }}>{text}</div>
  )

  if (state === 'loading') return note('Auditing the archive…')
  if (state === 'missing') return note('The signal audit is not out yet. It updates after games are graded.')
  if (state === 'error') return note(<><b style={{ color: C.text2 }}>AUDIT DELAYED</b><br />We couldn’t load the latest signal audit. The rest of this tab is unaffected.</>)

  const weeks = doc.graded_weeks || []
  const poolN = (doc.weeks || []).reduce((s, w) => s + (w.pool_n || 0), 0)
  const minN = doc.min_n || 40
  // Rows with a real verdict first (by lift), then too-young samples, then
  // banking. Sorting on lift alone put a 2-for-2 "young" row above an earned
  // verdict, which reads as the strongest finding on the page when it is the
  // weakest.
  const TIER = { earning: 0, flat: 0, failing: 0, young: 1, banking: 2 }
  const rows = [...doc.signals].sort((a, b) =>
    (TIER[a.verdict] ?? 1) - (TIER[b.verdict] ?? 1) || (b.lift ?? -99) - (a.lift ?? -99))

  return (
    <SportTheme theme={C} accent={C.green}>
    <div>
      <div style={{ fontSize: TYPE.body, color: C.text2, lineHeight: 1.65, marginBottom: 12, maxWidth: 760 }}>
        Every flag TUDDY shows, graded like a pick: touchdown rate when the flag was on vs the baseline
        of every player who could have worn it, across{' '}
        <b style={{ fontFamily: NUM_FONT }}>{weeks.length}</b> graded week{weeks.length !== 1 ? 's' : ''}
        {' '}({poolN.toLocaleString()} player-games). Each player is graded on the flag as it stood before
        his own kickoff. Nothing gets a verdict below {minN} flagged player-games.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r) => {
          const graded = r.n > 0
          return (
            <SignalRow key={r.key} r={r} note={r.note}>
              {graded ? (
                <span style={{ fontSize: 10, fontFamily: NUM_FONT, color: C.text2 }}>
                  {r.rate.toFixed(1)}% vs {r.base.toFixed(1)}% base
                  {r.invert ? (
                    <>
                      {' '}· <b>{r.rate >= r.base ? '+' : '−'}{Math.abs(r.rate - r.base).toFixed(1)}pp raw</b>
                      {' '}· <b style={{ color: r.lift >= 0 ? C.green : C.text3 }}>claim {r.lift >= 0 ? 'met' : 'missed'}</b>
                    </>
                  ) : (
                    <>{' '}· <b style={{ color: r.lift >= 0 ? C.green : C.text3 }}>{r.lift >= 0 ? '+' : ''}{r.lift.toFixed(1)}pts</b></>
                  )}
                  <span style={{ color: C.text3 }}> · {r.td} of {r.n} scored</span>
                </span>
              ) : (
                <span style={{ fontSize: 10, color: C.text3 }}>
                  No graded week yet — history banking since {day(r.banking_since) || 'the first run that recorded it'}.
                  Fills in once that week is final.
                </span>
              )}
            </SignalRow>
          )
        })}
      </div>

      <div style={{ fontSize: TYPE.micro, color: C.text3, marginTop: 10, lineHeight: 1.6, maxWidth: 760 }}>
        Touchdowns are the yardstick for every row: rushing + receiving, for RB/WR/TE who played.
        No history is backfilled — a flag has to be the one that stood before the game, so the newer
        flags start counting from the day TUDDY began recording them.
        {doc.generated_at && <> Audit updated {day(doc.generated_at)}.</>}
      </div>
    </div>
    </SportTheme>
  )
}
