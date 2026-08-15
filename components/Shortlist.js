'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, teamOf, oppOf } from '../lib/player'
import { hrScore } from '../lib/player'
import { quoteFor, fmtOdds, impliedPct, hrPerGame, fairOdds } from '../lib/odds'
import DenseTable from './DenseTable'
import { Empty } from './ui'

// 🎯 THE SHORTLIST — who stands out tonight, and whether the number is right.
//
// 2026-08-15, from Donovan's screenshot ("Who Stands Out for a Home Run?"):
// a ranked HR table with two views — strongest profiles, and profiles whose
// CURRENT PRICE leaves room. The second view is the one with money in it, and
// it is exactly the split their table drew: "strong hitter, bad number? It
// stays off the second list."
//
// Built MOONSHOT's way rather than copied:
//
//   · The rate is REAL — hr_per_pa through his lineup spot's plate
//     appearances, the same per-game probability the price bubbles use. Their
//     "historical HR rate" and our rate answer the same question; ours states
//     its source.
//   · ROOM is gated the way every comparison on this site is gated: it only
//     exists when the book is on the 0.5 line (1+ HR, the bet the profile is
//     about). A 1.5 line is a different bet and renders as one.
//   · The READ column never claims more than the row can support. No price →
//     "no price posted", which on most slates is most rows — their table
//     showed the same honestly, and it's the right call.
//   · It's a DenseTable, so every column sorts on click — sort by ROOM and
//     you have their second view without a second tab.

const READ = {
  value: { word: 'market’s behind', tone: '#4ade80', rank: 5 },
  look: { word: 'worth a look', tone: '#a3e635', rank: 4 },
  fair: { word: 'fairly priced', tone: C.text3, rank: 3 },
  short: { word: 'needs better odds', tone: '#f87171', rank: 2 },
  wrongline: { word: 'book’s on 2+', tone: '#FCD34D', rank: 1 },
  norate: { word: 'priced, no rate', tone: C.text3, rank: 1 },
  none: { word: 'no price posted', tone: C.text3, rank: 0 },
}

