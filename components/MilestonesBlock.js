'use client'
import { useEffect, useState } from 'react'
import { sharedJSON } from '../lib/sharedRead'
import { appHref } from '../lib/routes'
import { digitRoot } from '../lib/numerology/core'
import HistoryWatch from './HistoryWatch'
import StoryRow, { StoryParts } from './StoryRow'
import MilestoneRate from './MilestoneRate'

// 🏁 MILESTONES ON THE LEDGER AND NUMEROLOGY (2026-10-20, Donovan: "if you made so milestones can be researched just like
// headlines then we are good"). The milestone countdowns are stories now on every product (lib/stories/milestones.js), so
// they live where headlines-as-stories live: the Storylines page, with its Milestone filter, search and graded record.
// This block is the doorway: History Watch's claims (tap for the proof), then the nearest countdowns tonight in the
// Storylines row's own words, and one link to the full Milestone view (#tab=storylines&st.type=milestone,history -- the
// page reads its filters off the address). Nothing is computed here; the rows are the engine's.
// `dateRoot` (Numerology) marks a countdown whose target reduces to the day's number, as History Watch does.
const SHOW = 3
const WHEN = { nfl: 'this week' }   // TUDDY's slate is a week; every other product's is a night

export function milestonesHref(sport, date = null) {
  // the day rides along (route audit 2026-10-21): Numerology on the 18th opened Storylines on tonight
  return `${appHref(sport, 'storylines')}&st.type=milestone%2Chistory${date ? `&date=${date}` : ''}`
}

export default function MilestonesBlock({ sport, theme: C, numFont, accent, date = null, dateRoot = null }) {
  const [data, setData] = useState(null)
  const [openKey, setOpenKey] = useState(null)
  useEffect(() => {
    let alive = true
    sharedJSON(`/api/stories?sport=${encodeURIComponent(sport)}${date ? `&date=${date}` : ''}`).then((j) => { if (alive) setData(j) }).catch(() => {})
    return () => { alive = false }
  }, [sport, date])
  const rows = (data?.stories || []).filter((s) => s.type === 'milestone' && !s.outcome)
    .sort((a, b) => b.rarity - a.rarity)   // the engine's rarity: nearest-in-window first, game 1,000 near the top
  const href = milestonesHref(sport, date)
  const link = { color: C.text2, fontFamily: numFont, fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 44 }
  return (
    <div>
      <HistoryWatch sport={sport} theme={C} numFont={numFont} accent={accent} dateRoot={dateRoot} title="HISTORY WATCH" />
      {rows.length ? (
        <div style={{ margin: '6px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.12em', fontFamily: numFont, color: C.text }}>🏁 MILESTONES</span>
            <span style={{ fontSize: 9, color: C.text3, fontFamily: numFont }}>in reach {WHEN[sport] || 'tonight'} · {rows.length}</span>
          </div>
          {rows.slice(0, SHOW).map((s) => {
            const t = Number(s.numbers?.target)
            const meets = dateRoot && Number.isFinite(t) && digitRoot(t) === Number(dateRoot)
            const k = `${s.player_id}|${s.text}`
            const open = openKey === k
            // a tap opens his hit rate for this stat (components/MilestoneRate.js); his page is one more tap from there
            return (
              <div key={k}>
                <StoryRow icon={s.icon} theme={C} title={`Source: ${s.source}`} expanded={open} onClick={() => setOpenKey(open ? null : k)}
                  tag={s.numbers?.rate ? <span style={{ fontFamily: numFont, color: open ? accent : C.text3 }}>{s.numbers.rate.l5[0]}/{s.numbers.rate.l5[1]} {open ? '▴' : '▾'}</span> : null}>
                  <StoryParts parts={s.parts} theme={C} numFont={numFont} />
                  {meets ? <span title={`${t} reduces to ${dateRoot}, the day's number`} style={{ marginLeft: 6, padding: '1px 5px', borderRadius: 3, border: `1px solid ${accent}`, color: accent, fontFamily: numFont, fontSize: 9.5, fontWeight: 900, letterSpacing: '.06em', whiteSpace: 'nowrap' }}>🔮 {t.toLocaleString('en-US')} → {dateRoot}</span> : null}
                </StoryRow>
                {open ? <MilestoneRate sport={sport} story={s} theme={C} numFont={numFont} accent={accent} /> : null}
              </div>
            )
          })}
        </div>
      ) : null}
      <a href={href} style={link} title="Every milestone and history story tonight, filterable and searchable, with how they did">
        {rows.length > SHOW ? `+${rows.length - SHOW} more · ` : ''}Research milestones on Storylines ›
      </a>
    </div>
  )
}
