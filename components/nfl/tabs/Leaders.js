'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../../lib/nfl/theme'
import { injuryTag, injuryTitle, injuryColor } from '../../../lib/nfl/injury'
import PageHeader from '../../PageHeader'
import LeaderTile from '../../LeaderTile'
import NflTeamMark from '../NflTeamMark'
import { PillRow } from '../../Filters'

// 🏆 LEADERS — who is actually first, per category.
//
// Requested secondhand through Donovan on 2026-08-23: "someone asked about
// fantasy points and players on the football side... maybe like a pick helper,
// or like they said, top player each category. i'm thinking it can be like a
// chart-based or power ranking system." It stayed unbuilt for two weeks.
//
// WHY THIS IS NOT THE RESEARCH TAB AGAIN.
// Research is the dense sortable table: every player, every column, sorted by
// whatever you click. It answers "show me the field". This answers "who is
// first", which is a different question and a worse fit for a 300-row grid —
// you have to sort, then read, then sort again to compare two categories.
// Here every category is already sorted and they sit side by side.
//
// WHY THERE ARE NO MODEL SCORES ON THIS PAGE.
// The same call MOONSHOT's own Leaders.js made when it dropped HR score, HRR
// score and the rest: "those all belong to the model, and every other board on
// this site already shows them — which made Leaders a fifth copy of the same
// ranking rather than a page of its own." Every number here is a measured
// per-game rate off `player.stats`, straight from the payload. If one disagrees
// with a stat sheet, the payload is wrong; there is no interpretation layer
// left to blame.
//
// CATEGORIES COME FROM THE PAYLOAD, NOT FROM A LIST IN HERE.
// `research_columns` already carries the key, label, description, decimal
// places and percent flag for all 23 of them. Hard-coding a second copy is how
// the two drift.
//
// AND A CATEGORY NOBODY HAS DATA FOR IS NOT SHOWN. On the live Week 1 payload
// SEP, YACOE and RYOE are carried by ZERO of 529 players — the NGS columns
// aren't published. Rendering them would be three cards reading "—", which is
// the same mistake the player modal's props grid was making with its all-zero
// rows. A card has to have at least MIN_QUALIFIED players to exist.

// MOONSHOT'S TILE (2026-09-29, queue batch 9). Each category is MOONSHOT's
// Leaders tile now (components/LeaderTile.js): the leader, his value, team and
// position, who he plays this week, and #2 and #3. It replaced a card that
// drew a bar behind every row -- a plain bar chart, and three to eight rows a
// card, which on a phone was ~3,400px of page. The tile's label is the stat's
// own plain-words description from the payload, so the meaning is on the
// screen rather than in a hover.

const MIN_QUALIFIED = 5      // fewer than this and the "leaderboard" is a list

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K']

// One colour per family of stat, so a glance down the grid reads as groups.
const FAMILY = {
  'TGT%': 'cyan', WOPR: 'cyan', TGT: 'cyan', REC: 'cyan', RECYD: 'cyan', AIRYD: 'cyan', '20+': 'cyan', SEP: 'cyan', YACOE: 'cyan',
  CAR: 'orange', RUYD: 'orange', RYOE: 'orange',
  RZ: 'green', GL: 'green', xTD: 'green', TD: 'green', TDoE: 'green',
  PAYD: 'purple', PATD: 'purple', ATT: 'purple', CPOE: 'purple',
  FGM: 'yellow', PAT: 'yellow',
}

// A `pct` column is stored as a RATE, not a percentage — target share arrives
// as 0.37, not 37. Research.js:89 multiplies by 100 on the way out; this has to
// do the same or the whole TGT% card reads "0.4%" for the league leader.
const fmt = (v, dp, pct) => {
  if (!Number.isFinite(v)) return '—'
  return pct ? `${(v * 100).toFixed(dp ?? 1)}%` : v.toFixed(dp ?? 2)
}

function meta(top) {
  const tag = injuryTag(top._raw)
  return (
    <>
      <NflTeamMark abbr={top._raw.team} style={{ verticalAlign: 'middle' }} /> · {top._raw.position}
      {tag && <b title={injuryTitle(tag)} style={{ color: injuryColor(tag, C), marginLeft: 5 }}>{tag}</b>}
    </>
  )
}

const facing = (top) => (top._raw?.opp
  ? { text: `this week vs ${top._raw.opp}`, title: `This week: ${top._raw.team} vs ${top._raw.opp}` }
  : null)

export default function Leaders({ data, onPlayerClick }) {
  const [pos, setPos] = useState('ALL')

  const cols = data?.research_columns || []
  const players = data?.players || []

  const cards = useMemo(() => {
    const pool = players.filter((p) => {
      if (p?.on_bye) return false          // he is not leading anything this week
      if (pos !== 'ALL' && p?.position !== pos) return false
      return true
    })
    const out = []
    for (const col of cols) {
      const rows = pool
        .map((p) => ({ _key: p.player_id, name: p.name, _raw: p, v: Number(p?.stats?.[col.key]) }))
        .filter((r) => Number.isFinite(r.v) && r.v !== 0)
        .sort((a, b) => b.v - a.v)
      // A card has to be a leaderboard, not a shortlist. See the header note
      // about SEP / YACOE / RYOE, which no player carries at all.
      if (rows.length >= MIN_QUALIFIED) out.push({ col, rows: rows.slice(0, 3) })
    }
    return out
  }, [players, cols, pos])

  const dropped = cols.length - cards.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader
        eyebrow="TUDDY · LEADERS"
        title="Who is first, and by how much"
        note="Measured per-game rates from the slate — no model score anywhere on this page. Tap a name to open his card."
        theme={C}
        numFont={NUM_FONT}
      />

      <PillRow
        value={pos}
        onChange={setPos}
        options={POSITIONS.map((k) => ({ key: k, label: k }))}
        hint={`${cards.length} categor${cards.length === 1 ? 'y' : 'ies'}${dropped > 0 ? ` · ${dropped} hidden for want of data` : ''}`}
      />

      {cards.length === 0 ? (
        <div style={{
          background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: 18, fontSize: TYPE.body, color: C.text2,
        }}>
          Nothing to rank at {pos} on this slate yet.
        </div>
      ) : (
        <div className="bot-picks-grid" style={{
          display: 'grid', gap: 8,
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        }}>
          {cards.map(({ col, rows }) => (
            <LeaderTile key={col.key} label={col.desc || col.label} rows={rows}
              fmt={(r) => fmt(r.v, col.dp, col.pct)} color={C[FAMILY[col.key] || 'green']}
              meta={meta} facing={facing} onPlayerClick={onPlayerClick}
              theme={C} numFont={NUM_FONT} />
          ))}
        </div>
      )}

      <p style={{ fontSize: TYPE.micro, color: C.text3, lineHeight: 1.6, margin: '2px 2px 0' }}>
        Per-game rates over the trailing window the slate publishes, players on bye excluded.
        A category needs {MIN_QUALIFIED} qualified players to appear at all; one the payload
        doesn&apos;t carry is left out rather than shown empty.
      </p>
    </div>
  )
}
