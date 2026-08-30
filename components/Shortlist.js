'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, teamOf, oppOf, playerId, n, clean } from '../lib/player'
import { hrScore } from '../lib/player'
import { roleBadge } from '../lib/roleBadge'
import { quoteFor, fmtOdds, impliedPct, hrPerGame, fairOdds } from '../lib/odds'
import DenseTable from './DenseTable'
import { Empty } from './ui'
import { DIV_FIELD } from '../lib/scales'

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

export default function Shortlist({ players = [], odds = null, onPlayerClick, onWatch, watchIds = null }) {
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
        // ── WHAT KIND OF PICK IS THIS (2026-08-30) ───────────────────
        //
        // Donovan: "need to know the type of pick wither watch top and
        // therne threr role too and more stats". Fair — this table ranked
        // by HR score and never said what the BOT had called the man. A
        // 55.7 the bot tagged POWER WATCH and a 55.8 it tagged HR BET are
        // different objects and the shortlist printed them identically.
        //
        // Two different fields, and not the same question:
        //   final_hr_role   the conviction tier — HR BET / HR LEAN / POWER
        //                   WATCH / AVOID. What the bot thinks of the bat.
        //   game_pick_role  the slot he was designated in for HIS game —
        //                   TOP / HR / HRR / HIT / CONTACT / WATCH. One per
        //                   group per game, so this is scarcity, not opinion.
        // Both published on every row; neither was on screen.
        //
        // Resolved through lib/roleBadge.js rather than by reading the
        // string: colour used to be keyed on the emoji, so a de-emojified
        // value fell through to orange. Its tier is the semantic one and it
        // survives the bot changing format — which it has (see the ship note).
        const role = roleBadge(p?.final_hr_role, C)
        // KEEP EVERY PART. game_pick_role is multi-valued on the live slate —
        // 'HIT/WATCH', 'TOP/CONTACT', 'HIT/CONTACT/WATCH' — and the first cut
        // took .split('/')[0] like TheRead does. That drops WATCH whenever it
        // is not first, and WATCH is the single most common designation on the
        // board (29 of the 89 designated rows tonight). It is also the exact
        // thing this column was added to show, so it is kept whole.
        const pick = clean(p?.game_pick_role, '')
          .split('/').map((x) => x.trim().toUpperCase()).filter(Boolean)
        const hr = n(p?.season_hr, null)
        const pa = n(p?.season_pa, null)
        return {
          _key: `${p.player_id}`,
          _raw: p,
          watched: !!watchIds?.has(playerId(p)),
          name: nameOf(p),
          team: teamOf(p),
          opp: oppOf(p),
          role: role.known ? role.label : (role.label === '—' ? '' : role.label),
          _roleColor: role.color,
          pick: pick.join('/'),
          _pickParts: pick,
          spot: n(p?.lineup_spot, null),
          hr,
          pa,
          iso: n(p?.season_iso, null),
          hrw: n(p?.hrw_score, null),
          arm: n(p?.pitcher_hr9, null),
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
  }, [players, odds, view, watchIds])

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
        heatMode="sorted"
        maxHeight={560}
        columns={[
          // 2026-08-30, Donovan: the shortlist ("i like the short list tho")
          // was missing the one action every other player row on the site
          // has — no way to save a name here without leaving to find him on
          // another tab. Same ★/☆ button and behavior as PlayerCard.
          ...(onWatch ? [{
            key: 'watched', label: '', heat: false, w: 28,
            fmt: (v, r) => (
              <button
                onClick={(e) => { e.stopPropagation(); onWatch(r._raw) }}
                title={v ? 'Remove from watchlist' : 'Add to watchlist'}
                style={{
                  background: 'transparent', border: 0, cursor: 'pointer',
                  color: v ? C.yellow : C.text3, fontSize: 13, lineHeight: 1, padding: 0,
                }}
              >{v ? '★' : '☆'}</button>
            ),
          }] : []),
          { key: 'name', label: 'Player', heat: false, w: 150, bold: true, sticky: true },
          { key: 'team', label: 'Tm', heat: false, w: 34, mono: true, dim: true },
          { key: 'opp', label: 'Opp', heat: false, w: 40, mono: true, dim: true },
          // The bot's own verdict on the bat, as a typographic tag rather
          // than the emoji the payload ships (lib/roleBadge.js explains why).
          { key: 'role', label: 'Role', heat: false, w: 74,
            title: 'What the bot calls this bat: HR BET / HR LEAN / POWER (watch) / HRR / CONTACT / AVOID. Its conviction tier, published per player — not derived here.',
            fmt: (v, r) => (!v ? <span style={{ color: C.text3 }}>—</span> : (
              <span style={{
                fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 900, letterSpacing: '.05em',
                padding: '1.5px 6px', borderRadius: 5, whiteSpace: 'nowrap',
                border: `1px solid ${r._roleColor}55`, background: `${r._roleColor}14`, color: r._roleColor,
              }}>{v}</span>
            )) },
          // Different question from Role, and the reason both are here: the
          // bot designates exactly ONE hitter per group per game, so a TOP
          // is scarce in a way a high score is not. 124px, not 92: three tags
          // is a real value ('HIT/CONTACT/WATCH') and at 92 the third one
          // overflowed into Spot. Caught in render, not in reasoning.
          { key: 'pick', label: 'Pick', heat: false, w: 124,
            title: 'The slot(s) the bot designated him in for his own game — TOP, HR, HRR, HIT, CONTACT, WATCH. A hitter can carry more than one and all of them are shown. Blank means he was not designated in that game, which on a full slate is most of the board.',
            fmt: (v, r) => (!r._pickParts?.length ? <span style={{ color: C.text3 }}>—</span> : (
              <span style={{ display: 'inline-flex', gap: 3, flexWrap: 'nowrap' }}>
                {r._pickParts.map((part) => (
                  <span key={part} style={{
                    fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 900, letterSpacing: '.04em',
                    padding: '1px 4px', borderRadius: 4, whiteSpace: 'nowrap',
                    border: `1px solid ${part === 'WATCH' ? C.border2 : `${C.orange}55`}`,
                    color: part === 'WATCH' ? C.text3 : C.orange,
                  }}>{part}</span>
                ))}
              </span>
            )) },
          { key: 'spot', label: 'Spot', heat: false, w: 40, mono: true, dim: true,
            title: 'His lineup slot. Not decoration here: the rate column converts hr_per_pa through the plate appearances this slot actually gets, so a leadoff man and a nine-hole hitter with the same per-PA rate do not have the same per-game one.',
            fmt: (v) => (v == null ? '—' : v) },
          // ── A SCORE AND A PROBABILITY STOPPED SHARING A RAMP (2026-08-22)
          //
          // These two columns sat side by side on one auto-normalised ramp:
          // an 83 in the same amber as a 23.7%. The tooltips already said the
          // right thing — "the bot's 0-100 HR score… NOT a probability" — and
          // the colour said the opposite, which is the louder of the two.
          //
          // 2026-08-22: the score now diverges against the MIDDLE OF THIS
          // SHORTLIST, like every other score on the site. That does not undo
          // the point above — the thing that keeps a score from borrowing a
          // probability's grammar is that its anchor is a rank, not a rate.
          // "Above the middle of this list" is a comparison; `rate` and
          // `assume` are probabilities and still print plain, unpainted, so
          // the two kinds of number never share a treatment.
          { key: 'score', label: 'HR score', w: 64, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100], primary: true,
            title: 'The bot’s 0-100 HR score — the profile. Not a probability. Drawn against the middle of this shortlist: ▲ above it, ▼ below.' },
          { key: 'rate', label: 'His rate', w: 58, heat: false, mono: true, fmt: (v) => (v == null ? '—' : `${v.toFixed(1)}%`),
            title: 'His real per-game 1+ HR probability: hr_per_pa through his lineup spot’s plate appearances. This IS a probability, which is why it’s the only column the price gets compared to — and why it is not painted on the same scale as the score.' },
          // THE DENOMINATOR BEHIND "HIS RATE", which the column above cannot
          // show. 22 HR in 391 trips and 7 in 127 both render as a tidy
          // percentage; only this says which one you are reading.
          { key: 'hr', label: 'HR / PA', heat: false, w: 68, mono: true,
            title: 'Season home runs over season plate appearances — the sample the rate beside it is computed from. A rate is only as good as its denominator, and this table would otherwise never show one.',
            fmt: (v, r) => (v == null || r.pa == null
              ? <span style={{ color: C.text3 }}>—</span>
              : <span style={{ fontFamily: NUM_FONT }}>{v}<span style={{ color: C.text3 }}> / {r.pa}</span></span>) },
          { key: 'iso', label: 'ISO', w: 48, dp: 3, mono: true,
            title: 'Season isolated power — slugging minus average, so it is extra-base ability with singles taken out. The most direct power stat on the row.',
            fmt: (v) => (v == null ? '—' : String(v.toFixed(3)).replace(/^0/, '')) },
          { key: 'hrw', label: 'HRW', w: 50, dp: 1,
            title: "The HR score with tonight's park and weather folded in. Compare it to HR score: a gap between the two IS the ballpark and the air, and the direction tells you which way they cut." },
          { key: 'arm', label: 'Arm HR9', w: 58, dp: 2, mono: true, invert: true,
            title: "Home runs allowed per nine by tonight's starter. Higher is better for the hitter, so this column is inverted — the heat reads the way the bat reads it.",
            fmt: (v) => (v == null ? '—' : v.toFixed(2)) },
          { key: 'price', label: 'Price', heat: false, w: 56, mono: true,
            fmt: (v, r) => r.priceTxt,
            title: 'The book’s 1+ HR price. ≠ means the book is on a different line — a multi-homer bet, not this one.' },
          { key: 'assume', label: 'Odds assume', w: 74, heat: false, mono: true, fmt: (v) => (v == null ? '—' : `${v.toFixed(1)}%`),
            title: 'The HR rate required to break even at that price — what the market thinks his number is. A probability, printed plain: the comparison against His rate is the Room column.' },
          { key: 'fair', label: 'His fair px', heat: false, w: 62, mono: true, dim: true,
            fmt: (v) => (v == null ? '—' : fmtOdds(v)),
            title: 'The price his own rate deserves — anything longer is value.' },
          { key: 'room', label: 'Room', w: 52, scale: 'div', anchor: 0, ceiling: 8, anchorLabel: 'the break-even price',
            fmt: (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`),
            title: 'His rate minus what the odds assume, in points. ▲ the book is paying more than his rate says it should; ▼ less; blank in the middle, because a fair price is not a finding.' },
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
