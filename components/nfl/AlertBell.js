'use client'
// TUDDY's bell is the shared one (components/AlertBell.js), in TUDDY's theme.
import SharedBell from '../AlertBell'
import { SportTheme } from '../SportTheme'
import { C, NUM_FONT } from '../../lib/nfl/theme'

export default function AlertBell(props) {
  return <SportTheme theme={C} accent={C.green} numFont={NUM_FONT}><SharedBell what="touchdowns, kickoffs and bar clears for your followed players" {...props} /></SportTheme>
}
