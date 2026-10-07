'use client'
import StatStrip from '../../StatStrip'
import StreakRibbon, { StreakLine } from '../../StreakRibbon'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { verdictInk } from '../../../lib/scales'
import { marketOf, runRead, ribbonOf, daysBetween } from '../../../lib/nhl/goalLog'

// 🔥 HIS RUN (MOONSHOT lib/runs.js readRun + components/runs/RunParts.js; TUDDY's
// twin is lib/nfl/streaks.js). The active run at the bar picked in the grid:
// games in a row with a goal, or games since his last one, his own longest of
// each, and the sequence drawn as MOONSHOT's ribbon (warm = at the bar, cool =
// without it). A run counts games he PLAYED -- a game he sat out is not a miss.
export default function GoalRun({ rows, bar, line, today }) {
  const mk = marketOf(bar.mkt)
  const rd = runRead(rows, mk.stat, line)
  if (!rd) return null
  const word = mk.key === 'g' ? (line === 1 ? 'goal' : `${line}+ goals`) : `${line}+ ${mk.label.toLowerCase()}`
  const warm = verdictInk(true).color; const cool = verdictInk(false).color
  const hot = rd.run > 0
  const stale = today && rows[0]?.date ? daysBetween(rows[0].date, today) : null
  const stats = [
    { id: 'now', label: hot ? 'RUN' : `SINCE LAST ${mk.key === 'g' && line === 1 ? 'GOAL' : 'BAR'}`, text: hot ? `${rd.run}` : rd.never ? `${rd.n}+` : `${-rd.run}`, color: hot ? warm : cool, title: hot ? `${rd.run} straight games with ${word}.` : rd.never ? `No ${word} in any of the ${rd.n} games on file.` : `${-rd.run} straight games without ${word}.` },
    { id: 'best', label: 'LONGEST RUN', text: rd.bestHit ? `${rd.bestHit}` : '—', title: `His longest run of games with ${word} in the ${rd.n} games on file.` },
    { id: 'cold', label: 'LONGEST DROUGHT', text: rd.bestMiss ? `${rd.bestMiss}` : '—', title: `His longest run of games without ${word} in the ${rd.n} games on file.` },
  ]
  return (
    <div>
      <StatStrip stats={stats} />
      <div style={{ color: C.text2, fontSize: 12, lineHeight: 1.55, marginTop: 8 }}>
        {rd.never
          ? <>No {word} in the <b style={{ color: C.text, fontFamily: NUM_FONT }}>{rd.n}</b> games on file.</>
          : hot
            ? <><b style={{ color: warm, fontFamily: NUM_FONT }}>{rd.run}</b> {rd.run === 1 ? 'game' : 'games'} in a row with {word}
                {rd.atBest && rd.run > 1 ? <>: his longest run of the season{rd.prevBestHit ? <>, past a previous best of {rd.prevBestHit}</> : null}.</> : rd.bestHit > rd.run ? <>; his longest is {rd.bestHit}.</> : '.'}</>
            : <><b style={{ color: cool, fontFamily: NUM_FONT }}>{-rd.run}</b> {-rd.run === 1 ? 'game' : 'games'} since his last {word}
                {rd.lastRow ? <> ({rd.lastRow.date} {rd.lastRow.home ? 'vs' : '@'} {rd.lastRow.opp})</> : null}
                {rd.bestMiss > -rd.run ? <>; his longest drought is {rd.bestMiss}.</> : rd.bestMiss ? <>: his longest drought of the season so far.</> : '.'}</>}
        {rd.l10 && <> In his last {rd.l10.n}: {rd.l10.ok} with {word}.</>}
        {stale != null && stale >= 10 ? <> His last game on file was {stale} days ago, and a run counts games he played, not days.</> : null}
      </div>
      <div style={{ marginTop: 8 }}>
        <StreakRibbon streak={ribbonOf(rows, mk.stat, line)} label={word} max={40} height={14} />
        <div style={{ marginTop: 6 }}><StreakLine streak={ribbonOf(rows, mk.stat, line)} label={word} /></div>
      </div>
    </div>
  )
}
