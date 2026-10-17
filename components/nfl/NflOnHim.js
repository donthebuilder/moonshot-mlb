'use client'
// TUDDY ON HIM, THE ROLE TABLE (2026-10-17, player-portal mirror pass). MOONSHOT's card closes its Overview's top with "MOONSHOT ON
// HIM: n games on the clean pregame record" and a role table (components/BotOnHim.js). This is the same section, built from that
// component (BotRoleTable) with TUDDY's rows: each role TUDDY has called him in (the touchdown market), judged on its job, from the
// graded calls /called and the Record read. Football has no handedness or home / away split on that list, so those columns are not
// drawn (nothing is guessed in their place). Research, not a call. No graded call -> no section, as MOONSHOT's.
import { BotRoleTable } from '../BotOnHim'
import NflTable from './NflTable'
import HelpTip from '../HelpTip'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { nflRoleRows, nflSampleLine } from '../player/nflAdapter'

const TEXT = 'Each role TUDDY has called him in, judged on that role’s job, from the graded calls on the locked record. Small samples: a lead, not a fact.'

export default function NflOnHim({ bot }) {
  const rows = nflRoleRows(bot)
  if (!rows.length) return null
  const columns = [
    { key: 'role', label: 'Role', group: 'Role', sticky: true, heat: false, w: 96, fmt: (v, r) => <span style={{ display: 'grid', lineHeight: 1.2 }}><b>{v}</b>{r.job ? <span style={{ fontSize: 11, color: C.text3 }}>job: {r.job}</span> : null}</span> },
    { key: 'g', label: 'G', group: 'All calls', w: 34, heat: false, numeric: true, title: 'Games he was called in that were graded (voids out)' },
    { key: 'hit', label: 'Cleared', group: 'All calls', w: 58, heat: false, numeric: true, title: 'Calls where he scored' },
    { key: 'miss', label: 'Missed', group: 'All calls', w: 54, heat: false, numeric: true },
    { key: 'did', label: 'Did the job', group: 'All calls', w: 66, heat: false, title: 'Cleared that role’s bar, of the games he was called in' },
    { key: 'last', label: 'Last call', group: 'Latest', w: 104, heat: false },
    { key: 'lastOpp', label: 'Opp', group: 'Latest', w: 44, heat: false },
    { key: 'price', label: 'Price', group: 'Latest', w: 54, heat: false, title: 'The best price at the lock for that call' },
  ]
  const sub = <>{nflSampleLine(bot)}<HelpTip label="Role record" text={TEXT} /></>
  return <BotRoleTable brand="TUDDY" sub={sub} rows={rows} columns={columns} Table={NflTable} theme={C} numFont={NUM_FONT} accent={C.green} hint="Swipe for the latest call" caption={TEXT} />
}
