'use client'
import { useState } from 'react'
import { playerId, nameOf, teamOf, oppOf, hrScore, hitScore, prodScore, tbScore } from '../../lib/player'
import { tierRole, isAligned } from '../../lib/scoring'
import { C } from '../../lib/theme'
import { PanelTitle, Grid, Empty } from '../ui'
import HitterHeat from '../HitterHeat'
import PlayerCard from '../PlayerCard'

const EXPORT_COLUMNS = [
  { key: 'name',     label: 'Player',          get: (p) => nameOf(p) },
  { key: 'team',     label: 'Team',            get: (p) => teamOf(p) },
  { key: 'opp',      label: 'Opponent',        get: (p) => oppOf(p) },
  { key: 'role',     label: 'Role',            get: (p) => tierRole(p) },
  { key: 'hr',       label: 'HR Score',        get: (p) => hrScore(p).toFixed(1) },
  { key: 'hrr',      label: 'HRR Score',       get: (p) => prodScore(p).toFixed(1) },
  { key: 'hit',      label: 'Hit Score',       get: (p) => hitScore(p).toFixed(1) },
  { key: 'tb',       label: 'TB Score',        get: (p) => tbScore(p).toFixed(1) },
  { key: 'hrw',      label: 'HRW',             get: (p) => (p?.hrw_score ?? '').toString() },
  { key: 'dmg',      label: 'Damage Conv.',    get: (p) => (p?.damage_conversion_score ?? '').toString() },
  { key: 'pmatch',   label: 'Pitch Match',     get: (p) => (p?.pitch_type_match_score ?? '').toString() },
  { key: 'weakspot', label: 'Weak Spot',       get: (p) => (p?.weak_spot_flag ? 'Yes' : 'No') },
  { key: 'aligned',  label: 'Aligned Signals', get: (p) => (isAligned(p) ? 'Yes' : 'No') },
  { key: 'lineup',   label: 'Lineup Spot',     get: (p) => (p?.lineup_spot ?? '').toString() },
  { key: 'pitcher',  label: 'Pitcher',         get: (p) => (p?.pitcher_name ?? '') },
]

function csvCell(value) {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function buildCsv(items) {
  const header = EXPORT_COLUMNS.map((c) => csvCell(c.label)).join(',')
  const rows = items.map((p) => EXPORT_COLUMNS.map((c) => csvCell(c.get(p))).join(','))
  return [header, ...rows].join('\n')
}

function downloadCsv(items) {
  const csv = buildCsv(items)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `watchlist_${stamp}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Plain-text list, formatted to echo the card/bot-board look: emoji + name +
// score, one player per line. final_hr_role already starts with the role
// emoji (🏆/🔥/🏁/🔭/💠/⛔), so this just reuses it directly rather than
// re-deriving the symbol.
function buildTextList(items) {
  const lines = items.map((p) => {
    const role = tierRole(p)
    const score = Math.round(hrScore(p))
    const align = isAligned(p) ? ' 🧩' : ''
    return `${role}  ${nameOf(p)} (${teamOf(p)} vs ${oppOf(p)})  HR ${score}${align}`
  })
  const stamp = new Date().toLocaleDateString()
  return [`Watchlist — ${stamp} — ${items.length} players`, '', ...lines].join('\n')
}

function downloadTxt(items) {
  const text = buildTextList(items)
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `watchlist_${stamp}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function copyTextList(items, onDone) {
  const text = buildTextList(items)
  try {
    await navigator.clipboard.writeText(text)
    onDone?.(true)
  } catch {
    onDone?.(false)
  }
}

export default function Watchlist({ items, onWatch, onAdd, onPlayerClick }) {
  const [confirming, setConfirming] = useState(false)
  const [copied, setCopied] = useState(false)

  function handleClearAll() {
    if (!confirming) { setConfirming(true); return }
    items.forEach(p => onWatch?.(p, false))
    setConfirming(false)
  }

  function handleCopy() {
    copyTextList(items, (ok) => {
      setCopied(ok ? 'ok' : 'fail')
      setTimeout(() => setCopied(false), 1800)
    })
  }

  if (!items.length) {
    return (
      <div>
        <PanelTitle title="Watchlist" sub="Tap the ☆ on any player card to save them here. Saved on this device only." />
        <Empty text="No saved players yet." />
      </div>
    )
  }

  return (
    <div>
      <PanelTitle
        title="Watchlist"
        sub={`${items.length} saved`}
        right={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={handleCopy}
              style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                border: `1px solid ${copied === 'ok' ? C.green : C.border2}`,
                background: copied === 'ok' ? `${C.green}22` : 'rgba(255,255,255,.04)',
                color: copied === 'ok' ? C.green : C.text2,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {copied === 'ok' ? '✓ Copied' : copied === 'fail' ? 'Copy failed' : '📋 Copy List'}
            </button>
            <button
              onClick={() => downloadTxt(items)}
              style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                border: `1px solid ${C.border2}`,
                background: 'rgba(255,255,255,.04)',
                color: C.text2,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              ⬇ Export .txt
            </button>
            <button
              onClick={() => downloadCsv(items)}
              style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                border: `1px solid ${C.border2}`,
                background: 'rgba(255,255,255,.04)',
                color: C.text2,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              ⬇ Export CSV
            </button>
            <button
              onClick={handleClearAll}
              onBlur={() => setConfirming(false)}
              style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                border: `1px solid ${confirming ? C.red : C.border}`,
                background: confirming ? `${C.red}22` : 'rgba(255,255,255,.04)',
                color: confirming ? C.red : C.text3,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {confirming ? 'Confirm Clear' : 'Clear All'}
            </button>
          </div>
        }
      />
      {/* A watchlist is a set you assembled by hand, so the useful question
          isn't the ranking -- it's whether the names you saved actually have
          anything in common, or whether you've collected six different bets. */}
      <HitterHeat
        players={items}
        type="hr"
        title="Your watchlist"
        topN={items.length}
        showTable={false}
        onPlayerClick={onPlayerClick}
      />

      <Grid>
        {items.map((p) => (
          <PlayerCard
            key={playerId(p)}
            p={p}
            type="hr"
            onAdd={onAdd}
            onWatch={onWatch}
            watched={true}
            onClick={() => onPlayerClick?.(p)}
          />
        ))}
      </Grid>
    </div>
  )
}
