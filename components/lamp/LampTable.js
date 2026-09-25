'use client'
import DenseTable from '../DenseTable'
import { C } from '../../lib/nhl/theme'
import { NHL_GLOSSARY } from '../../lib/nhl/glossary'

// 📊 LAMP'S TABLE — DenseTable with the hockey dictionary in it. The same
// binding-not-behaviour shape as components/nfl/NflTable.js: every LAMP
// table swaps one tag name and gets the glossary and the sport's accent.
// Tables lead every LAMP page (Donovan, 2026-09-14, standing rule).
export default function LampTable(props) {
  return <DenseTable {...props} dict={NHL_GLOSSARY} accent={C.ice} />
}
