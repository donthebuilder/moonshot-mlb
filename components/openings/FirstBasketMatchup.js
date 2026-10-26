'use client'
import { useMemo, useState } from 'react'
import { flatChip, FLAT_CHIP_CLASS } from '../../lib/chips'
import { useAvailable } from '../injuries/useAvailable'
import { JumpCircle, FirstRain, DotWall, OpeningCombo } from './OpeningViz'

// 🏁 THE FIRST-SCORE MATCHUP, SHARED (2026-10-25, Donovan: "the first basket things need like matchups and filter by games ... each
// game [its two clubs] against each other, and the [top] first basket target ... this should be shared when built"). One product's
// opening records (BUCKETS: lib/nba/openingsAgg.js via /api/buckets/openings) laid out per game:
//   ALL GAMES   the first-score targets across tonight: regular starters on tonight's clubs, ranked by how often they MADE the
//               game's first score, then how often they took the first attempt
//   ONE GAME    its two clubs side by side (tip, scores first, after winning the tip, the first stretch, the first period: the better
//               side lit), then that game's targets
// A product hands its words (`words`), its club rows (`rows` per stat), its player columns and its theme / table skin. Counts of what
// happened, never a chance: the top row is the best RECORD, not "most likely". Tonight's out / IL / doubtful men leave the targets
// (lib/injuries dropBlocked, the attack lists' rule). Tables lead; one chip row picks the game.

/**
 * games:   [{ key, away, home, label }]   tonight's games
 * teams:   Map(club -> its record row)
 * players: [player record rows], each with `team`, `gp`, `gs`
 * stats:   [{ key, label, fmt, higher: true|false|null, barOf? }]  the matchup rows (null = no side lit; barOf(club row) -> the number
 *          the bar pulls with when the row's own value is text, e.g. the jumper's tip win %)
 * targetCols, targetSort(a, b), minGp, Table, C, NUM_FONT, accent, words: { first, onOpenPlayer }
 */
