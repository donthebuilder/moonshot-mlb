'use client'
import OpeningsTab from '../../openings/OpeningsTab'
import NflTable from '../NflTable'
import { Empty } from '../../ui'
import { DelayedBanner as SharedDelayedBanner } from '../../StaleBanner'
import { C, NUM_FONT, FIELD3D } from '../../../lib/nfl/theme'

// 🏈 TUDDY · OPENINGS (2026-10-26, Donovan: "just build an openings tab ... shared"): the shared openings page
// (components/openings/OpeningsTab.js) in TUDDY's table, green and field -- who gets the ball, the first touchdown, the first quarter.
const UI = {
  DelayedBanner: (props) => <SharedDelayedBanner theme={C} numFont={NUM_FONT} {...props} />,
  EmptyState: ({ title, note = null }) => <Empty title={title} note={note} tone={C.text3} theme={C} numFont={NUM_FONT} />,
  Loading: ({ what = 'it' }) => <div style={{ border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 24, textAlign: 'center', color: C.text3, fontSize: 12 }}>Reading {what}…</div>,
}
const FLOOR = { kind: 'field', turf1: C.turf1, turf2: C.turf2, endzone: FIELD3D.endzone, chalk: FIELD3D.chalk }
export default function Openings({ onOpenTeam = null, onOpenPlayer = null }) {
  return <OpeningsTab sport="nfl" url="/api/nfl/openings" Table={NflTable} C={C} NUM_FONT={NUM_FONT} accent={C.green} ui={UI} floor={FLOOR} onOpenTeam={onOpenTeam} onOpenPlayer={onOpenPlayer} />
}
