'use client'
import { C, NUM_FONT } from '../lib/theme'
import { SPORT_ACCENT } from '../lib/sportAccent'
import { nameOf, teamOf } from '../lib/player'
import DenseTable from './DenseTable'
import TeamMark from './TeamMark'
import Tap from './Tap'
import { TeamTap } from './EntityTap'

// ONE LEG, AS A LINK: the club's logo (a link to the club) and his name (a link
// to him). Shared by the pair block and the pools table, so a leg looks and
// taps the same everywhere. No handler -> the plain text, never a dead button.
export function LegCell({ player, sport = 'mlb', onOpen = null, hit = false, voided = false }) {
  const name = nameOf(player)
  const team = String(teamOf(player) || '').toUpperCase()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, opacity: voided ? 0.55 : 1 }}>
      {team && <TeamTap abbr={team}><TeamMark sport={sport} abbr={team} variant="logo" px={18} /></TeamTap>}
      <Tap onClick={onOpen ? () => onOpen(player) : null}
        style={{ fontWeight: hit ? 800 : 700, color: hit ? C.green : 'inherit', textDecoration: voided ? 'line-through' : 'none', whiteSpace: 'nowrap' }}>
        {hit ? '💥 ' : ''}{name}
      </Tap>
    </span>
  )
}

// THE PAIR BLOCK (props: pairs, accent, labels) -- built so NHL (goals) and NFL
// (touchdowns) can drop their own pairs in later. `pairs` is lib/pairRank
// bestPairs()'s shape: { key, players: [a, b], score, risk }. `labels` carries
// the sport's words: title, sub, unit ('home run'), scoreHead.
export default function PairBlock({ pairs = [], accent = SPORT_ACCENT.mlb, sport = 'mlb', labels = {}, onPlayerClick = null, resolve = null }) {
  if (!pairs.length) return null
  const L = { title: 'Five best pairs', sub: 'ranked by the pair’s own score', scoreHead: 'Score', ...labels }
  const open = onPlayerClick ? (p) => onPlayerClick((resolve && resolve(p)) || p) : null
  const rows = pairs.map((p, i) => ({
    _key: p.key, rank: i + 1,
    a: nameOf(p.players[0]), b: nameOf(p.players[1]),
    score: p.score, risk: p.risk || '—',
    _a: p.players[0], _b: p.players[1],
  }))
  // both legs in ONE pinned cell, stacked: on a phone only the pinned column is
  // in view, and a pair is two names -- neither may hide behind a sideways scroll
  const pairCell = (_v, r) => (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, padding: '3px 0' }}>
      <LegCell player={r._a} sport={sport} onOpen={open} />
      <LegCell player={r._b} sport={sport} onOpen={open} />
    </span>
  )
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: C.text3, fontFamily: NUM_FONT }}>{L.sub}</span>
      </div>
      <DenseTable
        rows={rows}
        accent={accent}
        title={L.title}
        bare
        initialSort={{ key: 'rank', dir: 'asc' }}
        maxHeight={9999}
        columns={[
          { key: 'rank', label: '#', group: 'Pair', heat: false, w: 30, rankCol: true },
          { key: 'a', label: 'Pair', group: 'Pair', heat: false, sticky: true, w: 176, fmt: pairCell },
          { key: 'score', label: L.scoreHead, group: 'Rank', w: 60, dp: 1, title: 'MOONSHOT’s own pair score. Rank only; not a probability.' },
          { key: 'risk', label: 'Risk', group: 'Rank', heat: false, w: 64, dim: true },
        ]}
      />
    </div>
  )
}
