// LAMP's number and date formats, with no 'use client' -- so the crawlable
// server pages (app/nhl/*) and the in-app tabs (components/lamp/ui.js
// re-exports these) print a stat the same way. 2026-09-26.

/** "Thu · Sep 24" from a YYYY-MM-DD game day. Rendered as the ET calendar day it is. */
export function fmtDay(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''))
  if (!m) return String(ymd || '')
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12))
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}
/** 0.921317 → ".921"; null stays a dash. */
export const fmtPct3 = (v) => (v == null ? '—' : Number(v).toFixed(3).replace(/^0/, ''))
/** 3.070124 → "3.07". */
export const fmt2 = (v) => (v == null ? '—' : Number(v).toFixed(2))
/** seconds → "m:ss". */
export const fmtSec = (sec) => (sec == null ? '—' : `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`)
export const plusMinus = (v) => (v == null ? '—' : v > 0 ? `+${v}` : String(v))
