// REMOVED 2026-10-06 (ledger audit P0-2). This file hard-coded the "clean
// pregame record, Sep 9-30" rates (TOP 42/227, HIT 142/220 ...), which counted
// nights whose boards were stamped after first pitch. Every surface now reads
// the lock-enforced numbers from ONE reader: /api/calibration?sport=mlb
// (lib/calibration/readMlbCalibration.js), shaped by lib/record/lockedRecord.js
// (server: readLockedRecord; client: lib/useLockedRecord.js). Nothing is typed.
export {}
