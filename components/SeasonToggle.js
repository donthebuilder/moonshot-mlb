'use client'
import { Segmented } from './Filters'

// THE SEASON TOGGLE, ONE FOR EVERY PAGE (2026-09-29, queue batch 6: "this
// season | last season, default current. Last-season data is always
// labelled LAST SEASON"). TUDDY drew this three times by hand (Matchups'
// By-position table and both of DvpTable's states), as bare year buttons.
// It is MOONSHOT's own Segmented control now, labelled against the slate's
// season: the slate's year reads "This season", the year before reads "LAST
// SEASON" in words, anything else is just its year. This season is always
// the left side.
//
//   seasons      the years on offer (two, usually)
//   slateSeason  the season the page is about (the slate's)
//   value        the year showing
//   onPick       (year) => void
//   loading      the year being fetched, if any (shows "…")
export default function SeasonToggle({ seasons = [], slateSeason = null, value, onPick, loading = null, label = null }) {
  const years = [...new Set(seasons.map(Number).filter(Number.isFinite))]
  if (years.length < 2) return null
  const slate = Number(slateSeason) || Math.max(...years)
  years.sort((a, b) => (a === slate ? -1 : b === slate ? 1 : b - a))
  const word = (y) => (y === slate ? `This season · ${y}` : y === slate - 1 ? `LAST SEASON · ${y}` : String(y))
  return (
    <Segmented label={label} value={Number(value)} onChange={(y) => onPick?.(y)}
      options={years.map((y) => ({ key: y, label: `${word(y)}${loading === y ? ' …' : ''}`, title: y === slate ? 'This season' : 'Last season, labelled as such' }))} />
  )
}
