'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../nhl/theme'
import { LedgerHead, RoundLine, WatchStrip, AlignBox, LookOutBox, NextUpBox, ScorerChips, SpotBars, ord } from '../../../components/ledger/LedgerBlocks'
import NamePatterns from '../../../components/NamePatterns'
import { useLampBoard, useLampNumerology } from '../../nhl/useLamp'
import { fromNhl } from '../../numerology/adapters'
import { matchLanes } from '../../numerology/lanes'
import NhlTonight from '../../../components/tonight/NhlTonight'

// 🧾 LAMP'S LEDGER (2026-09-27, ledger plan): the night in names and numbers,
// drawn with MOONSHOT's own ledger blocks (components/ledger/LedgerBlocks.js, 2026-09-28), from tonight's board (useLampBoard: the
// the calls, one per team, and after the final who scored) plus First scorers
// (lamp_goal_feed) and the look-out (/api/lamp/matchups).
//   WATCHLIST    the board's CALLED skaters: N of M scored (after the final)
//   LOOK-OUT     tonight's softest defences by goals allowed; the net says
//                "starter not announced" -- the feed names none pregame
//   WHO NEEDS WHAT tonight's skaters one goal short of 10 / 20 / 30, on the
//                season goal count Hot Sticks already reads (a lookup, labelled)
//   NAME ECHOES  lib/namePatterns.js over tonight's scorers
//   ROUND NUMBER a scorer whose season total crossed a multiple of 10 tonight
//                (goals in the season's games before this date + tonight's)
//   LINES UP     each scorer's numerology lanes that matched the night's date
// Both read /api/lamp/numerology (lib/nhl/numerology.js): the jersey he wore
// tonight, his birth date, and his goals entering the night -- bounded by the
// date, so a past night counts what he had then (2026-10-05, parity).
export function useNhlLedger({ date = null, onOpenPlayer, onOpenTeam = null, onOpenGame = null }) {
  const { data } = useLampBoard(date, 'GOAL')
  const games = data?.games || []
  const [mu, setMu] = useState(null)
  useEffect(() => {
    let alive = true
    fetch(`/api/lamp/matchups${date ? `?date=${date}` : ''}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setMu(j) }).catch(() => {})
    return () => { alive = false }
  }, [date])
  const [hs, setHs] = useState(null)
  useEffect(() => {
    let alive = true
    fetch('/api/lamp/hotsticks').then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setHs(j || { failed: true }) }).catch(() => { if (alive) setHs({ failed: true }) })
    return () => { alive = false }
  }, [])
  const num = useLampNumerology(date)
  const numBy = useMemo(() => new Map((num.data?.all || []).map((r) => [String(r.id), r])), [num.data])
  const rowsOf = (g) => (g.rows || []).map((r) => ({ ...r, _g: g }))
  const all = useMemo(() => games.flatMap(rowsOf), [games])
  const graded = games.some((g) => g.graded)
  const called = all.filter((r) => r.status === 'called').map((r) => ({ ...r, key: `${r._g.game.id}|${r.playerId}` }))
  const landed = called.filter((r) => r.hit).length
  const scorers = all.filter((r) => Number(r.goals) > 0)
  const soft = (mu?.rows || []).slice(0, 5).map((r) => ({ ...r, key: r.def }))
  const noGames = data && !games.length
  // WHO NEEDS WHAT: tonight's board skaters one goal short of a multiple of
  // ten, on this season's goal count from Hot Sticks (NHL stats API season
  // report). Hot Sticks falls back to last season in the summer ("stale") --
  // last season's total is not this season's, so then the section says why.
  const needs = useMemo(() => {
    if (!hs?.rows || hs.stale) return []
    const g = new Map(hs.rows.map((r) => [String(r.id), Number(r.seasonG)]))
    const seen = new Set()
    return all.filter((r) => { const k = String(r.playerId); if (seen.has(k)) return false; seen.add(k); const n = g.get(k); return Number.isFinite(n) && n > 0 && (n + 1) % 10 === 0 })
      .map((r) => ({ ...r, key: String(r.playerId), now: g.get(String(r.playerId)), next: g.get(String(r.playerId)) + 1 }))
      .sort((a, b) => b.now - a.now)
  }, [hs, all])
  const needsEmpty = noGames ? 'No NHL games on this date.' : !hs ? 'Loading season goal counts…' : hs.failed ? 'Season goal counts didn’t load.'
    : hs.stale ? `The ${hs.current ? `${String(hs.current).slice(0, 4)}-${String(hs.current).slice(6)}` : 'new'} regular season has no goals on file yet -- last season's totals don't carry over.`
      : 'Nobody on tonight’s board is one goal from a multiple of ten.'
  // ROUND NUMBER: goals entering the night + tonight's, past a multiple of ten
  // (the same mark as Who needs what). No total on file -> he sits out.
  const nightDate = num.data?.date || date
  const rounds = scorers.map((r) => {
    const before = numBy.get(String(r.playerId))?.seasonGoals
    if (!Number.isFinite(before)) return null
    const after = before + Number(r.goals)
    return Math.floor(after / 10) > Math.floor(before / 10) ? { ...r, key: `${r._g.game.id}|${r.playerId}`, mark: Math.floor(after / 10) * 10 } : null
  }).filter(Boolean)
  // LINES UP: his jersey, birthday and name numbers against the night's date.
  // Fibonacci lanes aren't about the day (TUDDY's 09-28 rule) -- left out.
  const lines = scorers.map((r) => {
    const n = numBy.get(String(r.playerId))
    const a = n ? fromNhl({ ...n, seasonGoals: n.seasonGoals ?? null }) : null
    const m = a && nightDate ? matchLanes(a, { date: nightDate }) : []
    const dayLanes = [...new Set(m.map((x) => x.label))].filter((l) => !/fibonacci/i.test(l))
    return dayLanes.length ? { ...r, key: `${r._g.game.id}|${r.playerId}`, chips: dayLanes } : null
  }).filter(Boolean)
  const P = { C, numFont: NUM_FONT, accent: C.ice }
  const quiet = 'No NHL games on this date.'
  const open = (id) => () => onOpenPlayer?.(id)
  const team = (t) => (onOpenTeam ? () => onOpenTeam(t) : null)
  // 🔮 WHO'S STILL TO COME -- the called skaters whose game isn't final and who
  // haven't scored: MOONSHOT's "fits tonight's pattern", on the one pattern the
  // board carries (the call). A watch, not a prediction.
  const pending = called.filter((r) => r._g.game.state !== 'final' && !(Number(r.goals) > 0))
  const POS = [['C', 'Centre'], ['L', 'Left wing'], ['R', 'Right wing'], ['D', 'Defence']]
  const goalsBy = POS.map(([k]) => scorers.filter((r) => r.pos === k).reduce((n, r) => n + Number(r.goals || 0), 0))
  const totalG = scorers.reduce((n, r) => n + Number(r.goals || 0), 0)
  // THE PAGE, AS DATA (BATCH-ONE-SITE step 1): the blocks above, unchanged, handed to
  // components/pages/LedgerPage -- which owns the layout and the one section order.
  return {
    // TONIGHT (step 5): Home's strip off the board this Ledger already polls -- no scores read
    tonight: <NhlTonight board={data} date={date} onOpenPlayer={onOpenPlayer} />,
    head: { eyebrow: "LAMP · LEDGER", title: "The night in names and numbers", theme: C, numFont: NUM_FONT, accent: C.ice, note: "The board's calls against who scored, round numbers, what lines up, the look-out, name echoes -- and the first goal of every game." },
    frame: { accent: C.ice, header: <LedgerHead title="🧾 Goal ledger" count={totalG} countWord="tonight" note={graded ? 'graded after the finals' : 'builds as the night plays'} accent={C.ice} /> },
    sections: {
      empty: (<>
        {noGames && <div style={{ fontSize: 10.5, color: C.text3, marginBottom: 8 }}>{quiet}</div>}
        {!noGames && !scorers.length && <div style={{ fontSize: 10.5, color: C.text3, marginBottom: 8 }}>No goals graded yet tonight — the ledger fills after the finals.</div>}
      </>),
      round: (<RoundLine label="Round number tonight:" accent={C.ice}
          items={rounds.map((r) => ({ key: r.key, name: r.name, num: `${ord(r.mark)} goal`, onClick: open(r.playerId) }))} />),
      watch: (<WatchStrip label="Tonight's watchlist:" hits={landed} watched={called.length}
          sentence={!graded ? 'called — one per team in every game, graded after the final.' : landed === 0 ? 'scored — the calls, one per team, written before puck drop.' : 'scored, off the calls (one per team) written before puck drop.'}>
          {called.filter((r) => r.hit).map((r) => (
            <span key={r.key}>{' · '}<b onClick={open(r.playerId)} style={{ color: C.text, cursor: 'pointer' }}>{r.name}</b><span style={{ color: C.text3, fontFamily: NUM_FONT }}> {r.goals} G</span></span>
          ))}
        </WatchStrip>),
      align: (<AlignBox accent={C.ice} preview={8} title="🧲 Lining up with the date" sub={`${lines.length} scorer${lines.length === 1 ? '' : 's'} on a numerology lane that matched the night he scored`}
          chips={lines.map((l) => ({ key: l.key, name: l.name, tags: l.chips.map((c) => ({ k: c, label: c })), onClick: open(l.playerId) }))}
          foot="Overlap, not evidence. A night of goals spread over jersey numbers, birthdays and name numbers will line up with the date by arithmetic alone — the trend made visible, never a reason to chase one." />),
      lookout: (<>
        <LookOutBox accent={C.ice} title="👀 The look-out — tonight, before it happens" tag="lookups, not predictions"
          rows={[
            { key: 'def', label: 'Defences to watch', hint: 'most goals allowed tonight', hintTitle: 'Tonight’s defences with the most goals allowed a game (/api/lamp/matchups). The net: no starter is announced before puck drop, so none is named.',
              chips: soft.map((r) => ({ key: r.key, name: r.def, small: `${r.home ? 'vs' : '@'} ${r.opp}`, em: `${r.gaPg ?? '—'} GA`, hot: false, title: `${r.gaPg ?? '—'} goals allowed a game · PK ${r.pk != null ? `${(r.pk * 100).toFixed(1)}%` : '—'}`, onClick: team(r.def) })) },
            { key: 'needs', label: 'Who needs what', hint: 'one goal from a round number', hintTitle: 'A skater one goal short of the next multiple of ten, on this season’s count. A counting fact, not a reason to expect a goal.',
              chips: needs.map((r) => ({ key: r.key, name: r.name, small: r.team, em: `${r.now}→${r.next}`, onClick: open(r.playerId) })) },
          ]} />
        {!noGames && !needs.length && hs && <div style={{ fontSize: 9, color: C.text3, margin: '-4px 0 9px' }}>{needsEmpty}</div>}
      </>),
      names: (<NamePatterns homers={scorers.map((r) => ({ name: r.name }))} population={all.map((r) => ({ name: r.name }))} sport="nhl" />),
      nextUp: (<NextUpBox title="🔮 Called, still to come" color={C.ice}
          rows={pending.map((r) => ({ key: r.key, when: r._g.game.state === 'live' ? 'now' : 'later', name: r.name, chips: [`#${r.rank} ${r._g.game.away.abbrev}@${r._g.game.home.abbrev}`, `LAMP ${Math.round(r.score ?? 0)}`], title: `Called #${r.rank} in his game`, onClick: open(r.playerId) }))}
          about="The skaters the board called, whose game isn't final and who haven't scored. ⚡ live, ⏳ still to come. The call was locked before puck drop and is graded after the final." />),
      scorers: (<ScorerChips sport="nhl" accent={C.ice} preview={12} cards={scorers.map((r) => ({
          key: `${r._g.game.id}|${r.playerId}`, icon: '🚨', team: r.team, name: r.name, times: Number(r.goals), milestone: r.status === 'called', numHot: r.status === 'called',
          num: r.status === 'called' ? 'CALLED' : r.status === 'board' ? `#${r.rank}` : 'off the board', spot: r.pos || null, onClick: open(r.playerId),
          title: `${r.name} (${r.team}) — ${r.goals} goal${Number(r.goals) === 1 ? '' : 's'} tonight · ${r.status === 'called' ? 'CALLED' : r.status === 'board' ? `on the board, #${r.rank} in his game` : 'not on the board'}.`,
          badges: [],
        }))} />),
      spots: (<SpotBars accent={C.ice} title="Goals by position" bars={POS.map(([k, w], i) => ({ key: k, label: k, value: goalsBy[i], title: `${goalsBy[i]} goal${goalsBy[i] === 1 ? '' : 's'} tonight by ${w.toLowerCase()}s` }))}
          foot={totalG ? <>{totalG} goals tonight. One night is a picture, not a finding — texture, never a signal to chase.</> : null} />),
    },
    first: { ...P, sport: "nhl", day: date, onOpenGame: onOpenGame && ((id) => onOpenGame(Number(id))), emptyWhy: noGames ? quiet : 'No regular-season goal on file in the last few days.', onOpenPlayer: (id) => onOpenPlayer?.(id) },
  }
}
