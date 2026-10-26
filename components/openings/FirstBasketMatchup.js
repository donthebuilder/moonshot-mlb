'use client'
import { useMemo, useState } from 'react'
import { flatChip, FLAT_CHIP_CLASS } from '../../lib/chips'
import { useAvailable } from '../injuries/useAvailable'
import { FaceWall } from './OpeningViz'
import { shotTypeWord } from '../../lib/openings/shotType'
import { useHidden, HiddenChips } from './hideClubs'

// [[word, share %, n]] -> "SG 67% · PF 33%" (top 3); '—' when empty
const sharesText = (list, sport, wordy) => (list?.length ? list.slice(0, 3).map(([k, p]) => `${wordy ? shotTypeWord(sport, k) || k : k} ${Number.isFinite(p) ? p.toFixed(0) : 0}%`).join(' · ') : '—')

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
 * lineups: { [game key]: { away: [ids], home: [ids], known } } -- who is STARTING tonight (/api/buckets/lineups). A game whose lineup
 *          is known keeps only those five a side when "Starters only" is on; a game whose lineup is not in yet says EXPECTED and keeps
 *          the club's regular starters (started half his games or more). null = no lineup read at all.
 * defense: true when the club rows carry `allows` ({ n, types, pos } shares of the first scores that club's defense gave up): adds
 *          the "who they allow to score first" table under the matchup of one game. The position column only draws when some club has one.
 * typeLabel: the defense table's type column ('BY SHOT' for basketball and hockey, 'BY TD TYPE' for football).
 * showTargets: false for a product with no player rows (LAMP, TUDDY): the matchup and the defense table, no targets list.
 * nameOfExtra: Map(player id -> name) for the face wall when `players` is empty; urlOf(id) the photo; wallWords the wall's marks' words.
 * Players hidden from the targets (the ✕ in each row) stay hidden on this device (./hideClubs.js) and come back from the chips above.
 */
export default function FirstBasketMatchup({ sport, floor = null, games = [], teams, players = [], stats = [], targetCols = [], targetSort, minGp = 20, Table, C, NUM_FONT, accent, words, onOpenPlayer = null, onOpenTeam = null, faceOf = null, lineups = null, defense = false, showTargets = true, typeLabel = 'BY SHOT', nameOfExtra = null, urlOf = null, wallWords = undefined }) {
  const [pick, setPick] = useState('all')
  const [startersOnly, setStartersOnly] = useState(true)
  const [look, setLook] = useState('faces')   // the face wall (./OpeningViz.js) or the plain table (Donovan 10-25: "faces and table")
  const avail = useAvailable()
  const hp = useHidden(`${sport}:players`)
  const nameOf = useMemo(() => new Map([...(nameOfExtra || []), ...players.map((p) => [String(p.playerId), p.name])]), [players, nameOfExtra])
  const game = games.find((g) => g.key === pick) || null
  const clubs = useMemo(() => new Set(game ? [game.away, game.home] : games.flatMap((g) => [g.away, g.home])), [game, games])
  // each club's confirmed five tonight (null until ESPN posts the lineup), and how many of the games shown have one
  const shown = useMemo(() => (game ? [game] : games), [game, games])
  const confirmed = useMemo(() => {
    const m = new Map()
    for (const g of shown) { const L = lineups?.[g.key]; if (L?.known) { m.set(g.away, new Set(L.away.map(String))); m.set(g.home, new Set(L.home.map(String))) } }
    return m
  }, [shown, lineups])
  const nKnown = shown.filter((g) => lineups?.[g.key]?.known).length
  const targets = useMemo(() => avail(players.filter((p) => clubs.has(p.team) && p.gp >= minGp && !hp.hidden.has(String(p.playerId))
    && (!startersOnly || (confirmed.has(p.team) ? confirmed.get(p.team).has(String(p.playerId)) : (p.gs || 0) >= p.gp / 2))), (p) => ({ player_id: p.playerId, name: p.name, team: p.team }))
    .slice().sort(targetSort).map((p, i) => ({ ...p, _id: p.playerId, rank: i + 1 })), [players, clubs, minGp, targetSort, avail, startersOnly, confirmed, hp.hidden])
  const lineupTag = !lineups ? null : game ? (nKnown ? 'Lineup confirmed' : 'Lineup expected') : (nKnown === shown.length ? 'Lineups confirmed' : nKnown ? `${nKnown} of ${shown.length} lineups confirmed` : 'Lineups expected')
  // WHO THEY ALLOW TO SCORE FIRST (the screenshot's "defense allows" block): each club's defense, by the position of the man who scored
  // the game's first basket on it and by the shot it was
  const defRows = useMemo(() => (defense && game ? [game.away, game.home].map((c) => {
    const A = teams.get(c)?.allows
    return { _id: c, club: c, n: A?.n || 0, pos: sharesText(A?.pos, sport, false), type: sharesText(A?.types, sport, true) }
  }) : []), [defense, game, teams, sport])
  const versus = useMemo(() => {
    if (!game) return []
    const A = teams.get(game.away) || {}, H = teams.get(game.home) || {}
    return stats.map((s) => {
      const a = s.barOf ? s.barOf(A) : A[s.key], h = s.barOf ? s.barOf(H) : H[s.key]
      const better = s.higher == null || !Number.isFinite(a) || !Number.isFinite(h) || a === h ? null : (s.higher ? (a > h ? 'away' : 'home') : (a < h ? 'away' : 'home'))
      // keys clubA / clubB: a table skin reads 'home' / 'away' as its own venue fields
      return { _id: s.key, stat: s.label, clubA: s.fmt(A[s.key], A), clubB: s.fmt(H[s.key], H), better }
    })
  }, [game, teams, stats])
  const lit = (side) => (v, r) => <span style={{ fontWeight: r.better === side ? 900 : 600, color: r.better === side ? accent : C.text2 }}>{v}</span>
  const versusCols = game ? [
    { key: 'stat', label: 'Opening', group: 'Matchup', w: 150, sticky: true, bold: true, numeric: false, heat: false },
    { key: 'clubA', label: game.away, group: 'Matchup', w: 110, numeric: false, heat: false, fold: false, fmt: lit('away') },
    { key: 'clubB', label: `@ ${game.home}`, group: 'Matchup', w: 110, numeric: false, heat: false, fold: false, fmt: lit('home') },
  ] : []
  // the ✕ in each target row (44 px wide, the row's full height): hide this man on this device
  const hideCol = { key: 'playerId', label: '', group: 'Hide', w: 44, heat: false, numeric: false, fold: false, title: 'Hide this player',
    fmt: (v, r) => <button type="button" aria-label={`Hide ${r.name}`} onClick={(e) => { e.stopPropagation(); hp.toggle(r.playerId) }} style={{ minWidth: 44, minHeight: 44, background: 'transparent', border: 'none', color: C.text3, font: `700 14px/1 ${NUM_FONT}`, cursor: 'pointer' }}>✕</button> }
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
            {[['faces', 'Faces'], ['table', 'Table']].map(([k, l]) => (
              <button key={k} type="button" className={FLAT_CHIP_CLASS} aria-pressed={look === k} onClick={() => setLook(k)} style={{ ...flatChip(look === k, accent, C, NUM_FONT), flexShrink: 0 }}>{l}</button>
            ))}
          </div>
          {look === 'table'
            ? <Table rows={versus} columns={versusCols} heatMode="none" maxRows={versus.length} maxHeight={9999} caption={`${game.away} against ${game.home}: each club's record in the games on file. The better side is lit.`} />
            : <FaceWall key={game.key} game={game} rows={versus} logs={{ away: teams.get(game.away)?.log || [], home: teams.get(game.home)?.log || [] }}
                nameOf={nameOf} sport={sport} C={C} NUM_FONT={NUM_FONT} accent={accent} floor={floor} urlOf={urlOf} words={wallWords} />}
        </>
      ) : null}
      {showTargets ? (
        <>
      <div style={{ color: C.text2, font: `900 12px/1.2 ${NUM_FONT}`, letterSpacing: '.08em', marginTop: 4 }}>{`${words.first.toUpperCase()} TARGETS · ${game ? game.label : 'TONIGHT'}`}</div>
      {lineups ? (
        <div role="group" aria-label="Lineup" className="chip-row" style={{ display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto' }}>
          <button type="button" className={FLAT_CHIP_CLASS} aria-pressed={startersOnly} onClick={() => setStartersOnly((v) => !v)} style={{ ...flatChip(startersOnly, accent, C, NUM_FONT), flexShrink: 0 }}>Starters only</button>
          <span style={{ font: `700 11px/1.2 ${NUM_FONT}`, color: nKnown ? accent : C.text3, whiteSpace: 'nowrap' }}>{lineupTag}</span>
        </div>
      ) : null}
      <HiddenChips h={hp} ids={new Set(players.map((p) => String(p.playerId)))} label={(id) => nameOf.get(id) || id} C={C} NUM_FONT={NUM_FONT} accent={accent} />
      {targets.length
        ? <Table nameCell="player" faceOf={faceOf} rows={targets} columns={[...targetCols, hideCol]} heatMode="primary" maxRows={6} maxHeight={9999}
            onRowClick={onOpenPlayer ? (r) => onOpenPlayer((r?._raw ?? r).playerId) : undefined}
            caption={`Regular starters (${minGp}+ games) on ${game ? 'these two clubs' : 'tonight’s clubs'}, ranked by their ${words.first.toLowerCase()} record. Out tonight = left out. A record, not a chance.`} />
        : <div style={{ fontSize: 12, color: C.text3 }}>No regular starter with {minGp}+ games on file for {game ? 'these clubs' : 'tonight’s clubs'} yet.</div>}
        </>
      ) : null}
      {defRows.some((r) => r.n > 0) ? (
        <>
          <div style={{ color: C.text2, font: `900 12px/1.2 ${NUM_FONT}`, letterSpacing: '.08em', marginTop: 4 }}>DEFENSE · WHAT THEY ALLOW ON THE FIRST SCORE</div>
          <Table rows={defRows} heatMode="none" maxRows={2} maxHeight={9999}
            columns={[
              { key: 'club', label: 'Defense', group: 'Allows', w: 70, sticky: true, bold: true, numeric: false, heat: false, mono: true, teamMark: sport, link: onOpenTeam ? (r) => () => onOpenTeam(r.club) : undefined },
              { key: 'n', label: 'GAMES', group: 'Allows', w: 56, heat: false, title: 'Games the other side scored first on them' },
              ...(defRows.some((r) => r.pos !== '—') ? [{ key: 'pos', label: 'BY POSITION', group: 'Allows', w: 190, numeric: false, heat: false, fold: false, title: 'Position of the man who scored the first basket on them' }] : []),
              { key: 'type', label: typeLabel, group: 'Allows', w: 230, numeric: false, heat: false, fold: false, title: 'What the first score on them was' },
            ]}
            caption="Each defense's share of the first scores it gave up, by the scorer's position and by type. A record of what happened, not a chance." />
        </>
      ) : null}
    </section>
  )
}

