'use client'
import { useCallback } from 'react'
import { useInjuryLayer } from './InjuryLayer'
import { dropBlocked } from '../../lib/injuries/lookup'

/** (rows, who?) => rows without tonight's OUT / IL / DOUBTFUL men, from the shell's injury layer (lib/injuries dropBlocked). */
export function useAvailable() {
  const layer = useInjuryLayer()
  const index = layer?.index || null
  return useCallback((rows, who) => dropBlocked(index, rows, who), [index])
}
