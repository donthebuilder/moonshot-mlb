'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { fetchJSON } from '../lib/data'
import { oddsStatusPaths } from '../lib/dataSource'

// 📡 WHY THERE ARE NO ODDS — or why the ones you're looking at are that old.
//
// 2026-08-15, Donovan: "im still unsure if the odds are even on there i ran
// the bot again." He was right to be unsure: odds_latest.json was 404ing on the
// data branch and nothing on the site could tell him that, let alone why. The
// fetch step is continue-on-error, so a missing key, a spent quota and a wrong
// bookmaker id all look identical from here — like a quiet night.
//
// The bot now publishes odds_status.json on every path it can take. This
// renders it, and renders NOTHING when the last fetch was fine, because a
// green "all good" banner on every page is just furniture.

const TONE = {
  ok: null,                                  // silent on success
  skipped: { c: '#8b8b95', icon: '⏸' },      // the request lock, working
  capped: { c: '#8b8b95', icon: '⏸' },
  no_key: { c: '#f87171', icon: '🔑' },
  empty: { c: '#FCD34D', icon: '📡' },
}

export function useOddsStatus() {
  const [st, setSt] = useState(undefined)
  useEffect(() => {
    let alive = true
    fetchJSON(oddsStatusPaths())
      .then((j) => { if (alive) setSt(j || null) })
      .catch(() => { if (alive) setSt(null) })
    return () => { alive = false }
  }, [])
  return st
}

// What a VISITOR reads for each state. status.reason is the bot's raw
// diagnostic ("403 on /props/ — key's plan does not include player props…")
// and used to render verbatim here — provider jargon on a public page, and
// the single most trust-damaging string on the site (2026-08-29 review).
// The raw reason now lives in the banner's title attribute: hover (or long-
// press inspect) still tells Donovan exactly what the fetch said, while the
// page itself says only what a reader needs — whether lines exist, and that
// nothing else on the board depends on them.
const FRIENDLY = {
  no_key: {
    label: 'ODDS OFFLINE',
    text: 'Live betting lines are offline right now. Grades and boards are built from our own data and stay current without them.',
  },
  empty: {
    label: 'NO LINES YET',
    text: 'The book isn’t posting player lines for this slate yet. Grades and boards don’t depend on them — prices appear here when they exist.',
  },
  skipped: {
    label: 'ODDS PAUSED',
    text: 'Odds refresh is between checks. The last good prices are shown wherever they exist.',
  },
  capped: {
    label: 'ODDS PAUSED',
    text: 'Odds refresh is between checks. The last good prices are shown wherever they exist.',
  },
}

export default function OddsStatus({ status, always = false }) {
  if (!status) return null
  const t = TONE[status.state]
  if (!t && !always) return null
  const col = t?.c || C.text3
  const friendly = FRIENDLY[status.state]
  // The raw diagnostic, kept reachable but off the page.
  const detail = [status.reason, status.provider, status.checked_at ? `checked ${status.checked_at}` : '']
    .filter(Boolean).join(' · ')
  return (
    <div
      title={detail}
      style={{
        display: 'flex', gap: 8, alignItems: 'flex-start', maxWidth: 720,
        border: `1px solid ${col}44`, background: `${col}10`, borderRadius: 10,
        padding: '8px 11px', fontSize: 11, lineHeight: 1.55, color: C.text2,
      }}
    >
      <span style={{ fontSize: 12 }}>{t?.icon || '📡'}</span>
      <span>
        <b style={{ color: col, fontFamily: NUM_FONT, fontSize: 10, letterSpacing: '.04em' }}>
          {friendly?.label || 'ODDS'}
        </b>{' '}
        {friendly?.text || 'Live betting lines are unavailable right now. Everything else on this board is unaffected.'}
        <span style={{ color: C.text3 }}>
          {status.checked_at_human ? ` · checked ${status.checked_at_human}` : ''}
          {Number.isFinite(Number(status.players)) && Number(status.players) > 0 ? ` · ${status.players} players priced` : ''}
        </span>
      </span>
    </div>
  )
}
