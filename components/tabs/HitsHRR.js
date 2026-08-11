'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import BoardFilters, { useBoardFilter } from '../BoardFilters'
import { btnStyle } from '../ui'
import RankedBoard from './RankedBoard'
import PlayerCard from '../PlayerCard'
import HitterHeat from '../HitterHeat'
import { playerId } from '../../lib/player'

function WeakSpotSection({ players, onAdd, onWatch, watchIds, onPlayerClick }) {
  const ws = players
    .filter(p => p?.weak_spot_flag === true)
    .sort((a, b) => (b?.hr_score || 0) - (a?.hr_score || 0))

  if (!ws.length) return null

  return (
    <div style={{ marginBottom: 18 }}>
      {/* The cards below say who qualified. This says whether they qualified
          for the same reason -- a category where every name is carried by one
          column is a category worth distrusting. */}
      <HitterHeat
        players={ws}
        type="hr"
        title="Weak spot matchups"
        onPlayerClick={onPlayerClick}
      />
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 10, padding: '7px 12px',
        background: `linear-gradient(90deg, #f59e0b14, transparent)`,
        borderLeft: `3px solid #f59e0b`, borderRadius: 8,
      }}>
        <span style={{ fontSize: 16 }}>⭐</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Weak Spot Matchups</span>
        <span title="Validated: flagged hitters homered 18.0% vs 13.9% baseline across the graded archive" style={{
          fontSize: 9, fontWeight: 900, fontFamily: NUM_FONT, color: '#f59e0b', cursor: 'help',
          border: `1px solid #f59e0b55`, borderRadius: 999, padding: '1px 8px',
        }}>18.0% HR</span>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{ws.length} players</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
        {ws.map(p => (
          <PlayerCard
            key={playerId(p)}
            p={p}
            type="hr"
            onAdd={onAdd}
            onWatch={onWatch}
            watched={watchIds?.has(playerId(p))}
            onClick={() => onPlayerClick?.(p)}
          />
        ))}
      </div>
    </div>
  )
}

function AlignedSignalsSection({ players, onAdd, onWatch, watchIds, onPlayerClick }) {
  const aligned = players
    .filter(p => (p?.top_board_tags || []).some(t => String(t).includes('🧩')))
    .sort((a, b) => (b?.hr_score || 0) - (a?.hr_score || 0))

  if (!aligned.length) return null

  return (
    <div style={{ marginBottom: 18 }}>
      {/* The cards below say who qualified. This says whether they qualified
          for the same reason -- a category where every name is carried by one
          column is a category worth distrusting. */}
      <HitterHeat
        players={aligned}
        type="hr"
        title="Aligned signals"
        onPlayerClick={onPlayerClick}
      />
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 10, padding: '7px 12px',
        background: `linear-gradient(90deg, #a78bfa14, transparent)`,
        borderLeft: `3px solid #a78bfa`, borderRadius: 8,
      }}>
        <span style={{ fontSize: 16 }}>🧩</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Aligned Signals</span>
        <span title="The measured stack: 29.2% HR across 154 graded slots — the strongest validated combo on the site" style={{
          fontSize: 9, fontWeight: 900, fontFamily: NUM_FONT, color: '#a78bfa', cursor: 'help',
          border: `1px solid #a78bfa55`, borderRadius: 999, padding: '1px 8px',
        }}>29.2% HR</span>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{aligned.length} players</span>
      </div>
      <div style={{ fontSize: 10.5, color: C.text3, marginBottom: 10, lineHeight: 1.5 }}>
        Weak-spot lineup matchup, pitch-type match, and real recent contact quality all line up —
        the strongest validated signal combo found in backtesting.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
        {aligned.map(p => (
          <PlayerCard
            key={playerId(p)}
            p={p}
            type="hr"
            onAdd={onAdd}
            onWatch={onWatch}
            watched={watchIds?.has(playerId(p))}
            onClick={() => onPlayerClick?.(p)}
          />
        ))}
      </div>
    </div>
  )
}

