'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { groupPitchers } from '../../lib/data'
import { n, clean } from '../../lib/player'
import { pitcherOverall } from '../../lib/scoring_additions'
import { PanelTitle, Empty, Chip, btnStyle } from '../ui'
import DenseTable from '../DenseTable'
import PitcherSpots from '../PitcherSpots'
import PitcherProfile from '../PitcherProfile'
import PitcherModal from '../PitcherModal'

const SORTS = [
  ['weak', 'Most Weak Spots'],
  ['hr9', 'Highest HR/9'],
  ['whip', 'Highest WHIP'],
  ['time', 'Game Time'],
]

function sortPitchers(pitchers, sortKey) {
  const list = [...pitchers]
  if (sortKey === 'weak') return list.sort((a, b) => b.weak_spot_count - a.weak_spot_count)
  if (sortKey === 'hr9') return list.sort((a, b) => (b.pitcher_hr9 ?? -1) - (a.pitcher_hr9 ?? -1))
  if (sortKey === 'whip') return list.sort((a, b) => (b.pitcher_whip ?? -1) - (a.pitcher_whip ?? -1))
  return list.sort((a, b) => new Date(a.game_time || 0) - new Date(b.game_time || 0))
}

function localTime(gameTime) {
  if (!gameTime) return '—'
  const d = new Date(gameTime)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

// Same plain-stat-bar look used by Games.js's bot-view player rows, scaled
// down for HR/9 and WHIP since those don't run 0-100 like the hr/hrr scores.
function StatBar({ label, value, max, color }) {
  const pct = value == null ? 0 : Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
      <span style={{ width: 34, fontSize: 9, color: C.text3, fontFamily: NUM_FONT, textTransform: 'uppercase' }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ width: 32, fontSize: 10, color: 'rgba(255,255,255,0.7)', fontFamily: NUM_FONT, textAlign: 'right' }}>
        {value == null ? '—' : value.toFixed(2)}
      </span>
    </div>
  )
}

function LineupRow({ b, onPlayerClick }) {
  return (
    <div
      onClick={() => onPlayerClick?.(b.raw)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px',
        cursor: onPlayerClick ? 'pointer' : 'default',
        borderRadius: 6,
      }}
    >
      <span style={{ width: 18, fontSize: 10, color: C.text3, fontFamily: NUM_FONT, textAlign: 'center', flexShrink: 0 }}>
        {b.lineup_spot ?? '?'}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {b.name}
      </span>
      <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0 }}>{b.bats}HB</span>
      {!b.lineup_confirmed && (
        <span style={{ fontSize: 9, color: C.text3, flexShrink: 0 }}>(proj.)</span>
      )}
      {b.weak_spot_flag && (
        <span title="Weak pitcher spot" style={{ fontSize: 11, flexShrink: 0 }}>⭐</span>
      )}
      {b.pitch_type_match_score > 0 && (
        <span title="Matchup edge" style={{ fontSize: 11, flexShrink: 0 }}>🎯</span>
      )}
      <span style={{ fontSize: 11, fontWeight: 800, color: C.orange, fontFamily: NUM_FONT, width: 28, textAlign: 'right', flexShrink: 0 }}>
        {Math.round(b.hr_score)}
      </span>
    </div>
  )
}

