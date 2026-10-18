'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../nhl/theme'
import { LedgerHead, RoundLine, WatchStrip, AlignBox, LookOutBox, NextUpBox, ScorerChips, SpotBars, ord } from '../../../components/ledger/LedgerBlocks'
import NamePatterns from '../../../components/NamePatterns'
import { useLampBoard, useLampNumerology } from '../../nhl/useLamp'
import { fromNhl } from '../../numerology/adapters'
import { matchLanes, displayLanes } from '../../numerology/lanes'
import { dayLabels, isDateLane } from '../../numerology/lanePlayers'
import { roundMark, oneShort } from '../../ledger/backHalf'
import { digitRoot, lifePathOf } from '../../numerology/core'
import { nameParts, pairEcho } from '../../namePatterns'
import { rankNextUp } from '../../ledger/nextUp'
import NumbersBox from '../../../components/ledger/NumbersBox'
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
  // ONE DENOMINATOR (2026-10-06, ledger audit P2): the watchlist said 7/18 while Home and the record say
  // "7 of 14 called who dressed scored". A called skater who did not dress is neither a hit nor a miss
  // (the record sets him aside), so the strip counts the called who dressed -- or whose game is not in
  // yet -- and says how many were set aside.
  const calledIn = called.filter((r) => r.dressed !== false)
  const sitOut = called.length - calledIn.length
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
    return all.filter((r) => { const k = String(r.playerId); if (seen.has(k)) return false; seen.add(k); const n = g.get(k); return oneShort(n, 10) })
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
    const mark = roundMark(before, r.goals, 10)
    return mark != null ? { ...r, key: `${r._g.game.id}|${r.playerId}`, mark } : null
  }).filter(Boolean)
  // LINES UP: his jersey, birthday and name numbers against the night's date.
  // Fibonacci lanes aren't about the day (TUDDY's 09-28 rule) -- left out.
  const lines = scorers.map((r) => {
    const n = numBy.get(String(r.playerId))
    const a = n ? fromNhl({ ...n, seasonGoals: n.seasonGoals ?? null }) : null
    const m = a && nightDate ? displayLanes(matchLanes(a, { date: nightDate })) : []
    const dayLanes = dayLabels(m)
    return dayLanes.length ? { ...r, key: `${r._g.game.id}|${r.playerId}`, chips: dayLanes } : null
  }).filter(Boolean)
  const P = { C, numFont: NUM_FONT, accent: C.ice }
  const quiet = 'No NHL games on this date.'
  const open = (id) => () => onOpenPlayer?.(id)
  const team = (t) => (onOpenTeam ? () => onOpenTeam(t) : null)
  // 🔮 FITS TONIGHT'S PATTERN, HASN'T SCORED YET -- MOONSHOT's forward half (HomerLedger / homerModel nextUp,
  // TUDDY's Ledger): skaters on tonight's board who haven't scored, whose game isn't final, standing on
  //   - a numerology lane that matches the night's date (lib/numerology/lanes: jersey root, life path, personal
  //     day, name number...) -- Fibonacci left out (not about the day)
  //   - the root the night's scorers keep landing on (jersey root / birth day / life path, two or more scorers)
  //   - a name echo with a scorer (same first name, same surname, one letter apart, cross-name) or his jersey
  // Ranked by how many, then LAMP score. Jersey and birth date come from /api/lamp/numerology, which reads
  // them only for skaters on a POSTED lineup: a game with no lineup yet has no jersey or birth day, so those
  // lanes sit out for it (name lanes and name echoes still run). A watch, not a prediction.
  const axesOf = (r) => { const n = numBy.get(String(r.playerId)); return n ? { jersey: n.jersey > 0 ? digitRoot(n.jersey) : null, day: n.birthDate ? digitRoot(Number(String(n.birthDate).slice(8, 10)) || 0) || null : null, path: n.birthDate ? lifePathOf(n.birthDate) || null : null } : null }
  const nextUp = useMemo(() => {
    const tally = { jersey: new Map(), day: new Map(), path: new Map() }
    scorers.forEach((r) => { const a = axesOf(r); if (a) Object.entries(a).forEach(([k, v]) => { if (v) tally[k].set(v, (tally[k].get(v) || 0) + 1) }) })
    const lead = (m) => [...m.entries()].filter(([, c]) => c >= 2).sort((x, y) => y[1] - x[1])[0] || null
    const top = { jersey: lead(tally.jersey), day: lead(tally.day), path: lead(tally.path) }
    const scorerParts = scorers.map((r) => ({ r, parts: nameParts(r.name), jersey: numBy.get(String(r.playerId))?.jersey || null })).filter((x) => x.parts)
    const seen = new Set()
    return rankNextUp(all.filter((r) => r._g.game.state !== 'final' && !(Number(r.goals) > 0) && !seen.has(String(r.playerId)) && seen.add(String(r.playerId)))
      .map((r) => {
        const n = numBy.get(String(r.playerId))
        const a = fromNhl({ ...(n || {}), name: r.name, team: r.team, seasonGoals: n?.seasonGoals ?? null })
        const lanes = a && nightDate ? displayLanes(matchLanes(a, { date: nightDate })) : []
        const day = lanes.filter(isDateLane)
        const chips = [...new Set(day.map((x) => x.short))]   // the short tag each lane wears (LANE_SHORT), not its long label
        let nLanes = new Set(day.map((x) => x.family)).size   // ranked by lanes, not by how many ciphers one lane matched
        const ax = axesOf(r)
        if (ax) {
          if (top.jersey && ax.jersey === top.jersey[0]) { chips.push(`#${n.jersey}→${top.jersey[0]} again`); nLanes++ }
          if (top.day && ax.day === top.day[0]) { chips.push(`day ${top.day[0]} again`); nLanes++ }
          if (top.path && ax.path === top.path[0]) { chips.push(`path ${top.path[0]} again`); nLanes++ }
        }
        const mine = nameParts(r.name)
        let echoes = 0
        scorerParts.forEach((sc) => {
          if (echoes >= 2 || !mine || sc.r.playerId === r.playerId) return
          const shared = pairEcho(mine, sc.parts)
          const last = String(sc.r.name).split(' ').slice(-1)[0]
          if (shared) { echoes += 1; nLanes++; chips.push(`↔ ${last}`) }
          else if (n?.jersey && sc.jersey && n.jersey === sc.jersey) { echoes += 1; nLanes++; chips.push(`#${n.jersey} too`) }
        })
        // EVERYONE still to come (lib/ledger/nextUp.js): the patterns he stands on first, then what his own numbers say -- a skater with no pattern still appears, on his score
        const stat = [r.status === 'called' ? `CALLED #${r.rank}` : r.rank != null ? `#${r.rank} in his game` : null, Number.isFinite(Number(r.score)) ? `LAMP ${Math.round(Number(r.score))}` : null].filter(Boolean)
        return { ...r, key: `${r._g.game.id}|${r.playerId}`, when: r._g.game.state === 'live' ? 'now' : 'later', chips, nLanes, stat }
      }), { cap: 12 })
  }, [all, scorers, numBy, nightDate])   // eslint-disable-line react-hooks/exhaustive-deps
  // the called-pending list, kept as the fallback when nothing matches
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
      watch: (<WatchStrip color={C.ice} label="Tonight's watchlist:" hits={landed} watched={calledIn.length}
          sentence={`${!graded ? 'called — one per team in every game, graded after the final.' : landed === 0 ? 'called skaters who dressed scored — the calls, one per team, written before puck drop.' : 'called skaters who dressed scored, off the calls (one per team) written before puck drop.'}${sitOut ? ` ${sitOut} called ${sitOut === 1 ? 'skater' : 'skaters'} did not dress and ${sitOut === 1 ? 'is' : 'are'} not counted, as on the record page.` : ''}`}>
          {called.filter((r) => r.hit).map((r) => (
            <span key={r.key}>{' · '}<b onClick={open(r.playerId)} style={{ color: C.text, cursor: 'pointer' }}>{r.name}</b><span style={{ color: C.text3, fontFamily: NUM_FONT }}> {r.goals} G</span></span>
          ))}
        </WatchStrip>),
      align: (<AlignBox accent={C.ice} preview={8} title="🧲 Lining up with the date" sub={`${lines.length} scorer${lines.length === 1 ? '' : 's'} on a numerology lane that matched the night he scored`}
          chips={lines.map((l) => ({ key: l.key, name: l.name, tags: l.chips.map((c) => ({ k: c, label: c })), onClick: open(l.playerId) }))}
          foot="Overlap, not evidence: a night of goals will line up with the date by arithmetic alone. Never a reason to chase one." />),
      // THE NUMBERS (2026-10-10): the night's numbers named, yesterday's, and the lane scoreboard (cipher lanes included)
      numbers: nightDate ? (<NumbersBox sport="nhl" date={nightDate} theme={C} numFont={NUM_FONT} accent={C.ice} eventWord="goals" />) : null,
      lookout: (<>
        <LookOutBox accent={C.ice} title="👀 The look-out — tonight, before it happens" tag="lookups, not predictions"
          rows={[
            { key: 'def', label: 'Defences to watch', hint: 'most goals allowed tonight', hintTitle: 'Tonight’s defences with the most goals allowed a game (/api/lamp/matchups). The net: no starter is announced before puck drop, so none is named.',
              chips: soft.map((r) => ({ key: r.key, name: r.def, nameTeam: 'nhl', small: `${r.home ? 'vs' : '@'} ${r.opp}`, em: `${r.gaPg ?? '—'} GA`, hot: false, title: `${r.gaPg ?? '—'} goals allowed a game · PK ${r.pk != null ? `${(r.pk * 100).toFixed(1)}%` : '—'}`, onClick: team(r.def) })) },
            { key: 'needs', label: 'Who needs what', hint: 'one goal from a round number', hintTitle: 'A skater one goal short of the next multiple of ten, on this season’s count. A counting fact, not a reason to expect a goal.',
              chips: needs.map((r) => ({ key: r.key, name: r.name, small: r.team, smallTeam: r.team, em: `${r.now}→${r.next}`, onClick: open(r.playerId) })) },
          ]} />
        {!noGames && !needs.length && hs && <div style={{ fontSize: 9, color: C.text3, margin: '-4px 0 9px' }}>{needsEmpty}</div>}
      </>),
      names: (<NamePatterns homers={scorers.map((r) => ({ name: r.name }))} population={all.map((r) => ({ name: r.name }))} sport="nhl" />),
      nextUp: nextUp.length ? (<NextUpBox title="🔮 Still to come, best fit first" color={C.ice}
          rows={nextUp.map((x) => ({ key: x.key, when: x.when, name: x.name, chips: x.chips, title: `${x.chips.join(' · ')}.${x.status === 'called' ? ` Called #${x.rank} in his game.` : ''} LAMP score ${Math.round(x.score ?? 0)}.`, onClick: open(x.playerId) }))}
          about="Every skater on tonight's board whose game isn't final and who hasn't scored. Tags: numerology lanes that match the date, name echoes with a scorer, then his own board rank and LAMP score, so a skater with no pattern still shows, on his numbers. Live games first. A watch, never a prediction." />)
        : pending.length ? (<NextUpBox title="🔮 Called, still to come" color={C.ice}
          rows={pending.map((r) => ({ key: r.key, when: r._g.game.state === 'live' ? 'now' : 'later', name: r.name, chips: [`#${r.rank} ${r._g.game.away.abbrev}@${r._g.game.home.abbrev}`, `LAMP ${Math.round(r.score ?? 0)}`], title: `Called #${r.rank} in his game`, onClick: open(r.playerId) }))}
          about="Nobody still to come stands on tonight's numbers, so this is the fallback: the skaters the board called, whose game isn't final and who haven't scored. The call was locked before puck drop and is graded after the final." />) : null,
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
