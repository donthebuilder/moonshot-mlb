'use client'
import { useMemo } from 'react'
import DenseTable from '../DenseTable'
import { C } from '../../lib/nhl/theme'
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
  return <DenseTable {...props} columns={columns} caption={props.caption || 'Ranked board. Column headers sort; each row opens that skater.'} dict={NHL_GLOSSARY} accent={C.ice} />
}
