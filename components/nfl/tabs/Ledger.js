'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../../../lib/nfl/theme'
import PageHeader from '../../PageHeader'
import LedgerSection from '../../ledger/LedgerSection'
import FirstScorers from '../../ledger/FirstScorers'
import NflFace from '../NflFace'
import Tap from '../../Tap'
import { defenseLeaks } from '../../../lib/nfl/defenseLeaks'
import { findNameEchoes } from '../../../lib/namePatterns'
import { fromNfl } from '../../../lib/numerology/adapters'
import { matchLanes } from '../../../lib/numerology/lanes'
import { kickoffFor } from '../../../lib/nfl/kickoff'
import { easternDate } from '../../../lib/data'

// 🧾 TUDDY'S LEDGER (2026-09-27, ledger plan): MOONSHOT's Homer Ledger for the
// week's touchdowns, drawn in the shared LedgerSection shell. Every section
// reads data the dashboard already holds -- the week file (players: season_td,
// jersey, birth date), the card's calls (picks), the TD lines (results) and
// the defense tables (matchup) -- plus First scorers from the event table.
//   WATCHLIST    the card's TD calls, written before kickoff: N of M scored
//   ROUND NUMBER a scorer whose season total crossed a multiple of 5 this week
//                (week file season_td entering the week + his TDs this week)
//   LINES UP     each scorer's numerology lanes that matched his game's date
//   LOOK-OUT     defenses leaking TDs (lib/nfl/defenseLeaks.js, as on Home)
//   WHO NEEDS WHAT a player one TD short of a multiple of 5 (week file
//                season_td + his TDs this week). Same shape as MOONSHOT's
//                Look-Out: a LOOKUP, labelled as one -- a round number is a
//                counting fact, not a reason to expect a score. (Taken off
//                TUDDY Home 09-27 for reading as a claim there; Donovan asked
//                for it back here, on the page of counting facts.)
//   NAME ECHOES  lib/namePatterns.js over this week's scorers
const sep = (items) => items.filter(Boolean).join(' · ')

