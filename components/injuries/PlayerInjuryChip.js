'use client'
// The availability chip in a player page's header (any sport): OUT / IL / D / Q / DTD from the shared injury layer. Information only; tap
// explains (status, note, ESPN, time). Renders nothing for a man the report does not list, and nothing while the report loads or when it is
// unavailable (the Out module says so; a header never claims "healthy").
import InjuryChip from './InjuryChip'
import { useInjuryLayer } from './InjuryLayer'
import { useSportTheme } from '../SportTheme'

export default function PlayerInjuryChip({ who, C = null, font = null, size = 10 }) {
  const layer = useInjuryLayer()
  const theme = useSportTheme()
  const entry = layer?.entryFor ? layer.entryFor(who) : null
  if (!entry) return null
  return <InjuryChip entry={entry} C={C || theme.C} font={font || theme.NUM_FONT} size={size} style={{ marginLeft: 8 }} />
}
