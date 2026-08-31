'use client'
import { useMemo, useState, useEffect } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { playerId, nameOf, teamOf, clean, nn, hrScore, hitScore, prodScore, tbScore, barrelRate, pitchMixScore, mlbId } from '../../lib/player'
import { scoreFor, isAligned, hrRank } from '../../lib/scoring'
import { useSetupHomers } from '../../lib/b2b'
import { Grid, Empty } from '../ui'
import PlayerCard from '../PlayerCard'
import ProfileBars from '../ProfileBars'
import BoardFilters, { useBoardFilter } from '../BoardFilters'
import { xpaFor, XPA_TITLE } from '../../lib/xpa'
import AltLooks from '../AltLooks'
import DenseTable from '../DenseTable'
import { heatModeFromUrl } from '../../lib/heatMode'
import { uniqueByPerson, gameNumbers, gameNumOf, doubleheaderNote } from '../../lib/doubleheader'
import { SCORE } from '../../lib/scales'
import { downloadBoardCard } from '../shareCard'

// The nine inputs the old profile grid drew as columns. They are not drawn
// now — they are tested against the slate and surface only where a hitter is
// actually away from the middle. Each carries its OWN formatter, because the
// whole complaint about the grid was that it rescaled values to fit a shared
// ramp: .231 became 23 and 1.22 became 37.
//
// `invert: true` would mark an input where LOW is good for the bat. Nothing
// here is: every one of these reads "more is better for the hitter", Arm HR9
// included — a starter who gives up home runs is a gift, not a warning.
//
// Caught in render on 2026-08-31, which is why the note is here: Arm HR9 was
// tagged invert on the reasoning that "low HR/9 is a good pitcher", and the
// chip came back "▼ Arm HR9 2.16" on Cal Raleigh — a red down-arrow on the
// single most homer-friendly arm on the slate. The flag answers "is more
// better FOR THE BAT", not "is more better for the man throwing it".
const pctFmt = (v) => `${(v * 100).toFixed(1)}%`
const isoFmt = (v) => String(v.toFixed(3)).replace(/^0/, '')
const scoreFmt = (v) => v.toFixed(0)
const PROFILE_INPUTS = [
  { key: 'iso', label: 'ISO', fmt: isoFmt, title: 'Season isolated power — slugging minus average, so it is extra-base ability with singles removed.' },
  { key: 'barrel', label: 'Barrel', fmt: pctFmt, title: 'Recent barrel rate: the share of batted balls at the speed-and-angle combination that produces extra bases.' },
  { key: 'hrw', label: 'HRW', fmt: scoreFmt, title: "The HR score with tonight's park and weather folded in." },
  { key: 'dc', label: 'DC', fmt: scoreFmt, title: 'Damage conversion — how much of his hard contact becomes extra bases rather than loud outs.' },
  { key: 'pmix', label: 'PMix', fmt: scoreFmt, title: "How well his swing matches the arsenal he is facing tonight." },
  { key: 'hit', label: 'Hit', fmt: scoreFmt, title: 'The 1+ hit model score.' },
  { key: 'hrr', label: 'HRR', fmt: scoreFmt, title: 'The H+R+RBI production score.' },
  { key: 'tb', label: 'TB', fmt: scoreFmt, title: 'The total-bases score.' },
  { key: 'phr9', label: 'Arm HR9', fmt: (v) => v.toFixed(2), title: "Home runs allowed per nine by tonight's starter. Read it from the bat's side: a HIGH number is the good one here, because it is the arm most likely to give this up." },
]

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

