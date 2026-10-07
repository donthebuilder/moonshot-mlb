'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
import ComboFilterBar from '../ComboFilterBar'
import NflTable from './NflTable'
import { SportTheme } from '../SportTheme'
import { comboFields, filterGames, aggregateNflGames, stadiumRecord, hasContext, VERY_THIN_G } from '../../lib/nfl/gameSplits'

// TUDDY'S COMBINE FILTERS (2026-10-06) -- MOONSHOT's ComboFilter, per game.
// Same control (components/ComboFilterBar.js, lifted from PlayerSplits), same
// one-line DenseTable result and the same thin-sample warning; the data is the
// player's own game log (nfl_logs.json) and the selectors are football's:
// weekday, home/away, win/loss, roof, surface, rest, opponent, season.
//
// WHEN THE LOG HAS NO CONTEXT (published before bots/nfl/nfl_gamelog.py's
// 2026-10-06 change) this renders nothing at all -- the Splits tab reads as it
// did. It lights up the day the bot publishes the new fields.
const COLS = [
  { key: 'split', group: 'Filter', label: 'Split', heat: false, w: 78, bold: true, sticky: true },
  { key: 'g', group: 'Filter', label: 'G', w: 38, title: 'Games in the filter' },
  { key: 'td', group: 'Touchdowns', label: 'TD', w: 40, dp: 0 },
  { key: 'tdPerG', group: 'Touchdowns', label: 'TD/G', w: 50, dp: 2 },
  { key: 'tdPct', group: 'Touchdowns', label: 'TD G%', w: 54, dp: 0, title: 'Share of those games with at least one touchdown' },
  { key: 'multi', group: 'Touchdowns', label: '2+ TD', w: 48, dp: 0, title: 'Games with two or more touchdowns' },
  { key: 'recyd', group: 'Per game', label: 'REC YD/G', w: 62, dp: 1 },
  { key: 'ruyd', group: 'Per game', label: 'RUSH YD/G', w: 66, dp: 1 },
  { key: 'car', group: 'Per game', label: 'CAR/G', w: 50, dp: 1 },
  { key: 'payd', group: 'Per game', label: 'PASS YD/G', w: 66, dp: 1 },
]

const note = { fontSize: TYPE.body, color: C.text3, padding: '4px 0', lineHeight: 1.5 }

export default function NflGameCombo({ log, venue = null }) {
  const [sel, setSel] = useState({})
  const fields = useMemo(() => comboFields(log), [log])
  const matches = useMemo(() => filterGames(log, sel), [log, sel])
  const line = useMemo(() => aggregateNflGames(matches), [matches])
  const stadium = useMemo(() => stadiumRecord(log, venue), [log, venue])
  if (!hasContext(log) || !fields.length) return null

  const anyOn = Object.values(sel).some(Boolean)
  // a yardage column the player never records in this window is not drawn
  const cols = COLS.filter((c) => !['recyd', 'ruyd', 'car', 'payd'].includes(c.key) || line[c.key] != null)

  return (
    <SportTheme theme={C} accent={C.green} numFont={NUM_FONT}>
      <div style={{ fontSize: TYPE.label, fontWeight: 900, color: C.text3, letterSpacing: '.1em', margin: '16px 0 7px' }}>
        COMBINE FILTERS
      </div>
      <ComboFilterBar fields={fields} values={sel} roomy anyOn={anyOn}
        onChange={(k, v) => setSel((s) => ({ ...s, [k]: v }))} onClear={() => setSel({})} />
      {!anyOn ? (
        <div style={note}>Pick at least one filter to see a combined line over his logged games — mix as many as you want.</div>
      ) : line.g === 0 ? (
        <div style={note}>No logged games matched that combination.</div>
      ) : (
        <>
          <div style={{ fontSize: TYPE.label, color: line.thin ? C.orange : C.text3, fontFamily: NUM_FONT, marginBottom: 4 }}>
            {line.g} game{line.g === 1 ? '' : 's'}
            {line.veryThin ? ` — under ${VERY_THIN_G} games is a curiosity, not a signal` : line.thin ? ' — thin sample, read it with care' : ''}
          </div>
          <NflTable rows={[line]} columns={cols} initialSort={null} maxHeight={90} />
        </>
      )}
      {stadium && (
        <div style={{ ...note, marginTop: 8 }} title="From his logged games (two to three seasons), counting only the building the game was played in.">
          <b style={{ color: C.text2 }}>At {stadium.venue}:</b>{' '}
          {stadium.td} TD in {stadium.g} game{stadium.g === 1 ? '' : 's'} ({stadium.tdPerG.toFixed(2)} a game
          {Number.isFinite(stadium.baseTdPerG) ? `, vs ${stadium.baseTdPerG.toFixed(2)} in all ${stadium.baseGames} logged games with a known site` : ''})
          {stadium.thin ? <span style={{ color: C.orange }}> — thin sample</span> : null}
        </div>
      )}
    </SportTheme>
  )
}
