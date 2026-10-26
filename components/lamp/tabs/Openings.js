'use client'
import OpeningsTab from '../../openings/OpeningsTab'
import LampTable from '../LampTable'
import { C, NUM_FONT, RINK } from '../../../lib/nhl/theme'
import { DelayedBanner, Loading, EmptyState } from '../ui'

// 🏒 LAMP · OPENINGS (2026-10-26, Donovan: "just build an openings tab ... shared"): the shared openings page
// (components/openings/OpeningsTab.js) in LAMP's table, ice and rink -- the faceoff, the first goal, the first period.
const UI = { DelayedBanner, Loading, EmptyState }
export default function Openings({ onOpenTeam = null, onOpenPlayer = null }) {
  return <OpeningsTab sport="nhl" url="/api/lamp/openings" Table={LampTable} C={C} NUM_FONT={NUM_FONT} accent={C.ice} ui={UI} floor={{ kind: 'rink', ...RINK }} onOpenTeam={onOpenTeam} onOpenPlayer={onOpenPlayer} />
}
