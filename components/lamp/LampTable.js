'use client'
import { useMemo } from 'react'
import DenseTable from '../DenseTable'
import { C, rampAt } from '../../lib/nhl/theme'
import { NHL_GLOSSARY } from '../../lib/nhl/glossary'
import { tagIdentity } from '../../lib/tableTags'

// 📊 LAMP'S TABLE — DenseTable with the hockey dictionary in it. The same
// binding-not-behaviour shape as components/nfl/NflTable.js: every LAMP
// table swaps one tag name and gets the glossary and the sport's accent.
// Tables lead every LAMP page (Donovan, 2026-09-14, standing rule).
export default function LampTable(props) {
  const columns = useMemo(() => tagIdentity(props.columns, 'nhl', props.rows), [props.columns, props.rows])
  // DenseTable's default caption says "each row opens that hitter" (MOONSHOT).
  // v2-only identity tags (logos, the phone fold); classic ignores them
  return <DenseTable {...props} columns={columns} caption={props.caption} dict={NHL_GLOSSARY} accent={C.ice} ramp={props.ramp ?? rampAt /* LAMP's ice ramp, not MOONSHOT's orange (2026-10-04 audit 04 A1) */} />
}
