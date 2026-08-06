'use client'
import { useMemo, useState, useEffect } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { playerId, nameOf, teamOf, clean, nn, hrScore, hitScore, prodScore, tbScore, barrelRate, pitchMixScore } from '../../lib/player'
import { scoreFor, isAligned } from '../../lib/scoring'
import { Grid, Empty } from '../ui'
import PlayerCard from '../PlayerCard'
import Heatmap from '../Heatmap'
import BoardFilters, { useBoardFilter } from '../BoardFilters'
import AltLooks from '../AltLooks'
import DenseTable from '../DenseTable'

const TITLES = {
  hr:  ['HR Board',          'Top home run picks — ranked ISO-adjusted: raw score × measured HR rate of the hitter’s ISO band (8.2% low to 22.2% high, from 3,973 graded picks)'],
  hrr: ['HRR Board',         'Top runs + RBI picks'],
  hit: ['Hits Board',        'Top base-hit picks'],
  tb:  ['Total Bases Board', 'Top contact / total-base picks'],
  longest: ['Longest Board', 'Ranked on longest-HR score — who hits it furthest, not most often'],
  due: ['Due Board', 'Overdue for a homer: high due score, long gap since the last one'],
}

// The 39-day archive snapshot, fetched once per session and shared by every
// board instance — it feeds the "when picked" column that tells you whether a
// hitter actually delivers on this category when the bot designates him.
let _matrixPromise = null
function fetchMatrix() {
  if (!_matrixPromise) {
    _matrixPromise = fetch('/pick_matrix.json')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
  }
  return _matrixPromise
}
// Which archive category answers for each board type.
const ARCHIVE_CAT = { hr: 'HR', hit: 'HIT', hrr: 'HRR', tb: 'CONTACT', contact: 'CONTACT' }

