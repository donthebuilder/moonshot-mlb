'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { fetchLiveSlate, pickCleared } from '../lib/liveSlate'

// 📡 MINI WIRE — the live feed's heartbeat, everywhere (2026-08-06).
//
// The full Live Wire lives on the Scoreboard, and that's where it should
// live — a dedicated tab would be a 17th nav item you have to VISIT, and
// live information dies the moment it needs visiting. This is the other
// half: one line under the header on every OTHER tab while games run, so
// the night follows you into the Boards and the modals. Click → Scoreboard.
//
// One snapshot on mount, refreshed every 90s only while games are live and
// the page is visible. Hidden entirely pregame, post-slate, and on the
// Scoreboard itself (the full panel is right there).

const primaryRole = (p) => String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()

export default function MiniWire({ players = [], tab, onGo }) {
  const [snap, setSnap] = useState(null)

  useEffect(() => {
    let alive = true
    let timer = null
    const pull = async () => {
      const s = await fetchLiveSlate()
      if (!alive) return
      setSnap(s)
      const anyLive = s?.games?.some((g) => g.state === 'Live')
      clearInterval(timer)
      if (anyLive) timer = setInterval(() => { if (!document.hidden) pull() }, 90000)
    }
    pull()
    return () => { alive = false; clearInterval(timer) }
  }, [])

  if (tab === 'scoreboard' || !snap) return null
  const live = snap.games.filter((g) => g.state === 'Live')
  if (!live.length) return null

  const picks = players.filter((p) => primaryRole(p))
    .map((p) => ({ role: primaryRole(p), line: snap.lines[Number(p?.player_id ?? p?.id)] }))
    .filter((x) => x.line)
  const cleared = picks.filter((x) => pickCleared(x.role, x.line) === true).length
  const hr = Object.values(snap.lines).reduce((a, l) => a + (l.hr || 0), 0)

  return (
    <button onClick={onGo} title="Open the full Live Wire on the Scoreboard" style={{
      display: 'flex', alignItems: 'baseline', gap: 10, width: '100%', cursor: 'pointer',
      background: 'linear-gradient(90deg, rgba(74,222,128,.06), rgba(74,222,128,.015))',
      border: '1px solid rgba(74,222,128,.22)', borderRadius: 9,
      padding: '4px 12px', marginBottom: 10, textAlign: 'left',
    }}>
      <span style={{ fontSize: 10.5, fontWeight: 900, color: '#4ade80' }}>📡 LIVE</span>
      <span style={{ fontSize: 10, color: C.text2, fontFamily: NUM_FONT }}>
        {live.length} game{live.length > 1 ? 's' : ''}
        {picks.length > 0 && <> · picks <b style={{ color: cleared ? '#4ade80' : C.text2 }}>{cleared}/{picks.length}</b> cleared</>}
        {hr > 0 && <> · <b style={{ color: C.orange }}>{hr} HR</b></>}
      </span>
      <span style={{ marginLeft: 'auto', fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>open wire →</span>
    </button>
  )
}