export default function Ledger({ data, picks, results, matchup, onPlayerClick, onOpenTeam = null, onOpenGame = null }) {
  const players = data?.players || []
  const byId = useMemo(() => new Map(players.map((p) => [String(p.player_id), p])), [players])
  const tdOf = (id) => Number(results?.lines?.[String(id)]?.TD) || 0
  const scorers = useMemo(() => Object.entries(results?.lines || {}).filter(([, l]) => Number(l?.TD) > 0)
    .map(([id, l]) => ({ id, td: Number(l.TD), p: byId.get(String(id)) || null, name: byId.get(String(id))?.name || results?.names?.[id] || id }))
    .sort((a, b) => b.td - a.td), [results, byId])

  const calls = (picks?.card?.TD?.rungs || []).map((c) => ({ key: String(c.player_id), id: String(c.player_id), name: c.name, team: c.team, td: tdOf(c.player_id), p: byId.get(String(c.player_id)) || null }))
  const landed = calls.filter((c) => c.td > 0).length

  const rounds = scorers.filter((s) => Number.isFinite(Number(s.p?.season_td))).map((s) => {
    const before = Number(s.p.season_td); const after = before + s.td
    return Math.floor(after / 5) > Math.floor(before / 5) ? { ...s, key: s.id, mark: Math.floor(after / 5) * 5, after } : null
  }).filter(Boolean)

  const needs = players.filter((p) => p.position !== 'DEF' && p.season_td != null && Number.isFinite(Number(p.season_td)))
    .map((p) => { const now = Number(p.season_td) + tdOf(p.player_id); return { key: String(p.player_id), id: String(p.player_id), name: p.name, team: p.team, p, now, next: now + 1 } })
    .filter((r) => r.now > 0 && r.next % 5 === 0)
    .sort((a, b) => b.now - a.now || String(a.name).localeCompare(String(b.name)))

  const lines = scorers.filter((s) => s.p).map((s) => {
    const t = kickoffFor(data?.games, s.p)
    const date = Number.isFinite(t) ? easternDate(t) : null
    const a = fromNfl(s.p)
    const m = a && date ? matchLanes(a, { date }) : []
    return m.length ? { ...s, key: s.id, chips: [...new Set(m.map((x) => x.label))], date } : null
  }).filter(Boolean)

  const leaks = defenseLeaks(matchup, data?.games || []).map((l) => ({ ...l, key: `${l.team}|${l.role}` }))
  const echoes = useMemo(() => findNameEchoes(scorers.map((s) => s.name), players.map((p) => p.name), { max: 3 }).map((e, i) => ({ ...e, key: `${e.kind}-${i}` })), [scorers, players])

  const row = (children) => <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, fontSize: 12, flexWrap: 'wrap' }}>{children}</div>
  const who = (s) => (
    <button type="button" onClick={() => s.p && onPlayerClick?.(s.p)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', padding: 0, cursor: s.p ? 'pointer' : 'default', color: C.text, fontWeight: 800, font: 'inherit' }}>
      {s.p ? <NflFace player={s.p} size={24} /> : null}{s.name}
    </button>
  )
  const P = { C, numFont: NUM_FONT, accent: C.green }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow="TUDDY · LEDGER" title="The week in names and numbers" theme={C} numFont={NUM_FONT} accent={C.green}
        note="The card's calls against who scored, round numbers, what lines up, the look-out, name echoes -- and the first touchdown of every game." />
      <FirstScorers sport="nfl" {...P} onOpenGame={onOpenGame} onOpenPlayer={(id) => { const p = byId.get(String(id)); if (p) onPlayerClick?.(p) }} />
      <LedgerSection {...P} title={`✅ THE WATCHLIST · ${landed} OF ${calls.length} SCORED`} blurb="the card's touchdown calls, written before kickoff"
        rows={calls} empty="The card hasn't published this week's touchdown calls yet."
        render={(c) => row(<>{who(c)}<Tap onClick={onOpenTeam && (() => onOpenTeam(c.team))}><span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 10 }}>{c.team}</span></Tap><span style={{ marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 11, fontWeight: 900, color: c.td ? C.green : C.text3 }}>{c.td ? `✓ ${c.td} TD` : '—'}</span></>)} />
      <LedgerSection {...P} title="🔟 ROUND NUMBER THIS WEEK" blurb="a scorer whose season total crossed a multiple of 5"
        rows={rounds} empty={scorers.length ? 'No scorer crossed a multiple of five this week.' : 'No touchdowns graded yet this week.'}
        render={(s) => row(<>{who(s)}<span style={{ marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 11, color: C.green, fontWeight: 900 }}>TD #{s.mark} of the season</span></>)} />
      <LedgerSection {...P} title="🎯 WHO NEEDS WHAT" blurb="one touchdown short of a multiple of 5 · a counting fact, not a reason to expect a score"
        rows={needs} empty={players.length ? 'Nobody on this week’s slate is one touchdown from a multiple of five.' : 'The week file hasn’t loaded.'}
        render={(r) => row(<>{who(r)}<Tap onClick={onOpenTeam && (() => onOpenTeam(r.team))}><span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 10 }}>{r.team}</span></Tap><span style={{ marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 11, color: C.green, fontWeight: 900 }}>{r.now}→{r.next}</span></>)} />
      <LedgerSection {...P} title="🔢 LINES UP WITH HIS GAME DAY" blurb="numerology lanes that matched the date he scored · pattern watching"
        rows={lines} empty={scorers.length ? 'None of this week’s scorers matched a lane on his game day.' : 'No touchdowns graded yet this week.'}
        render={(s) => row(<>{who(s)}<span style={{ color: C.text3, fontSize: 11 }}>{sep(s.chips)}</span></>)} />
      <LedgerSection {...P} title="🩹 THE LOOK-OUT" blurb="defenses leaking touchdowns: top-8 TD matchup by role"
        rows={leaks} empty="The slate has no top-eight TD matchup flagged in the published defense table."
        render={(l) => row(<><Tap onClick={onOpenTeam && (() => onOpenTeam(l.team))}><b style={{ color: C.text }}>{l.team}</b></Tap><span style={{ color: C.text2 }}>{l.role}</span><span style={{ marginLeft: 'auto', color: C.text3, fontFamily: NUM_FONT, fontSize: 10 }}>#{l.td_rank} TD matchup · {Number(l.td || 0).toFixed(0)} allowed</span></>)} />
      <LedgerSection {...P} title="🗣 NAME ECHOES" blurb="the week's scorers' names against everyone who played, with the base rate"
        rows={echoes} empty={scorers.length > 1 ? 'No echo among this week’s scorers.' : 'Needs two scorers to compare.'}
        render={(e) => <div style={{ padding: '6px 0', fontSize: 12, lineHeight: 1.5 }}><b style={{ color: C.green }}>{e.label}</b> <span style={{ color: C.text2 }}>{e.phrase}</span> <span style={{ color: C.text3 }}>{e.note}</span></div>} />
    </div>
  )
}
