'use client'
import { useMemo } from 'react'
import { nameOf, teamOf, oppOf, playerId, mlbId, clean, n } from '../../lib/player'
import { scoreFor, tierRole } from '../../lib/scoring'
import PlayerModal from '../PlayerModal'
import PlayerBoardFrame from '../players/PlayerBoardFrame'

// Player — the modal's contents as a real board.
//
// On the Streamlit side this exists because that framework had no modal at
// all. It's worth keeping here for the opposite reason: a modal is a bad place
// to sit and read for five minutes, and this is the tab you leave open while
// you work through one hitter.

// QUESTION CHIPS (2026-08-08, "more inquisitive"): the list used to answer
// exactly one question — who's top by HR score. Each chip is a question you'd
// otherwise dig for, using only fields already on the slate row.
const ASKS = [
  { key: 'bot',  label: '🤖 Bot picks', test: (p) => String(p?.game_pick_role || '').trim() !== '',
    why: 'Hitters the bot designated for one of tonight’s five pick slots' },
  { key: 'weak', label: '⭐ Weak spots', test: (p) => p?.weak_spot_flag === true,
    why: 'Batting in a lineup spot this starter has been beaten in' },
  { key: 'hot',  label: 'Hot L5', test: (p) => n(p?.last5_hits, 0) >= 6 || n(p?.last5_hr, 0) >= 2,
    why: '6+ hits or 2+ homers over his last five games' },
  { key: 'edge', label: '🎯 Pitch match', test: (p) => n(p?.pitch_type_match_score, 0) > 0,
    why: 'The model found a documented batter-vs-pitch exploit — the single largest graded separator' },
  { key: 'due',  label: '🔁 HR recently', test: (p) => n(p?.games_since_last_hr, 99) <= 2,
    why: 'Homered inside his last two games — the back-to-back chase' },
]

// The page itself is components/players/PlayerBoardFrame.js now (2026-09-30):
// the same layout, lifted so TUDDY and LAMP build their Players pages from it.
export default function PlayerBoard({ players, onAdd, onWatch, watchIds, odds = null }) {
  const ranked = useMemo(
    () => [...players].sort((a, b) => scoreFor(b, 'hr') - scoreFor(a, 'hr')),
    [players],
  )
  return (
    <PlayerBoardFrame
      rows={ranked}
      idOf={playerId}
      urlIdOf={mlbId}
      nameOf={nameOf}
      searchText={(p) => `${nameOf(p)} ${teamOf(p)} ${oppOf(p)}`}
      badgesOf={(p) => (<>
        {String(p?.game_pick_role || '').trim() && <span title="Bot pick tonight" style={{ fontSize: 9, marginLeft: 4 }}>🤖</span>}
        {p?.weak_spot_flag && <span title="Weak lineup spot vs this starter" style={{ fontSize: 9, marginLeft: 2 }}>⭐</span>}
      </>)}
      metaOf={(p) => <>{teamOf(p)} vs {oppOf(p)} · #{clean(p?.lineup_spot, '?')} · {clean(p?.pitcher_name, 'TBD')}</>}
      scoreOf={(p) => scoreFor(p, 'hr')}
      scoreTitle={(p) => `${tierRole(p)} · HR ${scoreFor(p, 'hr').toFixed(1)}`}
      asks={ASKS}
      renderDetail={(selected) => (
        // ONE HEADER, NOT TWO (2026-08-10, phone pass): the card's own header
        // is the page's header; Watch lives in the card's action row.
        <PlayerModal
          player={selected}
          inline
          onAdd={onAdd}
          onWatch={onWatch}
          watched={!!watchIds?.has(playerId(selected))}
          odds={odds}
        />
      )}
    />
  )
}
