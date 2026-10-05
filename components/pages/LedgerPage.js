'use client'
// ONE LEDGER PAGE, EVERY SPORT (BATCH-ONE-SITE step 1, 2026-10-05). The page around the
// ledger: header (props, or a ready node when it carries live stats) -> picker (BUCKETS' day pager) -> TONIGHT (step 5:
// the Home strip -- WENT / LINING UP / STILL TO GO, lib/tonight.js -- the same three rows on every Ledger) -> lead (BUCKETS' table) -> the frame
// with the sections in their one order (components/ledger/LedgerBody) -> the first
// scorer of each game -> footer. A sport's tab passes its adapter's props
// (lib/sports/<sport>/ledger.js); it doesn't lay the page out itself.
import PageHeader from '../PageHeader'
import { LedgerFrame, LedgerHead } from '../ledger/LedgerBlocks'
import LedgerBody from '../ledger/LedgerBody'
import FirstScorers from '../ledger/FirstScorers'

export default function LedgerPage({ head, headNode = null, picker = null, tonight = null, lead = null, frame, sections, first = null, footer = null, gap = 12 }) {
  const header = frame?.header && !frame.header.$$typeof && frame.header.title ? <LedgerHead {...frame.header} /> : frame?.header || null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {headNode || (head ? <PageHeader {...head} /> : null)}
      {picker}
      {tonight}
      {lead}
      {frame ? (
        <LedgerFrame accent={frame.accent} header={header}>
          <LedgerBody sections={sections} />
        </LedgerFrame>
      ) : null}
      {first ? <FirstScorers {...first} /> : null}
      {footer}
    </div>
  )
}
