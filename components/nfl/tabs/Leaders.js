'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../../lib/nfl/theme'
import { injuryTag, injuryTitle, injuryColor } from '../../../lib/nfl/injury'
import ChartFrame from '../ChartFrame'

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

const MIN_QUALIFIED = 5      // fewer than this and the "leaderboard" is a list
const TOP_N = 8              // how many a card shows when opened
const PREVIEW_N = 3          // ...and before that, on every screen size

// Donovan, standing instruction: "long lists should preview a few rows,
// everywhere they appear" — a phone must not have to scroll past 23 × 8 rows to
// reach the bottom of this page. So every card previews PREVIEW_N and opens.

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K']

// A `pct` column is stored as a RATE, not a percentage — target share arrives
// as 0.37, not 37. Research.js:89 multiplies by 100 on the way out; this has to
// do the same or the whole TGT% card reads "0.4%" for the league leader.
const fmt = (v, dp, pct) => {
  if (!Number.isFinite(v)) return '—'
  return pct ? `${(v * 100).toFixed(dp ?? 1)}%` : v.toFixed(dp ?? 2)
}

function Card({ col, rows, open, onToggle, onPlayerClick }) {
  const shown = open ? rows.slice(0, TOP_N) : rows.slice(0, PREVIEW_N)
  const max = Math.max(...rows.slice(0, TOP_N).map((r) => Math.abs(r.v)), 0) || 1
  return (
    <ChartFrame pad="11px 12px 9px" style={{
      borderRadius: 12, display: 'flex', flexDirection: 'column',
    }}>
      <header style={{ marginBottom: 8 }}>
        <div style={{
          fontFamily: NUM_FONT, fontSize: 11.5, fontWeight: 900, color: C.text,
          letterSpacing: '.04em',
        }}>{col.label}</div>
        <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.45, marginTop: 2 }}>
          {col.desc}
        </div>
      </header>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {shown.map((r, i) => {
          const tag = injuryTag(r.p)
          return (
            <li key={r.p.player_id}>
              <button
                onClick={() => onPlayerClick?.(r.p)}
                title={`${r.p.name} — open his card`}
                style={{
                  position: 'relative', width: '100%', display: 'flex', alignItems: 'center',
                  gap: 7, padding: '4px 6px', borderRadius: 7, cursor: 'pointer',
                  border: `1px solid ${i === 0 ? C.green + '3a' : 'transparent'}`,
                  background: 'transparent', textAlign: 'left', overflow: 'hidden',
                }}>
                {/* the bar IS the ranking — chart-based, as asked for */}
                <span aria-hidden style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${Math.max(3, (Math.abs(r.v) / max) * 100)}%`,
                  borderRadius: '0 5px 5px 0',
                  background: i === 0
                    ? `linear-gradient(90deg, ${C.green}75, ${C.green}38)`
                    : `linear-gradient(90deg, ${C.green}30, ${C.green}18)`,
                }} />
                <span style={{
                  position: 'relative', fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 900,
                  color: i === 0 ? C.green : C.text3, minWidth: 12,
                }}>{i + 1}</span>
                <span style={{
                  position: 'relative', flex: 1, minWidth: 0, fontSize: 11,
                  fontWeight: i === 0 ? 800 : 650, color: C.text,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{r.p.name}</span>
                {tag && (
                  <span title={injuryTitle(tag)} style={{
                    position: 'relative', fontSize: 8.5, fontWeight: 900,
                    color: injuryColor(tag, C),
                  }}>{tag}</span>
                )}
                <span style={{
                  position: 'relative', fontFamily: NUM_FONT, fontSize: 9,
                  color: C.text3, whiteSpace: 'nowrap',
                }}>{r.p.position} · {r.p.team}</span>
                <span style={{
                  position: 'relative', fontFamily: NUM_FONT, fontSize: 12, fontWeight: 900,
                  color: i === 0 ? C.green : C.text, minWidth: 46, textAlign: 'right',
                }}>{fmt(r.v, col.dp, col.pct)}</span>
              </button>
            </li>
          )
        })}
      </ol>

      {rows.length > PREVIEW_N && (
        <button onClick={onToggle} style={{
          marginTop: 6, alignSelf: 'flex-start', background: 'transparent',
          border: `1px solid ${C.border}`, borderRadius: 7, color: C.text3,
          fontSize: 9, fontWeight: 800, padding: '3px 9px', cursor: 'pointer',
        }}>
          {open ? 'show less' : `show top ${Math.min(TOP_N, rows.length)}`}
        </button>
      )}
    </ChartFrame>
  )
}

export default function Leaders({ data, onPlayerClick }) {
  const [pos, setPos] = useState('ALL')
  const [openKey, setOpenKey] = useState(null)

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
        .map((p) => ({ p, v: Number(p?.stats?.[col.key]) }))
        .filter((r) => Number.isFinite(r.v) && r.v !== 0)
        .sort((a, b) => b.v - a.v)
      // A card has to be a leaderboard, not a shortlist. See the header note
      // about SEP / YACOE / RYOE, which no player carries at all.
      if (rows.length >= MIN_QUALIFIED) out.push({ col, rows })
    }
    return out
  }, [players, cols, pos])

  const dropped = cols.length - cards.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header style={{
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '13px 14px',
      }}>
        <div style={{
          fontFamily: NUM_FONT, fontSize: 9, fontWeight: 900, letterSpacing: '.14em',
          color: C.text3,
        }}>TUDDY · LEADERS</div>
        <h1 style={{ margin: '4px 0 5px', fontSize: 25, fontWeight: 900, color: C.text }}>
          Who is first, and by how much
        </h1>
        <p style={{ margin: 0, fontSize: 11, color: C.text2, lineHeight: 1.55, maxWidth: 620 }}>
          Measured per-game rates from the slate — no model score anywhere on this page.
          Every board on the site already ranks by the model; this one ranks by what
          actually happened. Tap a name to open his card.
        </p>
      </header>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
        {POSITIONS.map((k) => (
          <button key={k} onClick={() => setPos(k)} style={{
            fontFamily: NUM_FONT, fontSize: 10, fontWeight: 900, cursor: 'pointer',
            padding: '4px 11px', borderRadius: 8,
            border: `1px solid ${pos === k ? C.green : C.border}`,
            background: pos === k ? `${C.green}2a` : 'transparent',
            color: pos === k ? C.green : C.text3,
          }}>{k}</button>
        ))}
        <span style={{ fontSize: 9.5, color: C.text3, marginLeft: 4 }}>
          {cards.length} categor{cards.length === 1 ? 'y' : 'ies'}
          {dropped > 0 && ` · ${dropped} hidden for want of data`}
        </span>
      </div>

      {cards.length === 0 ? (
        <div style={{
          background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: 18, fontSize: 11.5, color: C.text2,
        }}>
          Nothing to rank at {pos} on this slate yet.
        </div>
      ) : (
        <div style={{
          display: 'grid', gap: 10,
          gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))',
        }}>
          {cards.map(({ col, rows }) => (
            <Card key={col.key} col={col} rows={rows}
                  open={openKey === col.key}
                  onToggle={() => setOpenKey(openKey === col.key ? null : col.key)}
                  onPlayerClick={onPlayerClick} />
          ))}
        </div>
      )}

      <p style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.6, margin: '2px 2px 0' }}>
        Per-game rates over the trailing window the slate publishes, players on bye excluded.
        A category needs {MIN_QUALIFIED} qualified players to appear at all — on the current
        payload the NGS columns (separation, YAC over expected, rush yards over expected) are
        carried by nobody, so they are not shown rather than shown empty.
      </p>
    </div>
  )
}
