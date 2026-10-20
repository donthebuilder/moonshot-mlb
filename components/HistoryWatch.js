'use client'
import { useEffect, useState } from 'react'
import { sharedJSON } from '../lib/sharedRead'
import { C as MLB_C, NUM_FONT as MLB_NUM } from '../lib/theme'
import StoryRow, { Numbered } from './StoryRow'
import { digitRoot } from '../lib/numerology/core'

// each sport's words when the caller passes none (2026-10-20: History Watch also rides the Ledger and Numerology)
const SPORT_WORDS = {
  mlb: { unit: 'HR', reach: 'one more tonight', step: 'one more' },
  nfl: { unit: 'TD', reach: 'within reach this week', step: 'next' },
  nhl: { unit: 'G', reach: 'one more tonight', step: 'one more' },
}

// 📜 HISTORY WATCH (milestones plan step 2, 2026-09-26). One line per player
// one step short of a history rung -- "Drake Baldwin · 24 HR · one more =
// first Braves catcher to 25 since Javy Lopez in 2003" -- three rows, then
// "+N more". Tap a row for its proof: every player since who did it, and the
// source. Nothing here is written by hand: /api/history/watch returns each
// claim with the query result behind it. Shared by all three products;
// theme and number font come in as props.
// `reach` / `step` are the words for the window ("one more tonight" / "one
// more"); TUDDY's week passes its own.
// LOOPED INTO THE LEDGER AND NUMEROLOGY (2026-10-20, Donovan: "shared milestone pages can be looped in to ledger and numerology"):
// the same block rides each sport's Ledger (Tonight) and Numerology page. `dateRoot` (Numerology passes the day's number) marks a
// row whose milestone number reduces to the day's number -- the one place the two meet; information only, never a call.
export default function HistoryWatch({ sport = 'mlb', theme = null, numFont = null, onPlayerClick = null, unit = null, max = 3, reach = null, step = null, dateRoot = null, title = 'HISTORY WATCH', accent = null }) {
  const W = SPORT_WORDS[sport] || SPORT_WORDS.mlb
  unit = unit || W.unit; reach = reach || W.reach; step = step || W.step   // eslint-disable-line no-param-reassign
  const C = theme || MLB_C
  const A = accent || C.orange   // the product's own accent when the caller has one (never MOONSHOT orange on another product)
  const NUM_FONT = numFont || MLB_NUM
  const [data, setData] = useState(null)
  const [openKey, setOpenKey] = useState(null)
  const [all, setAll] = useState(false)
  useEffect(() => {
    let alive = true
    if (!SPORT_WORDS[sport]) return undefined   // no history route for this sport (BUCKETS): nothing to ask for
    sharedJSON(`/api/history/watch?sport=${sport}`).then((j) => { if (alive) setData(j) }).catch(() => {})
    return () => { alive = false }
  }, [sport])
  const items = data?.items || []
  if (!items.length) return null
  const shown = all ? items : items.slice(0, max)
  return (
    // ONE LOOK (HISTORY WATCH 2 step 1): no box of its own any more -- the
    // label, then the same rows every Storylines line uses (StoryRow). A row
    // taps open its proof; the second claim, when there is one, rides under
    // it as one smaller "also:" line (step 3).
    <div style={{ margin: '6px 0 8px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
        <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.12em', fontFamily: NUM_FONT, color: C.text }}>📜 {title}</span>
        <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>{reach} · tap for the proof</span>
      </div>
      {shown.map((i) => {
        const k = `${i.player_id}:${i.rung}`
        const open = openKey === k
        const drought = i.kind === 'DROUGHT'   // about the club, not a hitter (lib/history/mlbPost.js)
        return (
          <div key={k}>
            <StoryRow icon="📜" theme={C} expanded={open} onClick={() => setOpenKey(open ? null : k)}>
              {drought
                ? <><b style={{ color: C.text }}>{i.team}</b> hasn&apos;t homered this postseason — <Numbered text={i.claim} theme={C} numFont={NUM_FONT} /></>
                : <><b style={{ color: C.text }}>{i.name}</b> <span style={{ color: C.text3 }}>{i.team}</span> · <b style={{ fontFamily: NUM_FONT, color: A }}>{i.hr}</b> {i.unit || unit} — <Numbered text={i.claim} theme={C} numFont={NUM_FONT} />
                  {dateRoot && Number.isFinite(Number(i.rung)) && digitRoot(Number(i.rung)) === Number(dateRoot)
                    ? <span title={`${i.rung} reduces to ${dateRoot}, the day's number`} style={{ marginLeft: 6, padding: '1px 5px', borderRadius: 3, border: `1px solid ${A}`, color: A, fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 900, letterSpacing: '.06em', whiteSpace: 'nowrap' }}>🔮 {i.rung} → {dateRoot}</span>
                    : null}</>}
              {i.more?.[0] ? <span style={{ display: 'block', fontSize: 10, color: C.text3 }}>also: <Numbered text={i.more[0]} theme={C} numFont={NUM_FONT} /></span> : null}
            </StoryRow>
            {open && (
              <div style={{ padding: '0 0 8px 8px', fontSize: 10.5, color: C.text2, lineHeight: 1.5 }}>
                {i.proof.title ? <>{i.proof.title}</> : i.proof.lastSeason
                  ? <>Every {i.proof.who} with {i.rung}+ {i.unit || unit} before this season, newest first:</>
                  : <>Nobody in the data has done it for this club (data from {i.proof.coverageFrom}).</>}
                {i.proof.allSince?.length ? (
                  <ul style={{ margin: '4px 0 4px 16px', padding: 0, fontFamily: NUM_FONT, fontSize: 10.5 }}>
                    {i.proof.allSince.slice(0, 8).map((r) => <li key={`${r.season}${r.name}`}>{r.season} · {r.name} · {r.value}</li>)}
                    {i.proof.hits > 8 ? <li style={{ listStyle: 'none', color: C.text3 }}>…and {i.proof.hits - 8} more</li> : null}
                  </ul>
                ) : null}
                {onPlayerClick && i.kind !== 'DROUGHT' && <button type="button" onClick={() => onPlayerClick({ player_id: i.player_id, name: i.name, team: i.team })} style={{ background: 'none', border: 'none', color: C.text2, padding: 0, cursor: 'pointer', textDecoration: 'underline dotted', fontSize: 10.5 }}>open {i.name.split(' ').pop()}’s card</button>}
                <div style={{ color: C.text3, fontSize: 9.5, marginTop: 4 }}>{data.credit}</div>
              </div>
            )}
          </div>
        )
      })}
      {items.length > max && (
        <button type="button" onClick={() => setAll((v) => !v)} style={{ marginTop: 4, background: 'none', border: 'none', padding: 0, color: C.text3, cursor: 'pointer', fontFamily: NUM_FONT, fontSize: 10 }}>
          {all ? 'Show less' : `Show ${items.length - max} more`}
        </button>
      )}
    </div>
  )
}