export default function FirstBasketMatchup({ sport, games = [], teams, players = [], stats = [], targetCols = [], targetSort, minGp = 20, Table, C, NUM_FONT, accent, words, onOpenPlayer = null, onOpenTeam = null, faceOf = null }) {
  const [pick, setPick] = useState('all')
  const [look, setLook] = useState('combo')   // MOCK (10-25): the abstract views (./OpeningViz.js) vs the plain table, to compare
  const avail = useAvailable()
  const game = games.find((g) => g.key === pick) || null
  const clubs = useMemo(() => new Set(game ? [game.away, game.home] : games.flatMap((g) => [g.away, g.home])), [game, games])
  const targets = useMemo(() => avail(players.filter((p) => clubs.has(p.team) && p.gp >= minGp && (p.gs || 0) >= p.gp / 2), (p) => ({ player_id: p.playerId, name: p.name, team: p.team }))
    .slice().sort(targetSort).map((p, i) => ({ ...p, _id: p.playerId, rank: i + 1 })), [players, clubs, minGp, targetSort, avail])
  const versus = useMemo(() => {
    if (!game) return []
    const A = teams.get(game.away) || {}, H = teams.get(game.home) || {}
    return stats.map((s) => {
      const a = s.barOf ? s.barOf(A) : A[s.key], h = s.barOf ? s.barOf(H) : H[s.key]
      const better = s.higher == null || !Number.isFinite(a) || !Number.isFinite(h) || a === h ? null : (s.higher ? (a > h ? 'away' : 'home') : (a < h ? 'away' : 'home'))
      // keys clubA / clubB: a table skin reads 'home' / 'away' as its own venue fields
      // the tug of war: each side's pull is its share of the two; a lower-is-better row (points allowed) pulls with the OTHER side's
      // number, so the longer bar is always the better club
      const ok = Number.isFinite(a) && Number.isFinite(h) && a + h > 0
      const pullA = !ok ? null : (s.higher === false ? h / (a + h) : a / (a + h))
      return { _id: s.key, stat: s.label, clubA: s.fmt(A[s.key], A), clubB: s.fmt(H[s.key], H), better, pullA }
    })
  }, [game, teams, stats])
  const lit = (side) => (v, r) => <span style={{ fontWeight: r.better === side ? 900 : 600, color: r.better === side ? accent : C.text2 }}>{v}</span>
  const versusCols = game ? [
    { key: 'stat', label: 'Opening', group: 'Matchup', w: 150, sticky: true, bold: true, numeric: false, heat: false },
    { key: 'clubA', label: game.away, group: 'Matchup', w: 110, numeric: false, heat: false, fold: false, fmt: lit('away') },
    { key: 'clubB', label: `@ ${game.home}`, group: 'Matchup', w: 110, numeric: false, heat: false, fold: false, fmt: lit('home') },
  ] : []
  if (!games.length) return null
  return (
    <section aria-label={`${words.first} matchups`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
      <div style={{ color: C.text2, font: `900 12px/1.2 ${NUM_FONT}`, letterSpacing: '.08em' }}>{`${words.first.toUpperCase()} · BY GAME`}</div>
      <div role="group" aria-label="Game" className="chip-row" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '2px', margin: '0 -2px', WebkitOverflowScrolling: 'touch' }}>
        {[{ key: 'all', label: 'All games' }, ...games].map((g) => (
          <button key={g.key} type="button" className={FLAT_CHIP_CLASS} aria-pressed={pick === g.key} onClick={() => setPick(g.key)} style={{ ...flatChip(pick === g.key, accent, C, NUM_FONT), flexShrink: 0 }}>{g.label}</button>
        ))}
      </div>
      {game ? (
        <>
          <div role="group" aria-label="Look" className="chip-row" style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
            {[['combo', 'Combo'], ['circle', 'Circle'], ['rain', 'Rain'], ['wall', 'Wall'], ['table', 'Table']].map(([k, l]) => (
              <button key={k} type="button" className={FLAT_CHIP_CLASS} aria-pressed={look === k} onClick={() => setLook(k)} style={{ ...flatChip(look === k, accent, C, NUM_FONT), flexShrink: 0 }}>{l}</button>
            ))}
          </div>
          {look === 'table'
            ? <Table rows={versus} columns={versusCols} heatMode="none" maxRows={versus.length} maxHeight={9999} caption={`${game.away} against ${game.home}: each club's record in the games on file. The better side is lit.`} />
            : (() => {
              const V = { combo: OpeningCombo, circle: JumpCircle, rain: FirstRain, wall: DotWall }[look]
              const logs = { away: teams.get(game.away)?.log || [], home: teams.get(game.home)?.log || [] }
              return <V key={game.key} game={game} rows={versus} logs={logs} sport={sport} C={C} NUM_FONT={NUM_FONT} accent={accent} />
            })()}
        </>
      ) : null}
      <div style={{ color: C.text2, font: `900 12px/1.2 ${NUM_FONT}`, letterSpacing: '.08em', marginTop: 4 }}>{`${words.first.toUpperCase()} TARGETS · ${game ? game.label : 'TONIGHT'}`}</div>
      {targets.length
        ? <Table nameCell="player" faceOf={faceOf} rows={targets} columns={targetCols} heatMode="primary" maxRows={6} maxHeight={9999}
            onRowClick={onOpenPlayer ? (r) => onOpenPlayer((r?._raw ?? r).playerId) : undefined}
            caption={`Regular starters (${minGp}+ games) on ${game ? 'these two clubs' : 'tonight’s clubs'}, ranked by their ${words.first.toLowerCase()} record. Out tonight = left out. A record, not a chance.`} />
        : <div style={{ fontSize: 12, color: C.text3 }}>No regular starter with {minGp}+ games on file for {game ? 'these clubs' : 'tonight’s clubs'} yet.</div>}
    </section>
  )
}

