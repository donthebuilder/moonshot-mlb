'use client'
// 🎯 THE TWO THINGS THE MLB CARD DOES THAT THIS ONE DIDN'T (2026-09-05).
//
// 1. THE VERDICT. MOONSHOT's PlayerModal flips to graded the moment a result
//    exists (PickVerdictStamp). TUDDY's modal never read nfl_results at all:
//    the grading lived only on Accountability. Here: once his line is in the
//    results payload, every market he is scored in shows actual vs bar.
//
// 2. LOG A PICK. The only way to put your own man on the card was the rung
//    swap on the Picks tab. Same store, same slot key (MARKET|rank), same
//    lock rule (his game's kickoff), same "picking the bot's own man clears
//    the override" -- this is a second door into lib/nfl/myPicks, not a second
//    ledger. One market at a time (the one the modal is open on), the rungs
//    the card publishes for it, the current occupant named under each.
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { slateKey, slotKey, isLocked, getPicks, savePick, clearPick } from '../../lib/nfl/myPicks'

const short = (m) => String(m || '').replace('_', ' ')

export function VerdictStamp({ player, results, bars }) {
  const line = results?.lines?.[String(player?.player_id)]
  if (!line) return null
  const rows = Object.keys(player.scores || {})
    .filter((m) => Number.isFinite(bars?.[m]) && line[m] !== undefined && line[m] !== null)
    .map((m) => ({ m, v: Number(line[m]), bar: bars[m], hit: Number(line[m]) >= bars[m] }))
  if (!rows.length) return null
  const hits = rows.filter((r) => r.hit).length
  return (
    <div style={{ margin: '10px 0 2px', padding: '9px 11px', borderRadius: 10, border: `1px solid ${hits ? 'rgba(34,197,94,.4)' : 'rgba(248,113,113,.35)'}`, background: hits ? 'rgba(34,197,94,.06)' : 'rgba(248,113,113,.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ font: `900 8.5px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: hits ? C.green : C.red }}>GRADED · {results.mode === 'week' ? `WEEK ${results.week}` : 'PRESEASON'}</span>
        <span style={{ font: `800 9px/1 ${NUM_FONT}`, color: C.text3 }}>{hits}/{rows.length} bars cleared{results.graded_at_human ? ` · ${results.graded_at_human}` : ''}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {rows.map((r) => (
          <span key={r.m} title={`${short(r.m)}: ${r.v} against a bar of ${r.bar}`} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, padding: '4px 8px', borderRadius: 7, border: `1px solid ${r.hit ? 'rgba(34,197,94,.45)' : C.border}`, background: r.hit ? 'rgba(34,197,94,.08)' : 'transparent', fontFamily: NUM_FONT }}>
            <small style={{ fontSize: 7.5, fontWeight: 800, color: C.text3 }}>{short(r.m)}</small>
            <b style={{ fontSize: 12, color: r.hit ? C.green : C.red }}>{r.v}</b>
            <i style={{ fontStyle: 'normal', fontSize: 8, color: C.text3 }}>/{r.bar}</i>
            <b style={{ fontSize: 8, color: r.hit ? C.green : C.red }}>{r.hit ? '✓' : '✗'}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

export function PutOnCard({ player, market, picks, slate }) {
  const [, bump] = useState(0)
  const block = picks?.card?.[market]
  const key = picks ? slateKey(picks.season, picks.week, picks.mode) : null
  const depth = Number(picks?.depth) || 5
  const rungs = (block?.rungs || []).slice(0, depth)
  const game = (slate?.games || []).find((g) => g.home === player.team || g.away === player.team)
  const locked = isLocked(game?.kickoff)
  const mine = key ? getPicks(key) : {}
  useEffect(() => { bump((n) => n + 1) }, [key, market])
  if (!key || !rungs.length) return null
  const pid = String(player.player_id)
  const botRank = rungs.find((r) => String(r.player_id) === pid)?.rank
  const myRank = Object.values(mine).find((p) => p.market === market && String(p.pid) === pid)?.rank

  const put = (rung) => {
    if (locked) return
    if (myRank === rung.rank) clearPick(key, market, rung.rank)
    else savePick(key, market, rung.rank, player, rung, mine[slotKey(market, rung.rank)]?.conviction || 'strong')
    bump((n) => n + 1)
  }

  return (
    <div style={{ margin: '10px 0 2px', padding: '9px 11px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,.02)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
        <span style={{ font: `900 8.5px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: C.cyan }}>YOUR CARD · {short(market)}</span>
        <span style={{ font: `700 8.5px/1.3 ${NUM_FONT}`, color: C.text3, textAlign: 'right' }}>
          {locked ? 'kicked off — this market is locked' : botRank ? `the bot has him at rung ${botRank}` : myRank ? `you have him at rung ${myRank}` : 'tap a rung to put him on it'}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rungs.length}, 1fr)`, gap: 5 }}>
        {rungs.map((rung) => {
          const sk = slotKey(market, rung.rank)
          const over = mine[sk]
          const isMe = myRank === rung.rank
          const isBot = botRank === rung.rank
          const holder = over ? over.name : rung.name
          return (
            <button key={rung.rank} type="button" onClick={() => put(rung)} disabled={locked || isBot}
              title={isBot ? `${player.name} is the bot's own call here` : over ? `Your override: ${over.name} over ${rung.name}` : `Bot: ${rung.name} (${Math.round(rung.score)})`}
              style={{ padding: '6px 4px', borderRadius: 8, cursor: locked || isBot ? 'default' : 'pointer', textAlign: 'center', color: 'inherit',
                border: `1px solid ${isMe ? C.cyan : isBot ? C.green + '88' : over ? C.yellow + '66' : C.border}`,
                background: isMe ? 'rgba(34,211,238,.1)' : isBot ? 'rgba(34,197,94,.08)' : 'transparent', opacity: locked ? .6 : 1 }}>
              <div style={{ font: `900 12px/1 ${NUM_FONT}`, color: isMe ? C.cyan : isBot ? C.green : C.text2 }}>{rung.rank}</div>
              <div style={{ marginTop: 4, fontSize: 8, color: isMe || isBot ? C.text : C.text3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isMe ? 'YOU' : isBot ? 'BOT' : holder.split(' ').slice(-1)[0]}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