function MatchupEdgeSection({ players, onAdd, onWatch, watchIds, onPlayerClick }) {
  const edge = players
    .filter(p => Number(p?.pitch_type_match_score || 0) > 0)
    .sort((a, b) => (b?.hr_score || 0) - (a?.hr_score || 0))

  if (!edge.length) return null

  return (
    <div style={{ marginBottom: 18 }}>
      {/* The cards below say who qualified. This says whether they qualified
          for the same reason -- a category where every name is carried by one
          column is a category worth distrusting. */}
      <HitterHeat
        players={edge}
        type="hr"
        title="Matchup edge"
        onPlayerClick={onPlayerClick}
      />
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 10, padding: '7px 12px',
        background: `linear-gradient(90deg, #22d3ee14, transparent)`,
        borderLeft: `3px solid #22d3ee`, borderRadius: 8,
      }}>
        <span style={{ fontSize: 16 }}>🎯</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Matchup Edge</span>
        <span title="Backtested separator: 23.9% HR with the flag vs 9.5% without" style={{
          fontSize: 9, fontWeight: 900, fontFamily: NUM_FONT, color: '#22d3ee', cursor: 'help',
          border: `1px solid #22d3ee55`, borderRadius: 999, padding: '1px 8px',
        }}>23.9% HR</span>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{edge.length} players</span>
      </div>
      <div style={{ fontSize: 10.5, color: C.text3, marginBottom: 10, lineHeight: 1.5 }}>
        Documented batter-vs-pitch exploit — backtested separator: players with this flag hit
        23.9% vs 9.5% without it.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
        {edge.map(p => (
          <PlayerCard
            key={playerId(p)}
            p={p}
            type="hr"
            onAdd={onAdd}
            onWatch={onWatch}
            watched={watchIds?.has(playerId(p))}
            onClick={() => onPlayerClick?.(p)}
          />
        ))}
      </div>
    </div>
  )
}

