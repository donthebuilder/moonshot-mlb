'use client'
import NflNote from '../NflNote'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../../lib/nfl/theme'
import { injuryTag, injuryTitle, injuryColor } from '../../../lib/nfl/injury'
import PageHeader from '../../PageHeader'
import LeaderTile from '../../LeaderTile'
import NflTeamMark from '../NflTeamMark'
import { TeamTap } from '../../EntityTap'
import NflTable from '../NflTable'
import { withNflFullSet } from '../../../lib/nfl/boardColumns'
import { SportTheme } from '../../SportTheme'
import { LeadersIntro, LeadersFilterBar, LeadersLead } from '../../leaders/LeadersParts'

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
// THE MODEL SCORES ARE COLUMNS, NOT TILES (Donovan, 2026-10-06).
// MOONSHOT's own Leaders dropped HR score and the rest from its TILES, and the
// tiles here stay measured per-game rates straight off `player.stats`. But
// every slate-player table on the site carries the full column set
// (lib/nfl/boardColumns.js), so the table under the tiles does too: the stats
// first, then the model's scores and the season columns, grouped. The tile
// leaders and the sort lenses are still the measured rates only.
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

// MOONSHOT'S PAGE, NOT ONLY ITS TILE (2026-09-29, Donovan: "make sure the
// leaders page for nfl and nhl look like mlb"). Same order as MOONSHOT's
// Leaders (components/tabs/Leaders.js): title with the count, the ruled intro,
// the tiles, then MOONSHOT's filter bar (sample, position, lens, search) over
// the full table of every published stat, sorted by the lens. Stats lead, the scores follow as columns (10-06) --
// the model's scores stay on Research, the same line MOONSHOT draws.
// Low-sample rows are the payload's own low_sample flag (TUDDY has no games
// count to set a minimum by), hidden until asked for, the way MOONSHOT's
// Min PA hides a 30-PA .400.
const LENSES = [
  ['TD', '🏈 Touchdowns'], ['RECYD', '🙌 Receiving'], ['TGT%', '🎯 Targets'],
  ['RUYD', '🏃 Rushing'], ['PAYD', '🚀 Passing'], ['RZ', '🔴 Red zone'], ['FGM', '🦵 Kicking'],
]
const SAMPLES = [['full', 'Full'], ['any', 'Any']]
// SIX TILES, MOONSHOT'S COUNT. Every category is a column in the table below;
// only these lead as tiles, because 23 tiles was ~2,800px of phone before the
// first row of the table.
const TILE_KEYS = ['TD', 'RECYD', 'RUYD', 'PAYD', 'TGT%', 'RZ']

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
      <TeamTap abbr={top._raw.team}><NflTeamMark abbr={top._raw.team} style={{ verticalAlign: 'middle' }} /></TeamTap> · {top._raw.position}
      {tag && <b title={injuryTitle(tag)} style={{ color: injuryColor(tag, C), marginLeft: 5 }}>{tag}</b>}
    </>
  )
}

const facing = (top) => (top._raw?.opp
  ? { text: `this week vs ${top._raw.opp}`, title: `This week: ${top._raw.team} vs ${top._raw.opp}` }
  : null)

// THE GROUP ROW (2026-10-01, BATCH-TABLE-SKIN-V2; the v2 skin only): the
// stat families FAMILY already colours, named. A column with no group rides
// with the one before it, so Tm / Opp / Pos stay with the player.
const FAMILY_GROUP = {
  who: { key: 'who', label: 'Player', order: 0 }, cyan: { key: 'rec', label: 'Receiving', order: 1 },
  orange: { key: 'rush', label: 'Rushing', order: 2 }, green: { key: 'score', label: 'Scoring', order: 3 },
  purple: { key: 'pass', label: 'Passing', order: 4 }, yellow: { key: 'kick', label: 'Kicking', order: 5 },
  other: { key: 'other', label: 'More', order: 6 },
}

