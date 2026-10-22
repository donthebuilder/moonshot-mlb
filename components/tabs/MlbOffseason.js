'use client'
// MOONSHOT'S HOME IN THE OFFSEASON (2026-10-21, BATCH-MLB-OFFSEASON B1). Shown by components/tabs/Home.js only when lib/mlb/phase.js says OFFSEASON
// (about three days after the last World Series game, with the jobs). Answer first, then the record, then what's live:
//   1. the word: OFFSEASON, and one line under it
//   2. FALL BALL while the Arizona Fall League plays (today's games from MLB's schedule, or the next one); nothing when it's over
//   3. THE 2026 RECORD: the locked record (lib/useLockedRecord.js, the Record page's own reader) in the record table's own columns
//      (components/home/RecordBlocks.js), never a typed number
//   4. where the season lives all winter: every CALLED receipt (/called), the homer ledger, the season leaders
// Fall ball and the simulator get their own pages in B2 / B3; until then this page links nowhere it can't keep.
import Link from 'next/link'
import DenseTable from '../DenseTable'
import { Themed } from '../record/LadderBlock'
import { columns } from '../home/RecordBlocks'
import { C, NUM_FONT } from '../../lib/theme'
import { useLockedRecord } from '../../lib/useLockedRecord'
import { pickRange, lockedCallsLine, LOCKED_PICKS } from '../../lib/record/lockedRecord'
import { localTime } from '../../lib/localTime'
import { FALL } from '../../lib/mlb/phase'

const kicker = { font: `900 12px/1 ${NUM_FONT}`, letterSpacing: '.14em', color: C.orange, margin: '0 0 8px' }
const dayWord = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })

function Lane({ phase }) {
  if (phase?.lane !== 'FALL') return null
  const games = phase.laneGames || []
  return (
    <section aria-label="Fall ball" style={{ margin: '0 0 22px' }}>
      <p style={kicker}>FALL BALL · {FALL.name.toUpperCase()}</p>
      {games.length ? (
        <>
          <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.15, color: C.text }}>{games.length} {games.length === 1 ? 'game' : 'games'} today</div>
          <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
            {games.map((g) => (
              <li key={g.pk} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: `1px solid ${C.border}`, fontSize: 14 }}>
                <span>{g.away.name} <span style={{ color: C.text3 }}>at</span> {g.home.name}</span>
                <span style={{ color: C.text2, fontFamily: NUM_FONT, whiteSpace: 'nowrap' }}>{g.state === 'Final' ? 'Final' : g.state === 'Live' ? 'Live' : (g.start ? localTime(g.start) : '')}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p style={{ margin: 0, fontSize: 14, color: C.text2 }}>
          No fall league games today.{phase.next ? ` Next: ${dayWord(phase.next.date)}, ${phase.next.away.name} at ${phase.next.home.name}.` : ''}
        </p>
      )}
      <p style={{ margin: '6px 0 0', fontSize: 12, color: C.text3 }}>The top prospects, with exit velocity on every ball in play. Not part of the MOONSHOT record.</p>
    </section>
  )
}

function Record() {
  const rec = useLockedRecord()
  if (!rec) return <p style={{ fontSize: 13, color: C.text3 }}>Loading the 2026 record.</p>
  const rows = Object.entries(LOCKED_PICKS).map(([k, d]) => {
    const p = rec.picks[k]
    if (!p || !p.n) return null
    return { key: k, label: d.label, bar: d.bar, scored: `${p.ok}/${p.n}`, ratev: p.enough ? p.pct : null, band: pickRange(p) || '—', base: p.base != null ? `${p.base.toFixed(1)}%${p.baseN ? ` of ${p.baseN.toLocaleString('en-US')}` : ''}` : '—' }
  }).filter(Boolean)
  const n = rows.reduce((a, r) => a + Number(String(r.scored).split('/')[1] || 0), 0)
  return (
    <section aria-label="The 2026 record" style={{ margin: '0 0 22px' }}>
      <p style={kicker}>THE 2026 RECORD</p>
      <Themed sport="mlb">
        <DenseTable rows={rows} columns={columns(C.orange, C, false)} heatMode="none" bare maxHeight={9999} maxRows={rows.length} accent={C.orange} caption="MOONSHOT's 2026 record, every call type" />
      </Themed>
      <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5, color: C.text3 }}>{lockedCallsLine(rec, n)} ({rec.window}). It stays up all winter.</p>
    </section>
  )
}

export default function MlbOffseason({ phase, onNavigate }) {
  const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, borderTop: `1px solid ${C.border}`, color: C.text, fontSize: 15, fontWeight: 700, textDecoration: 'none', background: 'none', border: 'none', borderTopStyle: 'solid', borderTopWidth: 1, borderTopColor: C.border, width: '100%', padding: 0, cursor: 'pointer', font: 'inherit' }
  return (
    <div style={{ padding: '6px 0 24px' }}>
      <header style={{ margin: '0 0 20px' }}>
        <p style={kicker}>MOONSHOT · OFFSEASON</p>
        <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.15, color: C.text }}>The season is in the books. <span style={{ color: C.orange }}>Every call stays up all winter.</span></div>
        {phase?.forced ? <p style={{ margin: '6px 0 0', fontSize: 12, color: C.text3 }}>Preview: the offseason is forced on this page (?mlbPhase=offseason).</p> : null}
      </header>
      <Lane phase={phase} />
      <Record />
      <nav aria-label="The season" style={{ display: 'flex', flexDirection: 'column' }}>
        <Link href="/called" style={row}><span>Every CALLED receipt</span><span style={{ color: C.orange }}>→</span></Link>
        {onNavigate ? <button type="button" onClick={() => onNavigate('ledger')} style={row}><span>The homer ledger</span><span style={{ color: C.orange }}>→</span></button> : null}
        {onNavigate ? <button type="button" onClick={() => onNavigate('leaders')} style={row}><span>Season leaders</span><span style={{ color: C.orange }}>→</span></button> : null}
      </nav>
    </div>
  )
}