export default function RankedBoard({ players, type = 'hr', onAdd, onWatch, watchIds, onPlayerClick, limit = 60, slateDate = null, filterState = null, setupHomers }) {
  // 🔁 PROVEN, NOT INFERRED. This column read `games_since_last_hr === 0`
  // directly, which lib/b2b.js exists to stop: the field means "he homered in
  // his most recent game", and on a slate rebuilt after the 12:05 window that
  // game is TODAY — so a hitter who went deep at lunchtime wore the encore
  // mark on tonight's board for the homer he had already hit. Five rounds of
  // that bug are written up in b2b.js; this board never adopted the fix.
  // No proof file, no mark.
  // useSetupHomers returns the BARE value — a Set once proven, null when it
  // can't check, undefined while loading. The first ship destructured it
  // ({ setupHr }) as if it returned an object, which is undefined.setupHr →
  // a TypeError on first paint, and the entire Boards tab died. Found in
  // production 2026-08-15, on the one tab the render harness never visited;
  // it visits all of them now (scripts/check-render note below).
  const ownSetupHr = useSetupHomers(setupHomers === undefined ? slateDate : null)
  const setupHr = setupHomers === undefined ? ownSetupHr : setupHomers
  const b2bIds = useMemo(() => (setupHr instanceof Set ? setupHr : null), [setupHr])
  const [title, sub] = TITLES[type] || TITLES.hr
  // filterState: when the owning tab lifts the filter bar (so it survives a
  // lens switch instead of resetting), it hands down its own {filtered,
  // state} pair here. useBoardFilter is still called unconditionally below
  // (React's rules of hooks — no calling a hook only on some renders); its
  // result is just ignored when a filterState prop won the pick. That keeps
  // every OTHER mount of this board (there are several) working exactly as
  // before, unchanged, with no filterState prop at all.
  const ownFilter = useBoardFilter(players)
  const { filtered, state } = filterState || ownFilter
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

  // ── THE DOUBLEHEADER, ON THIS LIST TOO (2026-08-17) ────────────────────────
  // The G column shipped to the Scoreboard and HitterHeat and MISSED this
  // board — which is the one Donovan reads. His screenshot shows Alec Burleson
  // twice, both rows numbered "10", the only difference being the Facing column
  // (Rhett Lowder vs Kent Emanuel) and a reader would have to know the pitchers
  // to spot it. Both rows are real and neither is a duplicate; the rank is his
  // slate rank, which is genuinely the same in both games.
  const dh = useMemo(() => gameNumbers(players), [players])
  const dhNote = useMemo(() => doubleheaderNote(players), [players])

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
          {/* 📸 SHARE (2026-08-23) — this board as a PNG, zero backend, same
              canvas mechanism as the Watchlist/Player share cards. */}
          {ranked.length > 0 && (
            <button onClick={() => downloadBoardCard(ranked, { title, sub, type, scoreOf: (p) => scoreFor(p, type) })}
              title="Download this board as a PNG for posting"
              aria-label="Download board as image"
              style={{
                padding: '4px 11px', fontSize: 10.5, fontWeight: 700, borderRadius: 7, cursor: 'pointer',
                border: `1px solid ${C.border}`, background: 'rgba(249,115,22,.10)', color: C.orange,
              }}>📸</button>
          )}
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
      {/* One line, only on a doubleheader slate. Empty string otherwise. */}
      {dhNote && (
        <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.6, maxWidth: 800, marginBottom: 8 }}>
          ⚾⚾ {dhNote}
        </div>
      )}

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
              _key: `${playerId(p)}-${p?.game_pk ?? ''}-${i}`,
              _raw: p,
              rank: slateRank ? (slateRank.get(mlbId(p)) ?? i + 1) : i + 1,
              name: nameOf(p),
              team: teamOf(p),
              g: gameNumOf(p, dh),
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
            // Only present when a matchup actually repeats tonight.
            ...(dh.size ? [{ key: 'g', label: 'G', heat: false, w: 28, mono: true, dim: true,
              fmt: (v) => (v ? `G${v}` : '—'),
              title: 'Which game of a doubleheader. G1 is the earlier first pitch. A hitter whose team plays twice appears once per game and both rows are real — his board rank is the same in both.' }] : []),
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
            { key: 'adj',    label: type === 'hr' ? 'HR score' : 'Score', w: 56, dp: 1, ...SCORE, primary: true,
              title: type === 'hr'
                ? 'The bot’s own HR score — the number this board is ranked by. Read the ISO column beside it: across 3,973 graded picks the sub-.130 ISO band homered 8.2% and the .230+ band 22.2%, so a big score on thin power is the board’s most common trap.'
                : 'The score this board is ranked by' },
            ...(type !== 'hr' ? [
              { key: 'hrRaw', label: 'HR sc', w: 48, dp: 1, ...SCORE,
                title: 'The bot’s HR score, for context on every board — this column never ranks here, but a high number means the power lane is live for him tonight too' },
            ] : []),
            ...(type === 'hr' ? [
              { key: 'iso', label: 'ISO', w: 42, dp: 0, primary: true,
                title: 'Season ISO ×100 — slugging minus batting average, so it measures extra-base pop with the singles stripped out. Across the graded archive, sub-13 homered 8.2% and 23+ homered 22.2%. Read it WITH the score, not instead of it.' },
            ] : []),
            { key: 'rec',    label: 'When picked', heat: false, w: 82, mono: true,
              title: `His archive record when the bot designated him in this category — a rate at 3+ picks, a raw fraction under that. From 5,184 judgeable picks over 62 graded nights (2026-08-15 sweep).` },
            { key: 'bestOther', label: 'Best other', heat: false, w: 66, mono: true, dim: true,
              title: 'His strongest OTHER category tonight — if this number dwarfs his score here, he might be the wrong kind of bet' },
            { key: 'hrw',    label: 'HRW', w: 44, dp: 0, ...SCORE, primary: true },
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
      {/* TOP 15 MEANS 15 DIFFERENT MEN (2026-08-17). On a doubleheader slate
          `ranked` carries a hitter twice, so slice(0,15) spent two rows on Alec
          Burleson with identical numbers — a Top 15 that is really a top 14,
          under a heading that says 15. uniqueByPerson collapses to one row per
          man and tags how many games he has, so the fact survives as "2×"
          rather than as a wasted slot. The FULL board below keeps both rows;
          there the two games are the point and the G column separates them. */}
      {/* ── THE PROFILE HEATMAP IS GONE (2026-08-31) ──────────────────────
          Donovan: "i just dont like them any more how that style is ypu can
          just get rid of it or eopl with something more usful."

          The grid told on itself. Its caption read "Each column is scaled on
          its own... not comparable across columns" — a chart admitting its
          only visual variable does not mean one thing. It also had to distort
          numbers to hold its shape: ISO ×100 and pitcher HR/9 ×30, purely so
          they would land near the 0-100 scores. A grid where .231 prints as
          23 has stopped showing you your data.

          Same ten inputs, restated: one shared 0-100 bar for the number the
          board actually sorts by (so length is finally comparable), and the
          other nine tested rather than drawn — a hitter's row names only the
          inputs where he is genuinely away from the middle of tonight's slate,
          in their own real units. See components/ProfileBars.js.

          Baselines come from the WHOLE ranked pool, not the fifteen shown: the
          top fifteen of a board are the tail, and asking the tail what normal
          looks like is how you end up with every row flagged. */}
      {viewMode === 'cards' && <ProfileBars
        rows={uniqueByPerson(ranked).map((p) => ({
          id: playerId(p),
          label: p?._slateGames > 1 ? `${nameOf(p)} · ${p._slateGames}×` : nameOf(p),
          _raw: p,
          score: scoreFor(p, type),
          values: {
            iso: nn(p?.season_iso),
            hit: hitScore(p),
            hrr: prodScore(p),
            tb: tbScore(p),
            hrw: nn(p?.hrw_score),
            dc: nn(p?.damage_conversion_score),
            pmix: pitchMixScore(p),
            barrel: barrelRate(p),
            phr9: nn(p?.pitcher_hr9),
          },
        }))}
        inputs={PROFILE_INPUTS}
        scoreLabel={type === 'hr' ? 'the bot’s HR score' : `the board’s ${title.replace(' Board', '')} score`}
        title={type === 'hr'
          ? 'Top 15 by HR score — what separates them'
          : `Top 15 by ${title.replace(' Board', '')} — what separates them`}
        caption={type === 'hr'
          ? 'Read ISO with the score especially: across 3,973 graded picks the sub-.130 ISO band homered 8.2% and the .230+ band 22.2%, while the score itself barely separated — so a big score on thin power is the board’s most common trap, and it is exactly the kind of thing a ▼ ISO chip is here to say out loud.'
          : undefined}
        onRowClick={onPlayerClick ? (r) => onPlayerClick(r._raw) : null}
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
