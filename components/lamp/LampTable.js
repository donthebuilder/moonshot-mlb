'use client'
import { useMemo } from 'react'
import DenseTable from '../DenseTable'
import { C, rampAt } from '../../lib/nhl/theme'
import { NHL_GLOSSARY } from '../../lib/nhl/glossary'
import { tagIdentity } from '../../lib/tableTags'
import { useSetColumns } from '../../lib/useColumnSet'

// 📊 LAMP'S TABLE — DenseTable with the hockey dictionary in it. The same
// binding-not-behaviour shape as components/nfl/NflTable.js: every LAMP
// table swaps one tag name and gets the glossary and the sport's accent.
// Tables lead every LAMP page (Donovan, 2026-09-14, standing rule).
export default function LampTable(props) {
  // `sets`: the board opted into the column-set switch (lib/columnViews.js); a table without it draws every column, as before
  const shown = useSetColumns(props.columns, props.sets, 'nhl')
  const columns = useMemo(() => tagIdentity(shown, 'nhl', props.rows), [shown, props.rows])
  // DenseTable's default caption says "each row opens that hitter" (MOONSHOT).
  // identity tags (logos, the phone fold)
  return <DenseTable {...props} columns={columns} caption={props.caption} dict={NHL_GLOSSARY} accent={C.ice} ramp={props.ramp ?? rampAt /* LAMP's ice ramp, not MOONSHOT's orange (2026-10-04 audit 04 A1) */} />
}
