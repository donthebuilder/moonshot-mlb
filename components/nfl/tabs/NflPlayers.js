'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT, MARKETS } from '../../../lib/nfl/theme'
import { oppLabel } from '../../../lib/nfl/oppLabel'
import { hashParams } from '../../../lib/urlState'
import { SportTheme } from '../../SportTheme'
import { FilterSelect } from '../../Filters'
import PlayerBoardFrame from '../../players/PlayerBoardFrame'
import NflPlayerModal from '../NflPlayerModal'
import { useRosterExtras } from '../../../lib/nfl/useRosterExtras'

// 🏈 PLAYERS, MOONSHOT'S PAGE (2026-09-30, Donovan: "the mlb players page is
// the base i like that, use those components"; header refreshed 2026-10-06).
// The Players tab is MOONSHOT's PlayerBoard layout (components/players/
// PlayerBoardFrame.js, shared with LAMP): search, question chips + 🎲, the ranked
// list with a score chip, and the player's CARD inline on the right -- the same
// card the boards open (NflPlayerModal, on MOONSHOT's CardShell / VerdictHero /
// StatStrip / the Read), rendered `inline`. The old hand-built "TUDDY player file"
// is gone; page and card are one thing, like MLB.
//
// The list: every rostered player (the week's scored rows first, team defenses
// next, then the rest of the rosters from nfl_roster.json via useRosterExtras,
// unscored and said so on the card), the team filter in the address (team=, from
// Standings / Games / Matchups), and the pick in the address (player=, owned by
// the frame).
// A `player=` nobody in the list has: the NO SUCH PLAYER notice below, and NO card
// -- the frame no longer falls back to the first row for an unknown id (2026-10-06).

const bestOf = (p) => {
  let best = null
  for (const [k] of MARKETS) {
    const v = Number(p?.scores?.[k])
    if (Number.isFinite(v) && (!best || v > best[1])) best = [k, v]
  }
  return best
}
const tier = (p) => (p.roster_only ? 2 : p.position === 'DEF' ? 1 : bestOf(p) ? 0 : 2)

