'use client'
// LAMP's Ledger: the shared Ledger page (components/pages/LedgerPage) with LAMP's
// adapter (lib/sports/nhl/ledger.js) -- BATCH-ONE-SITE step 1, 2026-10-05.
import LedgerPage from '../../pages/LedgerPage'
import { useNhlLedger } from '../../../lib/sports/nhl/ledger'

export default function Ledger(props) {
  return <LedgerPage {...useNhlLedger(props)} />
}
