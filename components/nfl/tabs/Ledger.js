'use client'
// TUDDY's Ledger: the shared Ledger page (components/pages/LedgerPage) with TUDDY's
// adapter (lib/sports/nfl/ledger.js) -- BATCH-ONE-SITE step 1, 2026-10-05.
import LedgerPage from '../../pages/LedgerPage'
import { useNflLedger } from '../../../lib/sports/nfl/ledger'

export default function Ledger(props) {
  return <LedgerPage {...useNflLedger(props)} />
}
