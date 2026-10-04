'use client'
import { useMemo } from 'react'
import DenseTable from '../DenseTable'
import { C } from '../../lib/nba/theme'
import { NBA_GLOSSARY } from '../../lib/nba/glossary'
import { tagIdentity } from '../../lib/tableTags'

// 📊 BUCKETS' TABLE -- DenseTable with the basketball dictionary, the same
// binding-not-behaviour shape as LampTable / NflTable: every BUCKETS table
// swaps one tag name and gets the glossary, the logos and the accent.
export default function BucketsTable(props) {
  const columns = useMemo(() => tagIdentity(props.columns, 'nba', props.rows), [props.columns, props.rows])
  return <DenseTable {...props} columns={columns} caption={props.caption} dict={NBA_GLOSSARY} accent={C.purple} />
}
