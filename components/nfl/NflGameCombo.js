'use client'
import { useMemo } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
import { FiltersSheet } from '../player'
import useHashFilters from '../../lib/useHashFilters'
import NflTable from './NflTable'
import { SportTheme } from '../SportTheme'
import { comboFields, filterGames, aggregateNflGames, stadiumRecord, hasContext, VERY_THIN_G, splitPairs } from '../../lib/nfl/gameSplits'
import { alpha } from '../../lib/scales'

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
  const fields = useMemo(() => comboFields(log), [log])
  // ONE FILTERS BUTTON (2026-10-09): the shared sheet (components/player/FiltersSheet), its picks kept in the address
  // as cf.<key>= (lib/useHashFilters) so a refresh or a shared link reopens the same combination.
  const [sel, setSelKey, resetSel] = useHashFilters('cf', Object.fromEntries(fields.map((f) => [f.key, ''])))
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
      <FiltersSheet style={{ marginBottom: 8 }} onReset={resetSel}
        groups={fields.map((f) => ({
          key: f.key, label: f.placeholder.replace(/^Any /, '').replace(/^./, (c) => c.toUpperCase()), value: sel[f.key] || '', defaultValue: '', onChange: (v) => setSelKey(f.key, v),
          options: [{ value: '', label: 'Any' }, ...f.options.map((o) => ({ value: String(o.v), label: o.label }))],
        }))} />
      {!anyOn ? (
        <div style={note}>Pick at least one filter to see a combined line over his logged games — mix as many as you want.</div>
      ) : line.g === 0 ? (
        <div style={note}>No logged games matched that combination.</div>
      ) : (
        <>
          <div style={{ fontSize: TYPE.label, color: line.thin ? C.green : C.text3, fontFamily: NUM_FONT, marginBottom: 4 }}>
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
          {stadium.thin ? <span style={{ color: C.green }}> — thin sample</span> : null}
        </div>
      )}
    </SportTheme>
  )
}

// EVERY SPLIT AS EVEN PAIRS (Donovan 10-18: "they gotta be nice ... I like symmetrical ... pristine"). One row per question, its two
// sides side by side: the market's number big, games small, the better side lit, a side on fewer than three games dimmed. The
// numbers are lib/nfl/gameSplits splitPairs (his logged games); nothing estimated, a side with no games says so.
const SPLIT_PICK = {
  TD: { k: 'tdPerG', fmt: (v) => v.toFixed(2), unit: 'TD/G' }, REC_YDS: { k: 'recyd', fmt: (v) => v.toFixed(1), unit: 'rec yds/G' },
  REC: { k: 'rec', fmt: (v) => v.toFixed(1), unit: 'rec/G' }, RUSH_YDS: { k: 'ruyd', fmt: (v) => v.toFixed(1), unit: 'rush yds/G' },
  RUSH_ATT: { k: 'car', fmt: (v) => v.toFixed(1), unit: 'carries/G' }, PASS_YDS: { k: 'payd', fmt: (v) => v.toFixed(0), unit: 'pass yds/G' },
}
export function AllSplits({ log, market = 'TD', dvp = null, role = null }) {
  const pairs = splitPairs(log, { dvp, role })
  const pick = SPLIT_PICK[market] || SPLIT_PICK.TD
  if (!pairs.length) return null
  return (
    <section aria-label="Every split" style={{ margin: '4px 0 12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '0 0 6px' }}>
        <span style={{ fontSize: TYPE.label, fontWeight: 900, color: C.text3, letterSpacing: '.1em', fontFamily: NUM_FONT }}>EVERY SPLIT</span>
        <span style={{ fontSize: 12, color: C.text3, fontFamily: NUM_FONT }}>{pick.unit} · his logged games</span>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {pairs.map((p) => {
          const vals = p.sides.map((s) => (s.g ? s[pick.k] : null))
          const best = vals[0] != null && vals[1] != null && vals[0] !== vals[1] ? (vals[0] > vals[1] ? 0 : 1) : -1
          return (
            <div key={p.key} style={{ display: 'grid', gridTemplateColumns: '78px minmax(0,1fr) minmax(0,1fr)', gap: 6, alignItems: 'stretch' }}>
              <span style={{ alignSelf: 'center', fontSize: 12, fontWeight: 800, color: C.text2 }}>{p.label}</span>
              {p.sides.map((s, i) => {
                const v = vals[i], thin = s.g > 0 && s.g < VERY_THIN_G
                return (
                  <div key={s.label} title={s.g ? `${s.label}: ${s.g} game${s.g === 1 ? '' : 's'}, ${s.td} TD` : `${s.label}: no games`}
                    style={{ padding: '6px 9px', borderRadius: 9, border: `1px solid ${best === i ? alpha(C.green, 0.55) : C.border}`, background: best === i ? alpha(C.green, 0.08) : C.bg2, opacity: thin ? 0.55 : 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: C.text3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                      <b style={{ fontFamily: NUM_FONT, fontSize: 17, color: best === i ? C.green : C.text }}>{v == null ? '—' : pick.fmt(v)}</b>
                      <span style={{ fontFamily: NUM_FONT, fontSize: 11, color: C.text3 }}>{s.g ? `${s.g} G` : 'no games'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </section>
  )
}
