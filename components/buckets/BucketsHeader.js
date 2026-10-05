'use client'
import { C, NUM_FONT, GRADIENT } from '../../lib/nba/theme'
import HeaderShell from '../header/HeaderShell'
import SignUpPill from '../SignUpPill'
import DateMode from '../DateMode'
import SettingsSheet, { SheetLabel, SheetRow } from '../SettingsSheet'
import QuietButton from '../QuietButton'
import BucketsTicker from './BucketsTicker'
import { etToday } from '../../lib/freshness'
import { fmtDay, shiftDay } from './ui'

// 🏀 BUCKETS' HEADER -- LampHeader's shape on MOONSHOT's frame
// (components/header/HeaderShell.js): brand row (day · account · gear), the
// moving ticker, the rail. The BUCKETS wordmark is this product's home; the
// pills name the other products this visitor may see.
export default function BucketsHeader({ setTab, live = 0, date = null, setDate = () => {}, scores = null, liveScores = null, onOpenPlayer, onOpenGame }) {
  // the slate the server calls tonight (lib/slateNight): at 12:30 AM ET with a game still on, still yesterday
  const today = liveScores?.data?.date || etToday()
  const tomorrow = shiftDay(today, 1)
  return (
    <HeaderShell sport="nba" theme={C} wordmark={GRADIENT}
      onHome={() => setTab('home')} homeTitle="BUCKETS home — tonight in one page"
      glow={`${C.purple}55`} dot={live > 0 ? { color: C.rim, pulse: false } : null}
      meta={<>
        <DateMode label={fmtDay(date || scores?.data?.date || today)} value={!date ? 'today' : date === tomorrow ? 'tomorrow' : ''}
          onChange={(k) => setDate(k === 'tomorrow' ? tomorrow : null)}
          options={[{ key: 'today', text: 'Today', color: C.purple }, { key: 'tomorrow', text: 'Tmrw', color: C.teal }]}
          theme={C} numFont={NUM_FONT} />
        <SignUpPill accent={C.purple} />
        <SettingsSheet theme={C} accent={C.purple} title="View settings — quiet mode" hint="Quiet mode. Sticks on this device.">
          <SheetLabel theme={C}>View</SheetLabel>
          <SheetRow><QuietButton /></SheetRow>
        </SettingsSheet>
      </>}>
      <BucketsTicker date={date} scores={scores} liveScores={liveScores} onOpenPlayer={onOpenPlayer} onOpenGame={onOpenGame} />
    </HeaderShell>
  )
}
