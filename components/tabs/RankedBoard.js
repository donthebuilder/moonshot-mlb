'use client'
import { useMemo, useState, useEffect } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { playerId, nameOf, teamOf, clean, nn, hrScore, hitScore, prodScore, tbScore, barrelRate, pitchMixScore, mlbId } from '../../lib/player'
import { scoreFor, isAligned, hrRank } from '../../lib/scoring'
import { useSetupHomers } from '../../lib/b2b'
import { Grid, Empty } from '../ui'
import PlayerCard from '../PlayerCard'
import Heatmap from '../Heatmap'
import BoardFilters, { useBoardFilter } from '../BoardFilters'
import { xpaFor, XPA_TITLE } from '../../lib/xpa'
import AltLooks from '../AltLooks'
import DenseTable from '../DenseTable'
import { heatModeFromUrl } from '../../lib/heatMode'

const TITLES = {
  top: ['Top Board', 'The bot’s overall #1s — ranked by its own top_board_score_v2, the number the Top-30 sheet sorts by, untouched by site adjustments'],
  hr:  ['HR Board',          'Tonight’s home run picks, ranked by the bot’s own HR score — with season ISO beside it, because the archive says power matters more than the score does'],
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
const ARCHIVE_CAT = { top: 'TOP', hr: 'HR', hit: 'HIT', hrr: 'HRR', tb: 'CONTACT', contact: 'CONTACT' }

export default function RankedBoard({ players, type = 'hr', onAdd, onWatch, watchIds, onPlayerClick, limit = 60, slateDate = null }) {
  // 🔁 PROVEN, NOT INFERRED. This column read `games_since_last_hr === 0`
  // directly, which lib/b2b.js exists to stop: the field means "he homered in
  // his most recent game", and on a slate rebuilt after the 12:05 window that
  // game is TODAY — so a hitter who went deep at lunchtime wore the encore
  // mark on tonight's board for the homer he had already hit. Five rounds of
  // that bug are written up in b2b.js; this board never adopted the fix.
  // No proof file, no mark.
  const { setupHr } = useSetupHomers(slateDate)
  const b2bIds = useMemo(() => (setupHr instanceof Set ? setupHr : null), [setupHr])
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

  // 🔒 SLATE-WIDE RANK for the HR board (2026-08-11, Donovan: "give me the
  // ranking on the hr board that will show me the order the players are in on
  // the results page. and don't change it ever again.")
  //
  // The # column was i+1 over the FILTERED list, so a team chip or a search
  // renumbered everyone and never matched Gone Yard, which ranks the whole
  // slate. For type='hr' the number now comes from hrRank() — the same single
  // source Gone Yard reads — computed over the FULL players prop before any
  // filter. Filtering can hide rows; it can no longer renumber them. A
  // filtered view showing #3, #7, #19 is telling the truth: those are their
  // real board positions. Enforced by scripts/check-rank-lock.mjs.
  const slateRank = useMemo(() => (type === 'hr' ? hrRank(players) : null), [players, type])

  return (
    <div>
      <BoardFilters state={state} total={players.length} shown={filtered.length} />
      {!ranked.length && <Empty text={state.active ? 'No hitters clear this filter.' : `No ${type.toUpperCase()} picks yet.`} />}
      {/* Section header — refreshed dress (2026-08-08, modest): the title
          wears the board's ember signature as a gradient underline, and the
          count moves into a pill. Structure unchanged — "I like the lead". */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 0,
        paddingBottom: 8,
        gap: 10, flexWrap: 'wrap',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-.02em' }}>{title}</span>
            <span style={{
              fontSize: 9, fontWeight: 800, fontFamily: NUM_FONT, color: C.orange,
              border: '1px solid rgba(249,115,22,.4)', background: 'rgba(249,115,22,.08)',
              borderRadius: 999, padding: '1px 9px',
            }}>{ranked.length} ranked</span>
          </div>
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
        </div>
      </div>
      {/* the ember underline — the same signature the top bar wears */}
      <div style={{
        height: 2, marginBottom: 10, borderRadius: 1,
        background: 'linear-gradient(90deg, #f97316, rgba(252,211,77,.5) 45%, transparent)',
      }} />

      {/* THE RANKED LIST — rank number first, then the exact score the sort
          uses, then why. "When picked" is his archive record in THIS
          category (3+ picks shows the fraction; the site never turns 1/1
          into 100%). "Best other" answers the cross-category question — is
          this hitter actually stronger somewhere else tonight. */}
      {viewMode === 'list' && (
        <DenseTable
            heatMode={heatModeFromUrl()}
          rows={ranked.map((p, i) => {
            const rec = recordOf(nameOf(p))
            const cats = { HR: hrScore(p), Hit: hitScore(p), HRR: prodScore(p), TB: tbScore(p) }
            const selfLabel = { top: 'HR', hr: 'HR', hit: 'Hit', hrr: 'HRR', tb: 'TB', contact: 'TB' }[type] || 'HR'
            const others = Object.entries(cats).filter(([k]) => k !== selfLabel)
            const best = others.sort((a, b) => b[1] - a[1])[0]
            const pick = String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()
            // 🤖 is category-strict (2026-08-06): on the HR board it lights
            // only for THE HR pick, on Hits only for THE HIT pick, and so on.
            // A HIT pick showing a robot on the HR board reads as an HR
            // endorsement the bot never made — that's how confidence gets
            // spent on the wrong bet.
            const wantRole = { top: 'TOP', hr: 'HR', hit: 'HIT', hrr: 'HRR', tb: 'CONTACT', contact: 'CONTACT' }[type]
            return {
              _key: `${playerId(p)}-${i}`,
              _raw: p,
              rank: slateRank ? (slateRank.get(mlbId(p)) ?? i + 1) : i + 1,
              name: nameOf(p),
              team: teamOf(p),
              facing: clean(p?.pitcher_name, 'TBD'),
              isPick: pick && pick === wantRole ? 1 : 0,
              otherPick: pick && pick !== wantRole ? pick : '',
              b2b: b2bIds && b2bIds.has(mlbId(p)) && !(Number(p?.games_since_last_hr) > 0) ? 1 : 0,
              weak: p?.weak_spot_flag ? 1 : 0,
              multiHit: p?.multi_hit_flag ? 1 : 0,
              aligned: isAligned(p) ? 1 : 0,
              edgeF: nn(p?.pitch_type_match_score) > 0 ? 1 : 0,
              adj: scoreFor(p, type),
              // Raw hr_score rides on EVERY category (2026-08-08, Donovan):
              // whatever board you're reading, the HR context is one glance
              // away — a HIT pick with a live 70 HR score is a different bet
              // than one at 30.
              ...(type === 'hr' ? { iso: nn(p?.season_iso) * 100 } : { hrRaw: hrScore(p) }),
              rec: rec ? (rec[1] >= 3 ? `${(100 * rec[0] / rec[1]).toFixed(0)}% (${rec[0]}/${rec[1]})` : `${rec[0]}/${rec[1]}`) : '—',
              recSort: rec && rec[1] >= 3 ? (100 * rec[0]) / rec[1] : null,
              bestOther: `${best[0]} ${best[1].toFixed(0)}`,
              bestOtherV: best[1],
              hrw: nn(p?.hrw_score),
              // audit #3 — lineup_spot verified in payload (Pairs/Games/Bot
              // already read it); xPA is a static league table, see lib/xpa.js
              xpa: xpaFor(p?.lineup_spot),
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
              title: `The bot's designated ${{ top: 'TOP', hr: 'HR', hit: 'HIT', hrr: 'HRR', tb: 'CONTACT', contact: 'CONTACT' }[type] || ''} pick tonight — THIS category's pick specifically, not any pick. A hitter picked in a different category shows in the Pick column instead.` },
            { key: 'otherPick', label: 'Pick', heat: false, w: 46, mono: true, dim: true,
              title: 'Picked tonight, but in a DIFFERENT category than this board — informational, not an endorsement here' },
            { key: 'b2b', label: '🔁', flag: true, mark: '↻', w: 28,
              title: 'Homered on the night that would set this up, PROVEN from that day\u2019s graded file — not inferred from a slate field that means \u201chis most recent game\u201d and can mean today. A heads-up, not a signal: B2Bs are folklore-grade, the score columns are the evidence.' },
            { key: 'weak',   label: '★', flag: true, mark: '★', w: 28,
              title: ['hr', 'hrr'].includes(type)
                ? 'Weak spot — validated on HR outcomes: flagged hitters homered 18.0% vs 13.9%'
                : 'Weak spot — an HR-validated signal (18.0% vs 13.9% HR). Shown for context on this board; it was not measured on this category\'s outcome.' },
            { key: 'multiHit', label: '2️⃣', flag: true, mark: '2️⃣', w: 30,
              title: 'Multi-hit look — real contact skill (average, BABIP, K-rate, recent hit volume), lineup spot for actual at-bat volume, and a pitcher who\'s been hit hard this year (WHIP, AVG/OBP/BABIP allowed). New as of 2026-08-13 — unlike ★ weak spot, this hasn\'t been graded against the archive yet, so read it as a reasoned first cut, not a proven one.' },
            { key: 'aligned', label: '🧩', flag: true, mark: '◆', w: 28,
              title: ['hr', 'hrr'].includes(type)
                ? 'Aligned — weak spot + pitch match + ISO ≥ .18. The measured stack: 29.2% HR across 154 graded slots'
                : 'Aligned — the HR-validated stack (29.2% HR). Context here, not proof: it was measured on homers, not this category.' },
            { key: 'edgeF', label: '🎯', flag: true, mark: '●', w: 28,
              title: ['hr', 'hrr'].includes(type)
                ? 'Pitch match — his damage pitches overlap tonight\'s arsenal: 18.4% vs 13.6% HR, and it stacks with ★ (23.3% together)'
                : 'Pitch match — HR-validated (18.4% vs 13.6%). Context on this board, not category proof.' },
            // 'Adj' and 'Raw' were two columns showing the same hitter before
            // and after the site's ISO adjustment. The site ranks on the bot's
            // raw score now (2026-08-09, see lib/scoring.js), so they'd print
            // identical numbers side by side — one column, named for what it
            // is. ISO keeps its own column: the audit's finding is real and
            // now it's VISIBLE next to the score instead of folded silently
            // into it.
            { key: 'adj',    label: type === 'hr' ? 'HR score' : 'Score', w: 56, dp: 1, primary: true,
              title: type === 'hr'
                ? 'The bot’s own HR score — the number this board is ranked by. Read the ISO column beside it: across 3,973 graded picks the sub-.130 ISO band homered 8.2% and the .230+ band 22.2%, so a big score on thin power is the board’s most common trap.'
                : 'The score this board is ranked by' },
            ...(type !== 'hr' ? [
              { key: 'hrRaw', label: 'HR sc', w: 48, dp: 1,
                title: 'The bot’s HR score, for context on every board — this column never ranks here, but a high number means the power lane is live for him tonight too' },
            ] : []),
            ...(type === 'hr' ? [
              { key: 'iso', label: 'ISO', w: 42, dp: 0, primary: true,
                title: 'Season ISO ×100 — slugging minus batting average, so it measures extra-base pop with the singles stripped out. Across the graded archive, sub-13 homered 8.2% and 23+ homered 22.2%. Read it WITH the score, not instead of it.' },
            ] : []),
            { key: 'rec',    label: 'When picked', heat: false, w: 82, mono: true,
              title: `His archive record when the bot designated him in this category — a rate at 3+ picks, a raw fraction under that. From ${'3,973'} graded picks over 39 days.` },
            { key: 'bestOther', label: 'Best other', heat: false, w: 66, mono: true, dim: true,
              title: 'His strongest OTHER category tonight — if this number dwarfs his score here, he might be the wrong kind of bet' },
            { key: 'hrw',    label: 'HRW', w: 44, dp: 0, primary: true },
            { key: 'xpa',    label: 'xPA', w: 44, dp: 2, title: XPA_TITLE },
            { key: 'l5',     label: 'L5', heat: false, w: 58, mono: true, dim: true },
            { key: 'hr9',    label: 'P HR/9', w: 50, dp: 2 },
          ]}
          onRowClick={onPlayerClick}
          initialSort={type === 'hr' ? 'raw' : null}
          maxHeight={520}
          caption={`Ranked by ${type === 'hr' ? 'the bot’s own HR score, with ISO beside it — the archive says a big score on thin power is the board’s most common trap' : 'the category score'}. "When picked" is the archive speaking: what he actually did the other times the bot designated him here. Click any header to re-sort; the # column always gets you back to the board's own order.`}
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
            // THE RANKING NUMBER LEADS. The chart's first column has to be the
            // one the board sorts by, or the rows look out of order — which is
            // exactly what happened the first time this led with a different
            // number than the sort key. That number is the bot's HR score;
            // ISO sits beside it as the thing to read WITH it, not as a
            // multiplier folded into it.
            ...(type === 'hr'
              ? { HR: scoreFor(p, 'hr') }
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
          'HR',
          'ISO', 'Hit', 'HRR', 'TB', 'HRW', 'DC', 'PMix', 'Barrel', 'P HR/9',
        ]}
        title={type === 'hr'
          ? 'Top 15 by HR score — full profile'
          : `Top 15 by ${title.replace(' Board', '')} — full profile`}
        labelWidth={140}
        onRowClick={onPlayerClick ? (r) => onPlayerClick(r._raw) : null}
        caption={type === 'hr'
          ? 'Sorted by HR score, the first column. Read the ISO column with it: across 3,973 graded picks the sub-.130 ISO band homered 8.2% and the .230+ band 22.2%, while the score itself barely separated — so a big score on thin power is the board’s most common trap. Both are shown so you can see it yourself rather than have it applied for you.'
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
