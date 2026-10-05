'use client'
// BUCKETS' Ledger: the shared Ledger page (components/pages/LedgerPage) with BUCKETS'
// adapter (lib/sports/nba/ledger.js) -- BATCH-ONE-SITE step 1, 2026-10-05.
import LedgerPage from '../../pages/LedgerPage'
import { useNbaLedger } from '../../../lib/sports/nba/ledger'

export default function Ledger(props) {
  return <LedgerPage {...useNbaLedger(props)} />
}
