'use client'
// MOONSHOT's not-scored hitters (components/table/NotScoredTable.js). The bot's PA filter
// (mlb_dashboard apply_global_pa_filter: recent 20+ PA or season 80+) drops some lineup
// hitters before the slate file; since 2026-10-18 it writes them, with their season line and
// no score, to current/not_scored_<today|tomorrow>.json. Shown only when the file's date is
// the board's own slate date.
import { useEffect, useState } from 'react'
import { dataUrl } from '../dataSource'

export const MLB_NOT_SCORED_COLUMNS = [
  { key: 'PA', label: 'PA', group: 'Season', w: 40, dp: 0 },
  { key: 'L20', label: 'L20 PA', group: 'Season', w: 48, dp: 0, title: 'Plate appearances in his recent window (the filter wants 20)' },
  { key: 'HR', label: 'HR', group: 'Season', w: 36, dp: 0 },
  { key: 'AVG', label: 'AVG', group: 'Season', w: 48, fmt: (v) => (v == null ? '—' : Number(v).toFixed(3).replace(/^0/, '')) },
  { key: 'OBP', label: 'OBP', group: 'Season', w: 48, fmt: (v) => (v == null ? '—' : Number(v).toFixed(3).replace(/^0/, '')) },
  { key: 'SLG', label: 'SLG', group: 'Season', w: 48, fmt: (v) => (v == null ? '—' : Number(v).toFixed(3).replace(/^0/, '')) },
]

const fin = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v))

export function notScoredHitters(file, slateDate) {
  if (!file?.rows?.length || (slateDate && file.date !== slateDate)) return []
  return file.rows.map((r) => ({
    _id: `${r.game_pk}-${r.player_id}`, id: r.player_id, name: r.name, team: r.team, why: 'few PA', _raw: r,
    PA: fin(r.season_pa), L20: fin(r.l20pa_pa), HR: fin(r.season_hr), AVG: fin(r.season_avg), OBP: fin(r.season_obp), SLG: fin(r.season_slg),
  })).sort((a, b) => (b.PA || 0) - (a.PA || 0) || String(a.name).localeCompare(String(b.name)))
}

/** The not-scored file for this slate date (today's or tomorrow's), or null. One read per date. */
export function useMlbNotScored(slateDate, enabled = true) {
  const [file, setFile] = useState(null)
  useEffect(() => {
    let live = true
    setFile(null)
    if (!enabled) return undefined
    Promise.all(['today', 'tomorrow'].map((l) => fetch(dataUrl(`current/not_scored_${l}.json`)).then((r) => (r.ok ? r.json() : null)).catch(() => null)))
      .then((fs) => { if (live) setFile(fs.find((f) => f && (!slateDate || f.date === slateDate)) || null) })
    return () => { live = false }
  }, [slateDate, enabled])
  return file
}
