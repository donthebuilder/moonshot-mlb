'use client'
// The calibration table for /called, one entry per sport (2026-10-06): the product's own table
// wrapper and theme, so TUDDY / LAMP / BUCKETS keep their own accent outside the app shell.
// Inside the app each record tab mounts CalibrationTable with its own Table directly.
import DenseTable from '../DenseTable'
import NflTable from '../nfl/NflTable'
import LampTable from '../lamp/LampTable'
import BucketsTable from '../buckets/BucketsTable'
import { SportTheme } from '../SportTheme'
import CalibrationTable from './CalibrationTable'
import StraightRecordLine from './StraightRecordLine'
import CardSection from '../card/CardSection'
import { C as NFL_C, NUM_FONT as NFL_NUM } from '../../lib/nfl/theme'
import { C as NHL_C, NUM_FONT as NHL_NUM } from '../../lib/nhl/theme'
import { C as NBA_C, NUM_FONT as NBA_NUM } from '../../lib/nba/theme'

const PRODUCTS = {
  mlb: { Table: DenseTable, theme: null },
  nfl: { Table: NflTable, theme: NFL_C, accent: NFL_C.green, numFont: NFL_NUM },
  nhl: { Table: LampTable, theme: NHL_C, accent: NHL_C.ice, numFont: NHL_NUM },
  nba: { Table: BucketsTable, theme: NBA_C, accent: NBA_C.purple, numFont: NBA_NUM },
}

export default function CalibrationSection({ sport = 'mlb' }) {
  const p = PRODUCTS[sport] || PRODUCTS.mlb
  return (
    <SportTheme theme={p.theme} accent={p.accent} numFont={p.numFont}>
      <StraightRecordLine sport={sport} />
      <CardSection sport={sport} mode="record" />
      <CalibrationTable sport={sport} Table={p.Table} />
    </SportTheme>
  )
}