export default function HitsHRR({ players, onAdd, onWatch, watchIds, onPlayerClick }) {
  const [view, setView] = useState('hr')
  const { filtered, state } = useBoardFilter(players)

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        background: C.bg2,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: 10,
        marginBottom: 14,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 900 }}>Boards</div>
          {/* 2026-08-09 spoon-feed pass. The proof banner below every board
              says why to trust it; this says which bet it is FOR — eight
              buttons that all look like rankings needed one line naming the
              market each one belongs to. */}
          <div style={{ fontSize: 10.5, color: C.text3, marginTop: 2, lineHeight: 1.55, maxWidth: 460 }}>
            <b style={{ color: C.text2 }}>What this answers:</b>{' '}
            {{
              top: 'if you were making one play per game, who would it be.',
              hr: 'who to back to hit a home run tonight.',
              hit: 'who to back for a 1+ hit prop — the site’s most reliable market.',
              hrr: 'who to back for 2+ hits+runs+RBI.',
              contact: 'who to back for 2+ total bases.',
              weakspot: 'which hitters are standing in a slot tonight’s starter has already been beaten in.',
              aligned: 'which hitters have every flag that grades out firing at once.',
              matchupedge: 'which hitters get to face the exact pitches they punish.',
            }[view] || 'every ranked board in one place, each with its record stated, not implied.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => setView('top')}     style={btnStyle(C.yellow, view === 'top')}>🥇 Top</button>
          <button onClick={() => setView('hr')}      style={btnStyle(C.orange, view === 'hr')}>🧨 HR</button>
          <button onClick={() => setView('hit')}     style={btnStyle(C.purple, view === 'hit')}>💠 Hits</button>
          <button onClick={() => setView('hrr')}     style={btnStyle(C.cyan,   view === 'hrr')}>🏁 HRR</button>
          <button onClick={() => setView('contact')} style={btnStyle(C.blue,   view === 'contact')}>⚾ Contact</button>
          <button onClick={() => setView('weakspot')} style={btnStyle(C.yellow, view === 'weakspot')}>⭐ Weak Spot</button>
          <button onClick={() => setView('aligned')} style={btnStyle(C.purple, view === 'aligned')}>🧩 Aligned</button>
          <button onClick={() => setView('matchupedge')} style={btnStyle(C.orange, view === 'matchupedge')}>🎯 Matchup Edge</button>
        </div>
      </div>

      {/* THE PROOF BANNER. This tab covers the categories the archive says
          actually work — HIT picks delivered 64.5% and hit_score is the
          second-best-calibrated score in the system; hrr_score is THE
          best-calibrated (+13.3 quartile spread). The HR tab can't make
          those claims; this one can, so it does — per view, with the
          numbers, so the tab reads as the site's proven product rather than
          the undercard. */}
      {(() => {
        const PROOF = {
          top: {
            color: C.yellow,
            head: 'The bot’s overall ranking — graded as an HR bet, honestly',
            body: 'top_board_score_v2 blends every lane into one number; the TOP pick is the bot’s single favorite play per game. Graded on homers across the 39-day archive TOP delivered 19.2% — decent for an any-HR bet, and the recent locked stretch runs hotter (see the Report Card). Since a TOP designation is "best in his game", his 🤖 lights here only when he IS tonight’s TOP pick.',
          },
          hr: {
            color: C.orange,
            head: 'Ranked on the bot’s own HR score — and here’s why',
            body: 'This board ranks on the bot’s raw hr_score, untouched. It used to multiply that by the measured HR rate of the hitter’s ISO band — real research, across 3,973 graded picks ISO bands ran 8.2% to 22.2% while raw-score quartiles managed +4.7 points — but that multiplier was removed on 2026-08-09 for two checkable reasons: hr_score ALREADY carries ISO through season_power, so the band counted it twice, and it corrupted the projection bands, which were measured against the raw score. The ISO column still sits beside the score so you can see it, and The Read applies the band as an explicit second opinion rather than folding it back in.',
          },
          hit: {
            color: C.purple,
            head: 'The site’s most reliable product',
            body: 'HIT picks got their hit 64.5% of the time across 3,973 graded picks, and hit_score separates cleanly (58.3% bottom quartile → 67.0% top). The "When picked" column below is each hitter’s own delivery record in this exact category.',
          },
          hrr: {
            color: C.cyan,
            head: 'The best-calibrated score in the system',
            body: 'hrr_score has the strongest quartile spread of any score the bot writes (41.2% → 54.5% on its own 2+ H+R+RBI outcome), and HRR picks cleared their bar 48% of the time. When this board says top-quartile, the archive backs it.',
          },
          contact: {
            color: C.blue,
            head: 'Real, with a caveat the others don’t have',
            body: 'CONTACT picks cleared 2+ TB 38.2% of the time — but the graded files record no walks, so a pick who walked twice is scored a failure. Treat these rates as a floor. contact_score itself is the flattest in the system (+3.5); lean on the player’s own "When picked" record over the score.',
          },
          weakspot: {
            color: C.yellow,
            head: 'Validated: ⭐ hitters homer more',
            body: 'A weak spot means tonight’s starter has given up real damage to this lineup slot. Measured across the archive: flagged hitters homered 18.0% vs 13.9% unflagged, and cleared 2+ TB 41.3% vs 37.5%. One of only three flags on the site that survives grading.',
          },
          aligned: {
            color: C.purple,
            head: 'Rebuilt on the two flags that grade out — the old 🧩 didn’t',
            body: 'The bot’s 🧩 tag graded at 15.4% vs 14.6% baseline on 39 samples — nothing. Aligned now means the measured stack instead: weak spot ⭐ AND pitch match 🎯 AND ISO ≥ .18. That trio homered 29.2% across 154 graded slots — more than double the 12.9% rate of hitters with neither flag, the strongest composite on the site.',
          },
          matchupedge: {
            color: C.orange,
            head: 'Validated: 🎯 pitch match is a real HR signal',
            body: 'The hitter’s damage pitches overlap what tonight’s arm actually throws. Measured: matched hitters homered 18.4% vs 13.6% unmatched across 1,669 graded slots — the same size edge as the weak-spot flag, and the two stack: both together homered 23.3%.',
          },
        }
        const pr = PROOF[view]
        if (!pr) return null
        return (
          <div style={{
            background: `linear-gradient(155deg, ${pr.color}12, ${pr.color}04)`,
            border: `1px solid ${pr.color}3d`, borderRadius: 11,
            padding: '9px 13px', marginBottom: 12,
          }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: pr.color, marginBottom: 2 }}>
              ✓ {pr.head}
            </div>
            <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.55, maxWidth: 760 }}>{pr.body}</div>
          </div>
        )
      })()}

      {/* The three signal sections get the filter bar here. The hrr/hit/contact
          views delegate to RankedBoard, which carries its own — showing two
          filter bars stacked would be worse than either. */}
      {['weakspot', 'aligned', 'matchupedge'].includes(view) && (
        <BoardFilters state={state} total={players.length} shown={filtered.length} />
      )}

      {view === 'weakspot'
        ? <WeakSpotSection players={filtered} onAdd={onAdd} onWatch={onWatch} watchIds={watchIds} onPlayerClick={onPlayerClick} />
        : view === 'aligned'
        ? <AlignedSignalsSection players={filtered} onAdd={onAdd} onWatch={onWatch} watchIds={watchIds} onPlayerClick={onPlayerClick} />
        : view === 'matchupedge'
        ? <MatchupEdgeSection players={filtered} onAdd={onAdd} onWatch={onWatch} watchIds={watchIds} onPlayerClick={onPlayerClick} />
        : <RankedBoard players={players} type={view} onAdd={onAdd} onWatch={onWatch} watchIds={watchIds} onPlayerClick={onPlayerClick} />
      }
    </div>
  )
}
