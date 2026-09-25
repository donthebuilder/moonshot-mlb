'use client'
import MobileTabBar from '../MobileTabBar'
import { NHL_NAV, NHL_MORE_GROUPS } from '../../lib/nhl/routes'

// LAMP's phone bar: the shared MobileTabBar with hockey's words, read from
// the one table in lib/nhl/routes.js — same shape as MobileTabBarNfl.js.
// The wordmark is home, as on the other two bars.
// Four stops plus More, the same count MOONSHOT's bar carries (2026-09-25:
// Players joined once the directory existed).
const MAIN_KEYS = ['scores', 'schedule', 'standings', 'players']
const MAIN = MAIN_KEYS.map((k) => [k, NHL_NAV[k].icon, NHL_NAV[k].label])

const MORE = [
  ['@Tonight', ''],
  ['home', NHL_NAV.home.label, NHL_NAV.home.blurb],
  ...NHL_MORE_GROUPS.flatMap(([group, keys]) => [
    [`@${group}`, ''],
    ...keys.map((k) => [k, NHL_NAV[k].label, NHL_NAV[k].blurb]),
  ]),
]

export default function MobileTabBarLamp({ tab, setTab }) {
  return <MobileTabBar tab={tab} setTab={setTab} main={MAIN} more={MORE} brand="LAMP" />
}
