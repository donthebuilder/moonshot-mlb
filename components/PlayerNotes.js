'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'

// PLAYER NOTES — "why I liked him", remembered.
//
// Same per-device localStorage as the watchlist. One note per player_id,
// timestamped so a stale take announces its age. No sync, no server — the
// note you wrote is on the machine you wrote it on, like the watchlist.

const KEY = 'moonshot_player_notes_v1'

const load = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
}

export default function PlayerNotes({ playerId }) {
  const [text, setText] = useState('')
  const [savedAt, setSavedAt] = useState(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    const all = load()
    const entry = all[playerId]
    setText(entry?.text || '')
    setSavedAt(entry?.at || null)
    setDirty(false)
  }, [playerId])

  const save = () => {
    const all = load()
    if (text.trim()) {
      all[playerId] = { text: text.trim(), at: new Date().toISOString().slice(0, 10) }
    } else {
      delete all[playerId]
    }
    try { localStorage.setItem(KEY, JSON.stringify(all)) } catch { /* private mode */ }
    setSavedAt(text.trim() ? all[playerId]?.at : null)
    setDirty(false)
  }

  if (!playerId) return null

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 800 }}>📝 My note</span>
        {savedAt && !dirty && (
          <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>saved {savedAt}</span>
        )}
        {dirty && (
          <button
            onClick={save}
            style={{
              fontSize: 9.5, fontWeight: 800, padding: '2px 10px', borderRadius: 6,
              border: `1px solid ${C.orange}`, background: 'rgba(249,115,22,.12)',
              color: C.orange, cursor: 'pointer', fontFamily: NUM_FONT,
            }}
          >Save</button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 8.5, color: C.text3 }}>this device only</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setDirty(true) }}
        onBlur={save}
        rows={2}
        placeholder="Why you like (or don’t like) him — you won’t remember in three days."
        style={{
          width: '100%', background: C.bg, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: '7px 10px', fontSize: 11.5, color: C.text,
          outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5,
        }}
      />
    </div>
  )
}