export default function RankedBoard({ players, type = 'hr', onAdd, onWatch, watchIds, onPlayerClick, limit = 60 }) {
  const [title, sub] = TITLES[type] || TITLES.hr
  const { filtered, state } = useBoardFilter(players)
  // LIST IS THE DEFAULT (2026-08-04). The card grid is pretty but ranking-
  // opaque — nothing on it says who's #4 vs #14, which made "where is this
  // player ranked" a real complaint. The list leads with the rank number and
  // the exact score the sort uses; cards stay one click away.
  const [viewMode, setViewMode] = useState('list')
  const [matrix, setMatrix] = useState(null)

  useEffect(() => {
    let alive = true
    fetchMatrix().then((m) => { if (alive) setMatrix(m) })
    return () => { alive = false }
  }, [])

  // name -> "ok/n" record in this board's archive category (3+ picks shows
  // a rate, under that stays a raw fraction — same rule as Track record).
  const recordOf = useMemo(() => {
    const cat = ARCHIVE_CAT[type]
    if (!matrix || !cat) return () => null
    const m = new Map()
    matrix.players.forEach((p) => {
      const cell = p.c?.[cat]
      if (cell) m.set(String(p.n || '').toLowerCase().trim(), cell)
    })
    return (name) => m.get(String(name || '').toLowerCase().trim()) || null
  }, [matrix, type])

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
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setViewMode('list')} style={{
            padding: '4px 11px', fontSize: 10.5, fontWeight: 700, borderRadius: 7, cursor: 'pointer',
            border: `1px solid ${viewMode === 'list' ? C.orange : C.border}`,
            background: viewMode === 'list' ? 'rgba(249,115,22,.12)' : 'transparent',
            color: viewMode === 'list' ? C.orange : C.text3,
          }}>☰ List</button>
          <button onClick={() => setViewMode('cards')} style={{
            padding: '4px 11px', fontSize: 10.5, fontWeight: 700, borderRadius: 7, cursor: 'pointer',
            border: `1px solid ${viewMode === 'cards' ? C.orange : C.border}`,
            background: viewMode === 'cards' ? 'rgba(249,115,22,.12)' : 'transparent',
            color: viewMode === 'cards' ? C.orange : C.text3,
          }}>▦ Cards</button>
          <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{ranked.length} players</span>
        </div>
      </div>

      {/* THE RANKED LIST — rank number first, then the exact score the sort
          uses, then why. "When picked" is his archive record in THIS
          category (3+ picks shows the fraction; the site never turns 1/1
          into 100%). "Best other" answers the cross-category question — is
          this hitter actually stronger somewhere else tonight. */}
      {viewMode === 'list' && (
        <DenseTable
          rows={ranked.map((p, i) => {
            const rec = recordOf(nameOf(p))
            const cats = { HR: hrScore(p), Hit: hitScore(p), HRR: prodScore(p), TB: tbScore(p) }
            const selfLabel = { hr: 'HR', hit: 'Hit', hrr: 'HRR', tb: 'TB', contact: 'TB' }[type] || 'HR'
            const others = Object.entries(cats).filter(([k]) => k !== selfLabel)
            const best = others.sort((a, b) => b[1] - a[1])[0]
            const pick = String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()
            // 🤖 is category-strict (2026-08-06): on the HR board it lights
            // only for THE HR pick, on Hits only for THE HIT pick, and so on.
            // A HIT pick showing a robot on the HR board reads as an HR
            // endorsement the bot never made — that's how confidence gets
            // spent on the wrong bet.
            const wantRole = { hr: 'HR', hit: 'HIT', hrr: 'HRR', tb: 'CONTACT', contact: 'CONTACT' }[type]
            return {
              _key: `${playerId(p)}-${i}`,
              _raw: p,
              rank: i + 1,
              name: nameOf(p),
              team: teamOf(p),
              facing: clean(p?.pitcher_name, 'TBD'),
              isPick: pick && pick === wantRole ? 1 : 0,
              otherPick: pick && pick !== wantRole ? pick : '',
              weak: p?.weak_spot_flag ? 1 : 0,
              aligned: isAligned(p) ? 1 : 0,
              edgeF: nn(p?.pitch_type_match_score) > 0 ? 1 : 0,
              adj: scoreFor(p, type),
              ...(type === 'hr' ? { raw: hrScore(p), iso: nn(p?.season_iso) * 100 } : {}),
              rec: rec ? (rec[1] >= 3 ? `${(100 * rec[0] / rec[1]).toFixed(0)}% (${rec[0]}/${rec[1]})` : `${rec[0]}/${rec[1]}`) : '—',
              recSort: rec && rec[1] >= 3 ? (100 * rec[0]) / rec[1] : null,
              bestOther: `${best[0]} ${best[1].toFixed(0)}`,
              bestOtherV: best[1],
              hrw: nn(p?.hrw_score),
              l5: `${nn(p?.last5_hits)}H/${nn(p?.last5_hr)}HR`,
              hr9: nn(p?.pitcher_hr9),
            }
          })}
          columns={[
            { key: 'rank',   label: '#', heat: false, w: 34, mono: true, dim: true,
              title: 'His rank on this board — the thing the cards never showed' },
            { key: 'name',   label: 'Player', heat: false, w: 150, bold: true, sticky: true },
            { key: 'team',   label: 'Tm', heat: false, w: 34, mono: true, dim: true },
            { key: 'facing', label: 'Facing', heat: false, w: 116, dim: true },
            { key: 'isPick', label: '🤖', flag: true, mark: '●', w: 30,
              title: `The bot's designated ${{ hr: 'HR', hit: 'HIT', hrr: 'HRR', tb: 'CONTACT', contact: 'CONTACT' }[type] || ''} pick tonight — THIS category's pick specifically, not any pick. A hitter picked in a different category shows in the Pick column instead.` },
            { key: 'otherPick', label: 'Pick', heat: false, w: 46, mono: true, dim: true,
              title: 'Picked tonight, but in a DIFFERENT category than this board — informational, not an endorsement here' },
            { key: 'weak',   label: '★', flag: true, mark: '★', w: 28,
              title: ['hr', 'hrr'].includes(type)
                ? 'Weak spot — validated on HR outcomes: flagged hitters homered 18.0% vs 13.9%'
                : 'Weak spot — an HR-validated signal (18.0% vs 13.9% HR). Shown for context on this board; it was not measured on this category\'s outcome.' },
            { key: 'aligned', label: '🧩', flag: true, mark: '◆', w: 28,
              title: ['hr', 'hrr'].includes(type)
                ? 'Aligned — weak spot + pitch match + ISO ≥ .18. The measured stack: 29.2% HR across 154 graded slots'
                : 'Aligned — the HR-validated stack (29.2% HR). Context here, not proof: it was measured on homers, not this category.' },
            { key: 'edgeF', label: '🎯', flag: true, mark: '●', w: 28,
              title: ['hr', 'hrr'].includes(type)
                ? 'Pitch match — his damage pitches overlap tonight\'s arsenal: 18.4% vs 13.6% HR, and it stacks with ★ (23.3% together)'
                : 'Pitch match — HR-validated (18.4% vs 13.6%). Context on this board, not category proof.' },
            { key: 'adj',    label: type === 'hr' ? 'Adj' : 'Score', w: 50, dp: 1,
              title: type === 'hr'
                ? 'The number this board is ranked by: raw score × his ISO band’s measured HR rate'
                : 'The score this board is ranked by' },
            ...(type === 'hr' ? [
              { key: 'raw', label: 'Raw', w: 44, dp: 1, title: 'The bot’s unadjusted hr_score' },
              { key: 'iso', label: 'ISO', w: 42, dp: 0,
                title: 'Season ISO ×100 — sub-13 homered 8.2% across the archive, 23+ homered 22.2%' },
            ] : []),
            { key: 'rec',    label: 'When picked', heat: false, w: 82, mono: true,
              title: `His archive record when the bot designated him in this category — a rate at 3+ picks, a raw fraction under that. From ${'3,973'} graded picks over 39 days.` },
            { key: 'bestOther', label: 'Best other', heat: false, w: 66, mono: true, dim: true,
              title: 'His strongest OTHER category tonight — if this number dwarfs his score here, he might be the wrong kind of bet' },
            { key: 'hrw',    label: 'HRW', w: 44, dp: 0 },
            { key: 'l5',     label: 'L5', heat: false, w: 58, mono: true, dim: true },
            { key: 'hr9',    label: 'P HR/9', w: 50, dp: 2 },
          ]}
          onRowClick={onPlayerClick}
          initialSort={null}
          maxHeight={520}
          caption={`Ranked by ${type === 'hr' ? 'Adj — the ISO-adjusted score, with Raw and ISO beside it so every rank is explainable' : 'the category score'}. "When picked" is the archive speaking: what he actually did the other times the bot designated him here. Click any header to re-sort; the # column always gets you back to the board's own order.`}
        />
      )}

      {/* The profile heatmap is the primary chart. A ranked column only says
          WHO is on top; the profile says WHY -- which input is actually
          carrying each name. The score is its first column, so the ranking
          isn't lost. Ported from the Streamlit build. */}
      {viewMode === 'cards' && <Heatmap
        rows={ranked.slice(0, 15).map((p) => ({
          label: nameOf(p),
          _raw: p,
          values: {
            // THE RANKING NUMBER LEADS ON THE HR BOARD. The board sorts by
            // the ISO-ADJUSTED score, and the first pass of this chart led
            // with the RAW bot score instead — so a raw-99 bat whose thin ISO
            // knocked him down sat below a raw-75 bat with a big ISO, and the
            // chart looked out of order (it was; the sort key just wasn't a
            // column). Adj is the exact number the sort uses; Raw and ISO
            // beside it are its two inputs, so each row reads as WHY he's
            // ranked there: Adj = Raw × his ISO band's measured HR rate.
            ...(type === 'hr'
              ? { Adj: scoreFor(p, 'hr'), Raw: hrScore(p) }
              : { HR: hrScore(p) }),
            // ISO ×100 so .231 reads as 23.
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
        columns={[
          ...(type === 'hr' ? ['Adj', 'Raw'] : ['HR']),
          'ISO', 'Hit', 'HRR', 'TB', 'HRW', 'DC', 'PMix', 'Barrel', 'P HR/9',
        ]}
        title={type === 'hr'
          ? 'Top 15 — ranked by Adj (raw score × measured ISO-band HR rate)'
          : `Top 15 by ${title.replace(' Board', '')} — full profile`}
        labelWidth={140}
        onRowClick={onPlayerClick ? (r) => onPlayerClick(r._raw) : null}
        caption={type === 'hr'
          ? 'Sorted by Adj, the first column — not by Raw. A raw 99 with a thin ISO can rank below a raw 75 with a big one, because across 3,973 graded picks the low-ISO band homered 8.2% and the high band 22.2% while the raw score barely separated. Raw and ISO are shown precisely so you can see what moved each name.'
          : undefined}
      />}

      {viewMode === 'cards' && (
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
      )}

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