function PitcherCard({ pitcher, isOpen, onToggle, onPlayerClick, onOpenPitcher }) {
  const hasWeak = pitcher.weak_spot_count > 0
  return (
    <div style={{ background: C.bg2, border: `1px solid ${hasWeak ? '#f59e0b44' : C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
      <div
        onClick={() => onToggle(pitcher.pitcher_id)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 14px', cursor: 'pointer', gap: 10, flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 10, color: C.text3, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', display: 'inline-block', width: 10 }}>▸</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>{pitcher.pitcher_name}</span>
              <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{pitcher.pitcher_throws}HP</span>
              {hasWeak && <Chip color="#f59e0b">⭐ {pitcher.weak_spot_count} weak spot{pitcher.weak_spot_count > 1 ? 's' : ''}</Chip>}
            </div>
            <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginTop: 2 }}>
              {pitcher.team} vs {pitcher.opponent_team} · {localTime(pitcher.game_time)}
              {pitcher.venue_name ? ` · ${pitcher.venue_name}` : ''}
              {' · '}{pitcher.lineup_confirmed ? 'Lineup confirmed' : 'Projected lineup'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenPitcher?.(pitcher) }}
            style={{
              padding: '4px 10px', fontSize: 10.5, fontWeight: 700, borderRadius: 6,
              cursor: 'pointer', border: `1px solid ${C.border}`,
              background: 'transparent', color: C.text3, whiteSpace: 'nowrap',
            }}
          >Open card</button>
          <div style={{ minWidth: 130 }}>
            <StatBar label="ERA" value={pitcher.pitcher_era} max={6} color={C.cyan} />
            <StatBar label="HR/9" value={pitcher.pitcher_hr9} max={3} color={C.orange} />
            <StatBar label="WHIP" value={pitcher.pitcher_whip} max={2} color={C.purple} />
          </div>
        </div>
      </div>

      {isOpen && (
        <div style={{ padding: '0 14px 12px', borderTop: `1px solid ${C.border}` }}>
          {/* Spot-by-spot first. The plain row list underneath is the roster;
              this is the question you actually opened the card to answer. */}
          <PitcherSpots pitcher={pitcher} onPlayerClick={onPlayerClick} />
          <PitcherProfile pitcher={pitcher} />

          <div style={{ fontSize: 9, color: C.text3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '14px 0 4px' }}>
            Opposing Lineup ({pitcher.lineup.length})
          </div>
          {pitcher.lineup.map((b) => (
            <LineupRow key={b.player_id ?? b.name} b={b} onPlayerClick={onPlayerClick} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Pitchers({ players, onPlayerClick }) {
  const [sortKey, setSortKey] = useState('weak')
  const [openId, setOpenId] = useState(null)
  const [modalPitcher, setModalPitcher] = useState(null)

  const pitchers = useMemo(() => groupPitchers(players), [players])
  const sorted = useMemo(() => sortPitchers(pitchers, sortKey), [pitchers, sortKey])

  if (!pitchers.length) return <Empty text="No pitcher data found yet." />

  return (
    <div>
      <PanelTitle
        title="Pitchers"
        sub={`${pitchers.length} starters today · click to see opposing lineup`}
        right={
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {/* The four sort buttons that were here are gone. The table below
                sorts on any of its 16 columns and shows which one is active;
                these duplicated four of them, didn't reflect the table's state,
                and only reordered the card list — so clicking "Highest HR/9"
                appeared to do nothing while the table stayed where it was.
                The cards now follow the same default the table opens on. */}
          </div>
        }
      />
      {/* The card list below is one starter at a time. This is the slate:
          which arms are actually attackable, and on which axis. */}
      {/* One sortable table of EVERY starter, replacing the old "most
          attackable" heatmap. That heatmap showed the top 15 and the card list
          below it showed all 28 — the same starters twice, with the top of one
          list also being the top of the other. This does the heatmap's job
          (scan the slate, sort on whatever you care about) without being a
          second copy of the thing underneath it.

          L3 columns are the addition: pitcher_l3_era, _l3_whip, _l3_hr9 and
          _l3_starts_found are on 143 of 143 slate rows. Season K/9 is here too
          — there is no L3 K/9 published, so it isn't invented. */}
      <DenseTable
        rows={sorted.map((p) => {
          const src = (k) => {
            for (const b of p.lineup || []) {
              const v = b?.raw?.[k]
              if (v !== null && v !== undefined && v !== '') return v
            }
            return null
          }
          return {
            _key: p.pitcher_id ?? p.pitcher_name,
            _raw: p,
            name: p.pitcher_name,
            t: p.pitcher_throws,
            tm: p.team,
            vs: p.opponent_team,
            era: n(p.pitcher_era, null),
            whip: n(p.pitcher_whip, null),
            hr9: n(p.pitcher_hr9, null),
            k9: n(src('pitcher_k9'), null),
            l3era: n(src('pitcher_l3_era'), null),
            l3whip: n(src('pitcher_l3_whip'), null),
            l3hr9: n(src('pitcher_l3_hr9'), null),
            l3n: n(src('pitcher_l3_starts_found'), 0),
            trend: clean(src('pitcher_trend_direction'), ''),
            // The bot's own pitcher scoring. All five are on 268/268 slate rows
            // and none of them were shown anywhere on this board.
            attack: n(src('pitcher_attack_score'), null),
            attackTag: clean(src('pitcher_attack_tag'), ''),
            wsScore: n(src('pitcher_weak_side_score'), null),
            spotDmg: n(src('pitcher_spot_damage_score'), null),
            zoneDmg: n(src('pitcher_zone_damage_score'), null),
            lowK: src('pitcher_low_k_flag') === true ? 1 : 0,
            overall: pitcherOverall(p.lineup?.[0]?.raw || {}),
            // The attack tag as three flags instead of a sentence — see the
            // column block below for why.
            gbTrap: /GB\/TRAP/i.test(clean(src('pitcher_attack_tag'), '')) ? 1 : 0,
            hardCon: /HARD CONTACT/i.test(clean(src('pitcher_attack_tag'), '')) ? 1 : 0,
            weakSide: clean(p.pitcher_weak_side, ''),
            spots: p.weak_spot_count,
            conf: p.lineup_confirmed ? 1 : 0,
          }
        })}
        columns={[
          // LAYOUT RULE: every text column first, every number after, nothing
          // interleaved. The table had Trend and Weak side sitting between
          // numeric columns, which breaks the eye's run down a block of digits
          // and makes the whole row harder to scan than it needs to be.
          { key: 'name',   label: 'Starter', heat: false, w: 148, bold: true, sticky: true },
          { key: 't',      label: 'T',   heat: false, w: 24, mono: true, dim: true },
          { key: 'tm',     label: 'Tm',  heat: false, w: 32, mono: true, dim: true },
          { key: 'vs',     label: 'vs',  heat: false, w: 32, mono: true, dim: true },
          { key: 'weakSide', label: 'Weak', heat: false, w: 44, mono: true, dim: true,
            title: 'The side this pitcher struggles against' },
          { key: 'trend',  label: 'Trend', heat: false, w: 58, dim: true },
          // Flags, as dots. The attack tag used to print "🧊 GB/TRAP" and
          // "⚠️ HARD CONTACT" as words in a 104px column — three values wearing
          // a lot of width, and the emoji made every row look busy. As dots
          // they scan instantly and sort like the booleans they are.
          { key: 'gbTrap', label: 'GB',  flag: true, mark: '●', w: 30,
            title: 'Bot tag: ground-ball / trap profile' },
          { key: 'hardCon', label: 'HRD', flag: true, mark: '●', w: 32,
            title: 'Bot tag: gives up hard contact' },
          { key: 'lowK',   label: 'LoK', flag: true, mark: '●', w: 32,
            title: 'Bot’s low-strikeout flag — fires on 98 of 268, so it’s common' },
          { key: 'conf',   label: 'LU',  flag: true, mark: '●', w: 28,
            title: 'Lineup confirmed' },
          // ── numbers from here down, uninterrupted ──
          { key: 'overall', label: 'Overall', w: 58, dp: 0,
            title: 'Blended attackability: HR/9 30%, attack 25%, zone damage 20%, weak side 15%, minus swinging-strike 10%. Unvalidated — none of these inputs reach the graded archive.' },
          { key: 'hr9',    label: 'HR/9', w: 46, dp: 2 },
          { key: 'era',    label: 'ERA', w: 44, dp: 2 },
          { key: 'whip',   label: 'WHIP', w: 46, dp: 2 },
          { key: 'k9',     label: 'K/9', w: 44, dp: 1, invert: true,
            title: 'Season strikeouts per nine. Inverted — a high K/9 is bad for the hitter.' },
          { key: 'l3hr9',  label: 'L3 HR/9', w: 54, dp: 2,
            title: 'Last three starts. Small by construction — check the L3 GS column.' },
          { key: 'l3era',  label: 'L3 ERA', w: 50, dp: 2 },
          { key: 'l3whip', label: 'L3 WHIP', w: 54, dp: 2 },
          { key: 'l3n',    label: 'L3 GS', w: 44,
            title: 'How many recent starts the L3 numbers actually found. Under 3 and they are thinner than they look.' },
          { key: 'attack', label: 'Attack', w: 52, dp: 0,
            title: 'The bot’s attack score. Range on tonight’s slate is 0–54, median 19 — so 30+ is genuinely high, not middling.' },
          { key: 'wsScore', label: 'Weak side', w: 58, dp: 0,
            title: 'How exploitable his platoon split is. 0–90 on tonight’s slate.' },
          { key: 'zoneDmg', label: 'Zone dmg', w: 58, dp: 0,
            title: 'Damage he allows by order third — pooled, so sturdier than the per-spot number' },
          { key: 'spotDmg', label: 'Spot dmg', w: 56, dp: 0,
            title: 'Damage by individual lineup spot. Thin by construction.' },
          { key: 'spots',  label: '★ Spots', w: 52,
            title: 'Weak lineup spots he faces tonight' },
        ]}
        onRowClick={(p) => setModalPitcher(p)}
        initialSort="hr9"
        maxHeight={420}
        caption="Every starter on the slate, now including the bot's own pitcher scoring — Attack, Weak side, Zone damage and Spot damage, none of which appeared anywhere on this board before. Read Attack against its real range: it runs 0–54 tonight with a median of 19, so a 35 is a strong signal even though it looks low on a 100-point instinct. Bright is good for the hitter throughout, so K/9 is inverted — a high strikeout rate is his strength, not yours. L3 columns are the last three starts and are thin on purpose: three outings is a handful of innings, so read them as a direction rather than a rate, and check L3 GS before trusting them. Click a header to sort, shift-click to add a tiebreaker, a row to open the starter."
      />

      {sorted.map((pitcher) => (
        <PitcherCard
          key={pitcher.pitcher_id ?? pitcher.pitcher_name}
          pitcher={pitcher}
          isOpen={openId === pitcher.pitcher_id}
          onToggle={(id) => setOpenId((prev) => (prev === id ? null : id))}
          onPlayerClick={onPlayerClick}
          onOpenPitcher={setModalPitcher}
        />
      ))}

      {modalPitcher && (
        <PitcherModal
          pitcher={modalPitcher}
          onClose={() => setModalPitcher(null)}
          onPlayerClick={(p) => { setModalPitcher(null); onPlayerClick?.(p) }}
        />
      )}
    </div>
  )
}
