'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import PageHeader from '../../PageHeader'
import LedgerSection from '../../ledger/LedgerSection'
import FirstScorers from '../../ledger/FirstScorers'
import { useLampBoard } from '../../../lib/nhl/useLamp'
import { findNameEchoes } from '../../../lib/namePatterns'
import { nhlMug } from '../../../lib/nhl/format'

// 🧾 LAMP'S LEDGER (2026-09-27, ledger plan): the night in names and numbers,
// in the shared LedgerSection shell, from tonight's board (useLampBoard: the
// three called per game, and after the final who scored) plus First scorers
// (lamp_goal_feed) and the look-out (/api/lamp/matchups).
//   WATCHLIST    the board's CALLED skaters: N of M scored (after the final)
//   LOOK-OUT     tonight's softest defences by goals allowed; the net says
//                "starter not announced" -- the feed names none pregame
//   NAME ECHOES  lib/namePatterns.js over tonight's scorers
// Round numbers and "lines up" need season goal totals and jersey / birth
// date on the board rows, which LAMP doesn't carry yet: those sections say so.
export default function Ledger({ date = null, onOpenPlayer }) {
  const { data } = useLampBoard(date, 'GOAL')
  const games = data?.games || []
  const [mu, setMu] = useState(null)
  useEffect(() => {
    let alive = true
    fetch(`/api/lamp/matchups${date ? `?date=${date}` : ''}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setMu(j) }).catch(() => {})
    return () => { alive = false }
  }, [date])
  const rowsOf = (g) => (g.rows || []).map((r) => ({ ...r, _g: g }))
  const all = useMemo(() => games.flatMap(rowsOf), [games])
  const graded = games.some((g) => g.graded)
  const called = all.filter((r) => r.status === 'called').map((r) => ({ ...r, key: `${r._g.game.id}|${r.playerId}` }))
  const landed = called.filter((r) => r.hit).length
  const scorers = all.filter((r) => Number(r.goals) > 0)
  const echoes = useMemo(() => findNameEchoes(scorers.map((r) => r.name), all.map((r) => r.name), { max: 3 }).map((e, i) => ({ ...e, key: `${e.kind}-${i}` })), [scorers, all])
  const soft = (mu?.rows || []).slice(0, 5).map((r) => ({ ...r, key: r.def }))
  const noGames = data && !games.length
  const face = (r) => nhlMug(r._g?.game?.season, r.team, r.playerId)
  const row = (children) => <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, fontSize: 12, flexWrap: 'wrap' }}>{children}</div>
  const who = (r) => (
    <button type="button" onClick={() => onOpenPlayer?.(r.playerId)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: C.text, fontWeight: 800, font: 'inherit' }}>
      {face(r) ? <img src={face(r)} alt="" width={24} height={24} loading="lazy" style={{ width: 24, height: 24, borderRadius: '50%', background: C.bg3 }} /> : null}{r.name}
    </button>
  )
  const P = { C, numFont: NUM_FONT, accent: C.ice }
  const quiet = 'No NHL games on this date.'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow="LAMP · LEDGER" title="The night in names and numbers" theme={C} numFont={NUM_FONT} accent={C.ice}
        note="The board's calls against who scored, the look-out, name echoes -- and the first goal of every game." />
      <FirstScorers sport="nhl" {...P} day={date} emptyWhy={noGames ? quiet : 'No regular-season goal on file in the last few days.'} onOpenPlayer={(id) => onOpenPlayer?.(id)} />
      <LedgerSection {...P} title={graded ? `✅ THE WATCHLIST · ${landed} OF ${called.length} SCORED` : `✅ THE WATCHLIST · ${called.length} CALLED`}
        blurb={graded ? 'the three called per game, graded after the final' : 'the three called per game; graded after the final'}
        rows={called} empty={noGames ? quiet : 'No calls on the board yet.'}
        render={(r) => row(<>{who(r)}<span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 10 }}>{r.team} · #{r.rank} in {r._g.game.away.abbrev}@{r._g.game.home.abbrev}</span><span style={{ marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 11, fontWeight: 900, color: r.hit ? C.lamp : C.text3 }}>{r._g.graded ? (r.hit ? `✓ ${r.goals} G` : '—') : 'pending'}</span></>)} />
      <LedgerSection {...P} title="🔟 ROUND NUMBER TONIGHT" blurb="a scorer reaching 10 / 20 / 30 goals"
        rows={[]} empty="Needs each scorer's season goal total on the board rows, which LAMP doesn't carry yet -- nothing is counted by guess." />
      <LedgerSection {...P} title="🔢 LINES UP WITH TONIGHT" blurb="jersey, birthday and name numbers against the date"
        rows={[]} empty="Needs jersey and birth date on the board rows, which LAMP doesn't carry yet. The Numerology tab has tonight's numbers." />
      <LedgerSection {...P} title="🩹 THE LOOK-OUT" blurb="tonight's softest defences by goals allowed · the net: starter not announced"
        rows={soft} empty={noGames ? quiet : 'Loading tonight’s defences…'}
        render={(r) => row(<><b style={{ color: C.text }}>{r.def}</b><span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 10 }}>{r.home ? 'vs' : '@'} {r.opp}</span><span style={{ marginLeft: 'auto', color: C.text2, fontFamily: NUM_FONT, fontSize: 10 }}>{r.gaPg ?? '—'} GA/GP · PK {r.pk != null ? `${(r.pk * 100).toFixed(1)}%` : '—'}</span></>)} />
      <LedgerSection {...P} title="🗣 NAME ECHOES" blurb="tonight's scorers' names against everyone rated, with the base rate"
        rows={echoes} empty={noGames ? quiet : scorers.length > 1 ? 'No echo among tonight’s scorers.' : 'Fills in once goals are graded.'}
        render={(e) => <div style={{ padding: '6px 0', fontSize: 12, lineHeight: 1.5 }}><b style={{ color: C.ice }}>{e.label}</b> <span style={{ color: C.text2 }}>{e.phrase}</span> <span style={{ color: C.text3 }}>{e.note}</span></div>} />
    </div>
  )
}
