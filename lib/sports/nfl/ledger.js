'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../../nfl/theme'
import { LedgerHead, RoundLine, WatchStrip, AlignBox, LookOutBox, NextUpBox, ScorerChips, SpotBars, ord } from '../../../components/ledger/LedgerBlocks'
import NamePatterns from '../../../components/NamePatterns'
import { defenseLeaks } from '../../nfl/defenseLeaks'
import { fromNfl } from '../../numerology/adapters'
import { matchLanes } from '../../numerology/lanes'
import { kickoffFor } from '../../nfl/kickoff'
import { easternDate } from '../../data'

// 🧾 TUDDY'S LEDGER (2026-09-27, ledger plan): MOONSHOT's Homer Ledger for the
// week's touchdowns, drawn with MOONSHOT's own ledger blocks (components/ledger/LedgerBlocks.js, 2026-09-28). Every section
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

export function useNflLedger({ data, picks, results, matchup, onPlayerClick, onOpenTeam = null, onOpenGame = null }) {
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
    // Only the lanes ABOUT the day (2026-09-28): "is Fibonacci" lanes aren't a
    // match with the date, and on their own they lit up 60 of 62 scorers.
    const dayLanes = [...new Set(m.map((x) => x.label))].filter((l) => !/fibonacci/i.test(l))
    return dayLanes.length ? { ...s, key: s.id, chips: dayLanes, date } : null
  }).filter(Boolean)

  const P = { C, numFont: NUM_FONT, accent: C.green }
  const leaks = defenseLeaks(matchup, data?.games || []).map((l) => ({ ...l, key: `${l.team}|${l.role}` }))

  // 🔮 FITS THE WEEK'S PATTERN, HASN'T SCORED YET -- MOONSHOT's forward half:
  // players who haven't scored, whose game isn't over, standing on a
  // numerology lane that matches their game day. Ranked by how many lanes,
  // then TD score. A watch, not a prediction.
  const scored = new Set(scorers.map((s) => String(s.id)))
  const gameOf = (p) => (data?.games || []).find((g) => g.away === p.team || g.home === p.team) || null
  const nextUp = useMemo(() => players.filter((p) => p.position !== 'DEF' && !scored.has(String(p.player_id)))
    .map((p) => {
      const g = gameOf(p)
      if (!g || g.completed) return null
      const t = kickoffFor(data?.games, p)
      const date = Number.isFinite(t) ? easternDate(t) : null
      const a = fromNfl(p)
      const m = a && date ? matchLanes(a, { date }) : []
      const dayLanes = [...new Set(m.map((x) => x.label))].filter((l) => !/fibonacci/i.test(l))
      return dayLanes.length ? { key: String(p.player_id), p, name: p.name, when: g.state === 'in' ? 'now' : 'later', chips: dayLanes, td: Number(p.scores?.TD) || 0 } : null
    }).filter(Boolean)
    .sort((a, b) => (a.when === b.when ? 0 : a.when === 'now' ? -1 : 1) || b.chips.length - a.chips.length || b.td - a.td)
    .slice(0, 8), [players, scorers, data])   // eslint-disable-line react-hooks/exhaustive-deps

  // Touchdowns by position -- MOONSHOT's "homers by lineup spot".
  const POS = ['QB', 'RB', 'WR', 'TE']
  const byPos = POS.map((pos) => scorers.filter((s) => s.p?.position === pos).reduce((n, s) => n + s.td, 0))
  const totalTd = scorers.reduce((n, s) => n + s.td, 0)
  // every position at the top, not the first one indexOf finds (10-04: 'RBs lead with
  // 20' hid the WRs' 20)
  const topN = Math.max(...byPos)
  const leaders = POS.filter((_, i) => byPos[i] === topN).map((p) => `${p}s`)
  const leadWords = leaders.length > 1 ? `${leaders.slice(0, -1).join(', ')} and ${leaders[leaders.length - 1]}` : leaders[0]
  const lineSet = new Map(lines.map((l) => [l.id, l]))
  const roundSet = new Map(rounds.map((r) => [r.id, r]))
  const open = (p) => (p ? () => onPlayerClick?.(p) : null)
  const team = (t) => (onOpenTeam ? () => onOpenTeam(t) : null)

  // THE PAGE, AS DATA (BATCH-ONE-SITE step 1): the blocks above, unchanged, handed to
  // components/pages/LedgerPage -- which owns the layout and the one section order.
  return {
    head: { eyebrow: "TUDDY · WEEK IN NUMBERS", title: "The week in names and numbers", theme: C, numFont: NUM_FONT, accent: C.green, note: "The card's calls against who scored, round numbers, what lines up, the look-out, name echoes -- and the first touchdown of every game." },
    frame: { accent: C.green, header: <LedgerHead title="🧾 Touchdown ledger" count={totalTd} countWord="this week" note="builds as the week plays" accent={C.green} /> },
    sections: {
      empty: (!scorers.length && <div style={{ fontSize: 10.5, color: C.text3, marginBottom: 8 }}>No touchdowns graded yet this week — the ledger fills as games go final.</div>),
      round: (<RoundLine label="Round number this week:" accent={C.green}
          items={rounds.map((r) => ({ key: r.id, name: r.name, num: `${ord(r.mark)} TD`, onClick: open(r.p) }))} />),
      watch: (<WatchStrip label="This week's watchlist:" hits={landed} watched={calls.length}
          sentence={landed === 0 ? 'scored so far — the card’s touchdown calls, written before kickoff.' : 'scored, off the card’s touchdown calls written before kickoff.'}>
          {calls.filter((c) => c.td > 0).map((c) => (
            <span key={c.key}>{' · '}<b onClick={open(c.p) || undefined} style={{ color: C.text, cursor: c.p ? 'pointer' : 'default' }}>{c.name}</b><span style={{ color: C.text3, fontFamily: NUM_FONT }}> {c.td} TD</span></span>
          ))}
        </WatchStrip>),
      align: (<AlignBox accent={C.green} preview={8} title="🧲 Lining up with his game day" sub={`${lines.length} scorer${lines.length === 1 ? '' : 's'} on a numerology lane that matched the date he scored`}
          chips={lines.map((l) => ({ key: l.id, name: l.name, tags: l.chips.map((c) => ({ k: c, label: c })), onClick: open(l.p) }))}
          foot="Overlap, not evidence. A week of touchdowns spread over jersey numbers, birthdays and name numbers will line up with the date by arithmetic alone — the trend made visible, never a reason to chase one." />),
      lookout: (<LookOutBox accent={C.green} title="👀 The look-out — this week, before it happens" tag="lookups, not predictions"
          rows={[
            { key: 'def', label: 'Defenses to watch', hint: 'top-8 TD matchup by role', hintTitle: 'A defense ranks in the league’s eight softest against a role at touchdowns (the published defense table). A lookup, not a prediction.',
              chips: leaks.map((l) => ({ key: l.key, name: l.team, small: l.role, em: `#${l.td_rank}`, hot: Number(l.td_rank) <= 3, title: `#${l.td_rank} TD matchup · ${Number(l.td || 0).toFixed(0)} allowed`, onClick: team(l.team) })) },
            { key: 'needs', label: 'Who needs what', hint: 'one touchdown from a round number', hintTitle: 'A player one touchdown short of the next multiple of five. A counting fact, not a reason to expect a score.',
              chips: needs.slice(0, 12).map((r) => ({ key: r.key, name: r.name, small: r.team, em: `${r.now}→${r.next}`, onClick: open(r.p) })) },
          ]} />),
      names: (<NamePatterns homers={scorers.map((s) => ({ name: s.name }))} population={players.map((p) => ({ name: p.name }))} sport="nfl" />),
      nextUp: (<NextUpBox title="🔮 Fits the week's pattern, hasn't scored yet"
          rows={nextUp.map((x) => ({ key: x.key, when: x.when, name: x.name, chips: x.chips, title: `${x.chips.join(' · ')}. TD score ${x.td.toFixed(0)}.`, onClick: open(x.p) }))}
          about="Players who haven't scored this week, whose game isn't over, standing on a numerology lane that matches their game day — jersey, birthday or name number against the date. ⚡ means his game is live, ⏳ still to come. Ranked by how many lanes, then TD score. A watch, not a prediction — nothing here is graded, scored, or fed to a pick." />),
      scorers: (<ScorerChips sport="nfl" accent={C.green} preview={12} cards={scorers.map((s) => {
          const r = roundSet.get(s.id); const after = Number.isFinite(Number(s.p?.season_td)) ? Number(s.p.season_td) + s.td : null
          return {
            key: s.id, icon: '🏈', team: s.p?.team || null, name: s.name, times: s.td, milestone: Boolean(r), numHot: Boolean(r),
            num: after != null ? `${ord(after)} TD` : '—', spot: s.p?.position || null, onClick: open(s.p),
            title: `${s.name}${s.p?.team ? ` (${s.p.team})` : ''}${after != null ? ` — his ${ord(after)} touchdown of the season` : ''}${s.td > 1 ? ` (${s.td} this week)` : ''}.`,
            badges: lineSet.has(s.id) ? [{ k: 'al', label: lineSet.get(s.id).chips.length > 1 ? `${lineSet.get(s.id).chips.length} ALIGNS` : 'ALIGNS', color: C.green, title: lineSet.get(s.id).chips.join(' · ') }] : [],
          }
        })} />),
      spots: (<SpotBars accent={C.green} title="Touchdowns by position" bars={POS.map((pos, i) => ({ key: pos, label: pos, value: byPos[i], title: `${byPos[i]} touchdown${byPos[i] === 1 ? '' : 's'} this week by ${pos}s` }))}
          foot={totalTd ? <>{byPos.reduce((a, b) => a + b, 0)} of {totalTd} touchdowns by a QB, RB, WR or TE. {topN >= 3 && <>The <b style={{ color: C.text2 }}>{leadWords}</b> lead the week with {topN}{leaders.length > 1 ? ' each' : ''}.</>} One week is a picture, not a finding — texture, never a signal to chase.</> : null} />),
    },
    first: { ...P, sport: 'nfl', onOpenGame, onOpenPlayer: (id) => { const p = byId.get(String(id)); if (p) onPlayerClick?.(p) } },
  }
}
