'use client'
import { useEffect, useState } from 'react'
import LedgerSection from './LedgerSection'
import Tap from '../Tap'

// 🥇 FIRST SCORERS (ledger plan step 2): who scored first in each recent game,
// when, and whether the board had him -- plus the season line. Tracking only:
// there is no first-scorer pick yet (it needs its own model and a graded
// archive, which this is the start of). /api/ledger/first.
const WORD = {
  mlb: { event: 'homer', first: 'first homer', title: 'FIRST HOMER OF EACH GAME', note: 'The first home run, not the first run.' },
  nfl: { event: 'TD', first: 'first touchdown', title: 'FIRST TOUCHDOWN OF EACH GAME', note: null },
  nhl: { event: 'goal', first: 'first goal', title: 'FIRST GOAL OF EACH GAME', note: null },
}
const STATUS_WORD = { called: 'CALLED', board: 'ON THE BOARD', off: 'NOT ON THE BOARD' }

export default function FirstScorers({ sport, C, numFont, accent, day = null, emptyWhy, onOpenPlayer, onOpenGame = null }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let alive = true
    fetch(`/api/ledger/first?sport=${sport}${day ? `&day=${day}` : ''}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => { if (alive) setData(j) }).catch(() => { if (alive) setErr(true) })
    return () => { alive = false }
  }, [sport, day])
  const w = WORD[sport]
  const s = data?.season
  const tone = (st) => (st === 'called' ? accent : st === 'board' ? C.text2 : C.text3)
  return (
    <LedgerSection C={C} numFont={numFont} accent={accent} title={`🥇 ${w.title}`}
      blurb={`who scored first, when, and whether the board had him${w.note ? ` · ${w.note}` : ''}`}
      rows={(data?.games || []).map((g) => ({ ...g, key: `${g.day}|${g.gameId}` }))}
      empty={err ? 'First scorers are delayed.' : !data ? 'Loading…' : emptyWhy || `No ${w.event} on file in the last few days.`}
      render={(g) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, fontSize: 12, flexWrap: 'wrap' }}>
          <span style={{ color: C.text3, fontFamily: numFont, fontSize: 10, minWidth: 74 }}><Tap onClick={onOpenGame && (() => onOpenGame(g.gameId, g))}>{g.game}</Tap></span>
          <button type="button" onClick={() => g.playerId && onOpenPlayer?.(g.playerId, g)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: g.playerId ? 'pointer' : 'default', color: C.text, fontWeight: 800, font: 'inherit' }}>{g.name}</button>
          <span style={{ color: C.text3, fontFamily: numFont, fontSize: 10 }}>{g.when}</span>
          <span style={{ marginLeft: 'auto', color: tone(g.status), fontFamily: numFont, fontSize: 9, fontWeight: 900, letterSpacing: '.08em' }}>{STATUS_WORD[g.status] || ''}</span>
        </div>
      )}
      footer={s && s.games > 0 ? (
        <div style={{ marginTop: 8, fontSize: 11.5, lineHeight: 1.55, color: C.text2 }}>
          This season: <b style={{ color: C.text }}>{s.games}</b> games with a {w.first} on file — <b style={{ color: accent }}>{s.called}</b> called, {s.board} on the board, {s.off} not on it
          ({Math.round(((s.called + s.board) / s.games) * 100)}% on the board).
          {s.top.length ? <> Most {w.first}s: {s.top.slice(0, 3).map((t) => `${t.name} ${t.n}`).join(', ')}.</> : null}
          <span style={{ color: C.text3 }}> No first-scorer pick yet — this is the record one will be graded on.</span>
        </div>
      ) : null}
    />
  )
}
