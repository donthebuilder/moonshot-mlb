'use client'
import MobileTabBar from '../MobileTabBar'
import { C } from '../../lib/nba/theme'
import { NBA_NAV, NBA_MORE_GROUPS } from '../../lib/nba/routes'

// BUCKETS' phone bar: the shared MobileTabBar with basketball's words, read
// from lib/nba/routes.js -- the shape of MobileTabBarLamp. Props · Boards ·
// Live · Slate, the words the other three bars use; the wordmark is home.
const MAIN_KEYS = ['board', 'fullboard', 'scores', 'games']
const MAIN = MAIN_KEYS.map((k) => [k, NBA_NAV[k].icon, NBA_NAV[k].label])
const MORE = [
  ['@Tonight', ''],
  ['home', NBA_NAV.home.label, NBA_NAV.home.blurb],
  ...NBA_MORE_GROUPS.flatMap(([group, keys]) => [[`@${group}`, ''], ...keys.map((k) => [k, NBA_NAV[k].label, NBA_NAV[k].blurb])]),
]

export default function MobileTabBarBuckets({ tab, setTab }) {
  return <MobileTabBar tab={tab} setTab={setTab} main={MAIN} more={MORE} brand="BUCKETS" accent={C.purple} />
}
