'use client'
// The one MLB record number, for client surfaces (2026-10-06, ledger audit P0-2):
// /api/calibration?sport=mlb (30 min cache, the table the Record page prints)
// turned into the locked record by lib/record/lockedRecord.js. null until it
// loads; a surface prints "loading", never a typed number.
import { useMemo } from 'react'
import { useLiveFetch } from './useLiveFetch'
import { lockedRecordFrom } from './record/lockedRecord'

export function useLockedRecord() {
  const { data } = useLiveFetch('/api/calibration?sport=mlb')
  return useMemo(() => (data ? lockedRecordFrom(data) : null), [data])
}