export default function Shortlist({ players = [], odds = null, onPlayerClick }) {
  const [view, setView] = useState('profile')

  const rows = useMemo(() => {
    return (players || [])
      .map((p) => {
        const score = hrScore(p)
        if (!Number.isFinite(score) || score <= 0) return null
        const rate = hrPerGame(p)
        const q = quoteFor(odds, p, 'HR')
        const priced = q && q.over != null
        const need = priced ? (q.implied ?? impliedPct(q.over)) : null
        const room = priced && q.matches !== false && rate != null && need != null
          ? rate - need : null
        let read = 'none'
        if (priced && q.matches === false) read = 'wrongline'
        else if (room != null) {
          read = room >= 5 ? 'value' : room >= 2 ? 'look' : room <= -4 ? 'short' : 'fair'
        } else if (priced) {
          // A price with no rate beside it is NOT "no price posted" — it's a
          // row the site declines to judge. The fixture caught this reading
          // as the wrong absence.
          read = 'norate'
        }
        return {
          _key: `${p.player_id}`,
          _raw: p,
          name: nameOf(p),
          team: teamOf(p),
          opp: oppOf(p),
          score,
          rate,
          price: priced ? q.over : null,
          priceTxt: priced ? (q.matches === false ? `≠${fmtOdds(q.over)}` : fmtOdds(q.over)) : '—',
          assume: need,
          fair: rate != null ? fairOdds(rate) : null,
          room,
          read,
          readTxt: READ[read].word,
          _readRank: READ[read].rank,
        }
      })
      .filter(Boolean)
      .sort((a, b) => (view === 'profile'
        ? b.score - a.score
        : (b.room ?? -1e9) - (a.room ?? -1e9) || b.score - a.score))
      .slice(0, 40)
  }, [players, odds, view])

  if (!rows.length) return <Empty text="No slate loaded, so there is nothing to rank yet." />

  const anyPriced = rows.some((r) => r.price != null)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>🎯 Who stands out for a homer</span>
        <span style={{ fontSize: 9.5, color: C.text3 }}>
          top 40 by the view you pick · every column sorts on click
        </span>
      </div>
      <div style={{ display: 'flex', gap: 5, marginBottom: 9 }}>
        {[['profile', 'Strongest profiles'], ['fit', 'Best odds fits']].map(([k, label]) => (
          <button key={k} onClick={() => setView(k)} style={{
            padding: '3px 11px', borderRadius: 999, cursor: 'pointer', fontSize: 10,
            fontWeight: 800, fontFamily: NUM_FONT,
            border: `1px solid ${view === k ? C.orange : C.border}`,
            background: view === k ? 'rgba(249,115,22,.14)' : 'transparent',
            color: view === k ? C.orange : C.text3,
          }}>{label}</button>
        ))}
        {view === 'fit' && !anyPriced && (
          <span style={{ fontSize: 9.5, color: C.text3, alignSelf: 'center' }}>
            no board published yet — every row reads &ldquo;no price posted&rdquo; until the odds run lands
          </span>
        )}
      </div>

      {/* key={view}: DenseTable keeps its own sort stack, and once a header
          has been clicked that stack overrides row order — so the profile/fit
          pills re-highlighted and nothing moved (the audit's find). Remounting
          on the toggle resets the stack, which is what the pill promises. */}
      <DenseTable
        key={view}
        rows={rows}
        onRowClick={onPlayerClick ? (r) => onPlayerClick(r._raw) : null}
        initialSort={null}
        maxHeight={560}
        columns={[
          { key: 'name', label: 'Player', heat: false, w: 150, bold: true, sticky: true },
          { key: 'team', label: 'Tm', heat: false, w: 34, mono: true, dim: true },
          { key: 'opp', label: 'Opp', heat: false, w: 40, mono: true, dim: true },
          { key: 'score', label: 'HR score', w: 64,
            title: 'The bot’s 0-100 HR score — the profile. Not a probability.' },
          { key: 'rate', label: 'His rate', w: 58, fmt: (v) => (v == null ? '—' : `${v.toFixed(1)}%`),
            title: 'His real per-game 1+ HR probability: hr_per_pa through his lineup spot’s plate appearances. This IS a probability, which is why it’s the only column the price gets compared to.' },
          { key: 'price', label: 'Price', heat: false, w: 56, mono: true,
            fmt: (v, r) => r.priceTxt,
            title: 'The book’s 1+ HR price. ≠ means the book is on a different line — a multi-homer bet, not this one.' },
          { key: 'assume', label: 'Odds assume', w: 74, fmt: (v) => (v == null ? '—' : `${v.toFixed(1)}%`),
            title: 'The HR rate required to break even at that price — what the market thinks his number is.' },
          { key: 'fair', label: 'His fair px', heat: false, w: 62, mono: true, dim: true,
            fmt: (v) => (v == null ? '—' : fmtOdds(v)),
            title: 'The price his own rate deserves — anything longer is value.' },
          { key: 'room', label: 'Room', w: 52, fmt: (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`),
            title: 'His rate minus what the odds assume, in points. Positive: the book is paying more than his rate says it should.' },
          { key: '_readRank', label: 'Read', heat: false, w: 108,
            // fmt returns JSX — DenseTable renders it inside the cell, which
            // is how the verdict gets its colour without a cellStyle hook.
            fmt: (v, r) => <b style={{ color: READ[r.read].tone, fontWeight: 800, fontSize: 10 }}>{r.readTxt}</b>,
            title: 'The verdict, gated: it only speaks when a real rate met a real price on the same line.' },
        ]}
        caption="The profile view is the bot's ranking; Best odds fits re-sorts by ROOM, which is their whole second table in one click. His rate is a real per-game probability (hr_per_pa × his lineup spot's trips), so the comparison against the price is honest — the HR score never touches the odds math. Rows with no price stay ranked by profile; on most slates that's most rows, and saying so beats pretending."
      />
    </div>
  )
}
