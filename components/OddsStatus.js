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

export default function OddsStatus({ status, always = false }) {
  if (!status) return null
  const t = TONE[status.state]
  if (!t && !always) return null
  const col = t?.c || C.text3
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-start', maxWidth: 720,
      border: `1px solid ${col}44`, background: `${col}10`, borderRadius: 10,
      padding: '8px 11px', fontSize: 11, lineHeight: 1.55, color: C.text2,
    }}>
      <span style={{ fontSize: 12 }}>{t?.icon || '📡'}</span>
      <span>
        <b style={{ color: col, fontFamily: NUM_FONT, fontSize: 10, letterSpacing: '.04em' }}>
          {String(status.state || '').toUpperCase()}
        </b>{' '}
        {status.reason}
        <span style={{ color: C.text3 }}>
          {status.checked_at_human ? ` · checked ${status.checked_at_human}` : ''}
          {status.provider ? ` · ${status.provider}` : ''}
          {Number.isFinite(Number(status.players)) ? ` · ${status.players} players priced` : ''}
        </span>
      </span>
    </div>
  )
}
