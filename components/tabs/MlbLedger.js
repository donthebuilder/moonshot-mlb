'use client'
// 🧾 THE LEDGER, ITS OWN TAB (2026-09-27, ledger plan step 3). Donovan: "i
// like this page a lot" -- and it was hidden inside Parlays, where nobody
// looks for it. Since 2026-10-05 (BATCH-ONE-SITE step 1) it is the shared Ledger
// page (components/pages/LedgerPage) with MOONSHOT's adapter (lib/sports/mlb/ledger.js);
// the Ledger lab (past nights, the season record, search) stays one tap away.
import LedgerPage from '../pages/LedgerPage'
import { useMlbLedger } from '../../lib/sports/mlb/ledger'

export default function MlbLedger(props) {
  return <LedgerPage {...useMlbLedger(props)} />
}
