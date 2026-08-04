'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { playerId, nameOf, nn, hrScore, hitScore, prodScore, tbScore, barrelRate, pitchMixScore } from '../../lib/player'
import { scoreFor } from '../../lib/scoring'
import { Grid, Empty } from '../ui'
import PlayerCard from '../PlayerCard'
import Heatmap from '../Heatmap'
import BoardFilters, { useBoardFilter } from '../BoardFilters'
import AltLooks from '../AltLooks'

const TITLES = {
  hr:  ['HR Board',          'Top home run picks — ranked ISO-adjusted: raw score × measured HR rate of the hitter’s ISO band (8.2% low to 22.2% high, from 3,973 graded picks)'],
  hrr: ['HRR Board',         'Top runs + RBI picks'],
  hit: ['Hits Board',        'Top base-hit picks'],
  tb:  ['Total Bases Board', 'Top contact / total-base picks'],
  longest: ['Longest Board', 'Ranked on longest-HR score — who hits it furthest, not most often'],
  due: ['Due Board', 'Overdue for a homer: high due score, long gap since the last one'],
}

export default function RankedBoard({ players, type = 'hr', onAdd, onWatch, watchIds, onPlayerClick, limit = 60 }) {
  const [title, sub] = TITLES[type] || TITLES.hr
  const { filtered, state } = useBoardFilter(players)

  // Filter first, THEN rank and cut to the limit. Ranking first and filtering
  // after would only ever hide rows out of the same top 60 — the point of the
  // filter is to pull hitters up from below it.
  const ranked = useMemo(
    () => [...filtered].sort((a, b) => scoreFor(b, type) - scoreFor(a, type)).slice(0, limit),
    [filtered, type, limit],
  )

  return (
    <div>
      <BoardFilters state={state} total={players.length} shown={filtered.length} />
      {!ranked.length && <Empty text={state.active ? 'No hitters clear this filter.' : `No ${type.toUpperCase()} picks yet.`} />}
      {/* Section header — matches Games.js game header style */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
        paddingBottom: 8,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{title}</div>
          <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginTop: 2 }}>{sub}</div>
        </div>
        <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
          {ranked.length} players
        </div>
      </div>

      {/* The profile heatmap is the primary chart. A ranked column only says
          WHO is on top; the profile says WHY -- which input is actually
          carrying each name. The score is its first column, so the ranking
          isn't lost. Ported from the Streamlit build. */}
      <Heatmap
        rows={ranked.slice(0, 15).map((p) => ({
          label: nameOf(p),
          _raw: p,
          values: {
            // NO "Score" COLUMN. scoreFor(p, type) IS the column named after
            // the type — on the HR board, Score and HR were the same number
            // printed twice (87/87, 76/76, 75/75 straight down the board),
            // which reads as a coincidence rather than a duplicate and quietly
            // costs a column of width. The four category columns already carry
            // it; the board is sorted by the relevant one.
            HR: hrScore(p),
            // ISO ×100 so .231 reads as 23. This column is WHY the HR board's
            // order no longer matches raw HR score: ranking is ISO-adjusted
            // (see lib/scoring.js) because the archive showed ISO bands
            // running 8.2%→22.2% actual HR rate while score quartiles managed
            // +4.7 points. The two columns side by side let you see which
            // names the adjustment moved.
            ISO: nn(p?.season_iso) * 100,
            Hit: hitScore(p),
            HRR: prodScore(p),
            TB: tbScore(p),
            HRW: nn(p?.hrw_score),
            DC: nn(p?.damage_conversion_score),
            PMix: pitchMixScore(p),
            Barrel: barrelRate(p) * 100,
            // x30 to sit on the same visual scale as the score columns;
            // it's still scaled independently, so only the shape matters.
            'P HR/9': nn(p?.pitcher_hr9) * 30,
          },
        }))}
        columns={['HR', 'ISO', 'Hit', 'HRR', 'TB', 'HRW', 'DC', 'PMix', 'Barrel', 'P HR/9']}
        title={`Top 15 by ${title.replace(' Board', '')} — full profile`}
        labelWidth={140}
        onRowClick={onPlayerClick ? (r) => onPlayerClick(r._raw) : null}
      />

      <Grid>
        {ranked.map((p) => (
          <PlayerCard
            key={playerId(p)}
            p={p}
            type={type}
            onAdd={onAdd}
            onWatch={onWatch}
            watched={watchIds.has(playerId(p))}
            onClick={() => onPlayerClick?.(p)}
          />
        ))}
      </Grid>

      {/* ALT LOOKS — HR board only, mirroring where the bot prints it (under
          the Top 30 on the breakdown sheet). Excludes everyone ranked above
          so the section is genuinely "not already on the board". Uses the
          full unfiltered slate on purpose: the board filter narrows the board,
          but an alt look is by definition outside what you were looking at. */}
      {type === 'hr' && (
        <AltLooks
          players={players}
          boardIds={new Set(ranked.map(playerId))}
          onPlayerClick={onPlayerClick}
        />
      )}
    </div>
  )
}