export default function Leaders({ data, onPlayerClick }) {
  const [pos, setPos] = useState('ALL')
  const [sample, setSample] = useState('full')
  const [lens, setLens] = useState('TD')
  const [query, setQuery] = useState('')

  const cols = data?.research_columns || []
  const players = data?.players || []

  // Everyone the week can rank: not on bye (he is not leading anything this
  // week), in the position asked for.
  const pool = useMemo(() => players.filter((p) => {
    if (p?.on_bye) return false
    if (pos !== 'ALL' && p?.position !== pos) return false
    return true
  }), [players, pos])

  const cards = useMemo(() => {
    const out = []
    for (const col of cols) {
      const rows = pool
        .map((p) => ({ _key: p.player_id, name: p.name, _raw: p, v: Number(p?.stats?.[col.key]) }))
        .filter((r) => Number.isFinite(r.v) && r.v !== 0)
        .sort((a, b) => b.v - a.v)
      // A card has to be a leaderboard, not a shortlist. See the header note
      // about SEP / YACOE / RYOE, which no player carries at all.
      if (rows.length >= MIN_QUALIFIED) out.push({ col, rows: rows.slice(0, 3), n: rows.length })
    }
    return out
  }, [pool, cols])

  const dropped = cols.length - cards.length

  // The table: every category that has a board, as a column. A pct column is a
  // rate in the payload (0.37), so it is carried as a percentage here and dp
  // formats it, the way Research does.
  const columns = useMemo(() => [
    { group: FAMILY_GROUP.who, key: 'name', label: 'Player', heat: false, w: 150, bold: true, sticky: true },
    { key: 'team', label: 'Tm', heat: false, w: 34, mono: true, dim: true, teamMark: 'nfl' },
    { key: 'opp', label: 'Opp', heat: false, w: 38, mono: true, dim: true },
    { key: 'pos', label: 'Pos', heat: false, w: 34, mono: true, dim: true },
    ...cards.map(({ col }) => ({
      group: FAMILY_GROUP[FAMILY[col.key]] || FAMILY_GROUP.other,
      key: col.key, label: col.label, w: 56, dp: col.dp ?? 2,
      title: col.desc ? `${col.desc}${col.pct ? ' (a share, as a percentage)' : ''}` : undefined,
    })),
  ], [cards])

  const all = useMemo(() => pool.map((p) => {
    const row = { _key: p.player_id, _raw: p, name: p.name, team: p.team, opp: p.opp || '', pos: p.position }
    for (const { col } of cards) {
      const v = Number(p?.stats?.[col.key])
      row[col.key] = Number.isFinite(v) ? (col.pct ? v * 100 : v) : null
    }
    return row
  }), [pool, cards])

  const rows = useMemo(() => {
    const q = query.toLowerCase().trim()
    return all
      .filter((r) => sample === 'any' || !r._raw?.low_sample)
      .filter((r) => !q || `${r.name} ${r.team} ${r.opp}`.toLowerCase().includes(q))
  }, [all, sample, query])

  // A lens whose stat has no board this week (kickers filtered out, say)
  // falls back to the first column that does, rather than an unsorted table.
  const lenses = LENSES.filter(([k]) => cards.some((c) => c.col.key === k))
  const sortKey = lenses.some(([k]) => k === lens) ? lens : (lenses[0]?.[0] || cards[0]?.col.key || 'name')

  return (
    <SportTheme theme={C} accent={C.green} numFont={NUM_FONT}>
      <div>
        <PageHeader
          title="League Leaders"
          note={<NflNote tab="leaders" />}
          right={(
            <span title="Players on this week's slate the table is showing, out of everyone not on bye at this position."
              style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{rows.length} of {all.length} players</span>
          )}
          theme={C}
          numFont={NUM_FONT}
        />

        {cards.length === 0 ? (
          <div style={{
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: 18, fontSize: TYPE.body, color: C.text2, marginBottom: 12,
          }}>
            Nothing to rank at {pos} on this slate yet.
          </div>
        ) : (
          <>
            {dropped > 0 && <LeadersLead>
              {dropped} categor{dropped === 1 ? 'y' : 'ies'} we don&apos;t carry yet {dropped === 1 ? 'is' : 'are'} left out rather than shown empty.
            </LeadersLead>}
            <div className="bot-picks-grid" style={{
              display: 'grid', gap: 8, marginBottom: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            }}>
              {TILE_KEYS.map((k) => cards.find((c) => c.col.key === k)).filter(Boolean).map(({ col, rows: top }) => (
                <LeaderTile key={col.key} label={col.desc || col.label} rows={top}
                  fmt={(r) => fmt(r.v, col.dp, col.pct)} color={C[FAMILY[col.key] || 'green']}
                  meta={meta} facing={facing} onPlayerClick={onPlayerClick}
                  theme={C} numFont={NUM_FONT} />
              ))}
            </div>
          </>
        )}

        <LeadersFilterBar
          groups={[
            { label: 'Sample', value: sample, onChange: setSample, options: SAMPLES },
            { label: 'Pos', value: pos, onChange: setPos, options: POSITIONS.map((k) => [k, k === 'ALL' ? 'All' : k]), wrap: true },
            { label: 'Lens', value: sortKey, onChange: setLens, options: lenses, wrap: true },
          ]}
          search={{ value: query, onChange: setQuery, placeholder: 'Search a player…' }}
        />

        {!rows.length ? (
          <div style={{ fontSize: TYPE.body, color: C.text3, padding: '10px 2px' }}>
            Nobody matches this filter{sample === 'full' ? ' with a full sample — try Sample: Any' : ''}.
          </div>
        ) : (
          <NflTable
            heatMode="sorted"
            key={sortKey}
            {...withNflFullSet(rows, columns)}
            onRowClick={onPlayerClick}
            initialSort={sortKey}
            maxHeight={620}
            caption={`Per-game rates over the trailing window the slate publishes, players on bye excluded. Sample: Full hides the rows the payload flags low-sample, because a rate on one or two games belongs to nobody. A category needs ${MIN_QUALIFIED} players with a number to get a tile and a column; one the payload doesn't carry is left out rather than shown empty.`}
          />
        )}
      </div>
    </SportTheme>
  )
}
