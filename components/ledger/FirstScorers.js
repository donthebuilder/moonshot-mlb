'use client'
import { useEffect, useState } from 'react'
import LedgerSection from './LedgerSection'
import Tap from '../Tap'
import { MatchLogos } from '../TeamMark'
import CallStatusBadge from '../CallStatusBadge'

// 🥇 FIRST SCORERS (ledger plan step 2): who scored first in each recent game,
// when, and whether the board had him -- plus the season line. Tracking only:
// there is no first-scorer pick yet (it needs its own model and a graded
// archive, which this is the start of). /api/ledger/first.
const WORD = {
  mlb: { event: 'homer', first: 'first homer', title: 'FIRST HOMER OF EACH GAME', note: 'The first home run, not the first run.' },
  nfl: { event: 'TD', first: 'first touchdown', title: 'FIRST TOUCHDOWN OF EACH GAME', note: null },
  nhl: { event: 'goal', first: 'first goal', title: 'FIRST GOAL OF EACH GAME', note: null },
  nba: { event: 'basket', first: 'first basket', title: 'FIRST BASKET OF EACH GAME', note: 'The first made field goal -- the shot the first-basket board is graded on.' },
}
// lib/callStatus.js, the one set of words (R2)

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
  return (
    <LedgerSection C={C} numFont={numFont} accent={accent} title={`🥇 ${w.title}`}
      blurb={`who scored first, when, and whether the board had him${w.note ? ` · ${w.note}` : ''}`}
      rows={(data?.games || []).map((g) => ({ ...g, key: `${g.day}|${g.gameId}` }))}
      empty={err ? 'First scorers are delayed.' : !data ? 'Loading…' : emptyWhy || `No ${w.event} on file in the last few days.`}
      render={(g) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, fontSize: 12, flexWrap: 'wrap' }}>
          {/* 2026-10-03: the matchup as the two clubs' logos (was "VGK v ANA"), the
              name a step up, the status the shared stamp (CallStatusBadge) */}
          <span style={{ color: C.text3, fontFamily: numFont, fontSize: 11, minWidth: 74 }}><Tap onClick={onOpenGame && (() => onOpenGame(g.gameId, g))}>{(() => { const [a, h] = String(g.game || '').split(/\s+(?:v|@|vs)\s+/); return a && h ? <MatchLogos sport={sport} away={a} home={h} px={18} gap={5} /> : g.game })()}</Tap></span>
          <button type="button" onClick={() => g.playerId && onOpenPlayer?.(g.playerId, g)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: g.playerId ? 'pointer' : 'default', color: C.text, fontWeight: 800, font: 'inherit', fontSize: 13.5 }}>{g.name}</button>
          <span style={{ color: C.text3, fontFamily: numFont, fontSize: 11 }}>{g.when}</span>
          <span style={{ marginLeft: 'auto' }}><CallStatusBadge status={g.status} accent={accent} theme={C} numFont={numFont} /></span>
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