export default function NflPlayers({ data, logs, matchup, picks, results, odds = null, initialTeam = null }) {
  const rated = data?.players || []
  const extras = useRosterExtras(rated)
  const all = useMemo(() => (extras.length ? [...rated, ...extras] : rated), [rated, extras])

  const [team, setTeamRaw] = useState(() => initialTeam || (typeof window === 'undefined' ? 'all' : hashParams().get('team')) || 'all')
  const setTeam = (t) => {
    setTeamRaw(t)
    try {
      const h = hashParams()
      if (t && t !== 'all') h.set('team', t); else h.delete('team')
      window.history.replaceState(null, '', `#${h.toString()}`)
    } catch { /* ignore */ }
  }
  useEffect(() => { if (initialTeam) setTeam(initialTeam) }, [initialTeam]) // eslint-disable-line react-hooks/exhaustive-deps
  // BACK FOLLOWS THE FILTER (0g B3, 2026-10-01): team= was read once, so Back
  // from players&team=KC to players left KC on screen.
  useEffect(() => {
    const sync = () => setTeamRaw(hashParams().get('team') || 'all')
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => { window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync) }
  }, [])

  const onCard = useMemo(() => {
    const m = new Map()
    Object.values(picks?.card || {}).forEach((b) => (b.rungs || []).forEach((r) => { if (!m.has(String(r.player_id))) m.set(String(r.player_id), `#${r.rank} ${b.label || b.key}`) }))
    return m
  }, [picks])

  const rows = useMemo(() => all
    .filter((p) => team === 'all' || p.team === team)
    .sort((a, b) => (tier(a) - tier(b)) || ((bestOf(b)?.[1] ?? -1) - (bestOf(a)?.[1] ?? -1)) || String(a.name).localeCompare(String(b.name))),
  [all, team])

  const teams = useMemo(() => {
    const counts = {}
    for (const p of all) if (p.team) counts[p.team] = (counts[p.team] || 0) + 1
    return [{ key: 'all', label: `All teams (${all.length})` }, ...Object.keys(counts).sort().map((k) => ({ key: k, label: `${k} (${counts[k]})` }))]
  }, [all])

  const asks = [
    { key: 'card', label: '🤖 On the card', test: (p) => onCard.has(String(p.player_id)), why: 'On one of TUDDY’s market cards this week' },
    ...['QB', 'RB', 'WR', 'TE'].map((pos) => ({ key: pos, label: pos, test: (p) => p.position === pos, why: `${pos}s only` })),
    { key: 'q', label: '🩹 Questionable', test: (p) => Boolean(p.questionable), why: 'Listed questionable this week' },
  ]

  // A link to someone who is in nobody's file: say so, rather than open a stranger.
  const wanted = typeof window === 'undefined' ? null : hashParams().get('player')
  const missing = wanted && all.length && !all.some((p) => String(p.player_id) === String(wanted))
  const notice = missing ? (
    <div role="status" style={{ margin: '0 0 10px', padding: '10px 12px', border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.yellow}`, borderRadius: 10, background: C.bg2, fontSize: 12, color: C.text2, lineHeight: 1.5 }}>
      <b style={{ color: C.text, letterSpacing: '.06em', fontSize: 10 }}>NO SUCH PLAYER</b> -- <b style={{ color: C.text, fontFamily: NUM_FONT }}>{String(wanted).slice(0, 24)}</b> isn&apos;t in this week&apos;s file. Pick anyone from the list.
    </div>
  ) : null

  if (!all.length) return <div style={{ padding: 20, color: C.text3, fontSize: 12, textAlign: 'center' }}>The player directory publishes with the NFL slate.</div>

  return (
    <SportTheme theme={C} accent={C.green} numFont={NUM_FONT}>
      <PlayerBoardFrame
        rows={rows}
        idOf={(p) => String(p.player_id)}
        urlIdOf={(p) => String(p.player_id)}
        nameOf={(p) => p.name}
        searchText={(p) => `${p.name} ${p.team} ${p.opp || ''} ${p.position}`}
        badgesOf={(p) => (<>
          {onCard.has(String(p.player_id)) && <span title={`On TUDDY’s card: ${onCard.get(String(p.player_id))}`} style={{ fontSize: 9, marginLeft: 4 }}>🤖</span>}
          {p.questionable && <span title="Questionable" style={{ fontSize: 9, marginLeft: 3, color: C.yellow, fontWeight: 900 }}>Q</span>}
        </>)}
        metaOf={(p) => (p.roster_only
          ? <>{p.team} · {p.position} · {p.roster_status || 'roster'}</>
          : <>{p.team} {oppLabel(p)} · {p.position}</>)}
        scoreOf={(p) => bestOf(p)?.[1] ?? null}
        scoreTitle={(p) => { const b = bestOf(p); return b ? `Best market: ${(MARKETS.find(([k]) => k === b[0]) || [])[1] || b[0]} ${b[1].toFixed(1)}` : 'Not scored this week' }}
        asks={asks}
        placeholder="Search a player or team…"
        noun="player"
        nounPlural="players"
        notice={notice}
        sideTop={(
          <div style={{ marginBottom: 6 }}>
            <FilterSelect label="Team" value={team} options={teams} onChange={setTeam} />
          </div>
        )}
        renderDetail={(p) => (
          <NflPlayerModal
            inline
            player={p}
            market={bestOf(p)?.[0] || 'TD'}
            markets={data?.markets}
            splitMeta={{ pairs: data?.split_pairs, labels: data?.split_labels }}
            logs={logs}
            matchup={matchup}
            slate={data}
            picks={picks}
            results={results}
            odds={odds}
          />
        )}
      />
    </SportTheme>
  )
}
