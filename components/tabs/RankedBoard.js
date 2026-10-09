'use client'
import { useMemo, useState, useEffect } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/theme'
import { playerId, nameOf, teamOf, clean, nn, hrScore, hitScore, prodScore, tbScore, barrelRate, pitchMixScore, mlbId } from '../../lib/player'
import { scoreFor, isAligned, hrRank } from '../../lib/scoring'
import { boardOrder } from '../../lib/boardOrder'
import { useSetupHomers } from '../../lib/b2b'
import { Grid, Empty } from '../ui'
import PlayerCard from '../PlayerCard'
import ProfileBars from '../ProfileBars'
import BoardFilters, { useBoardFilter } from '../BoardFilters'
import { xpaFor, XPA_TITLE } from '../../lib/xpa'
import AltLooks from '../AltLooks'
import DenseTable from '../DenseTable'
import { boardRow, boardRowContext, withBoardColumns, BOARD_GROUPS, applyColumnView, columnViewKey, COLUMN_VIEWS } from '../../lib/boardColumns'
import { heatModeFromUrl } from '../../lib/heatMode'
import { uniqueByPerson, gameNumbers, gameNumOf, doubleheaderNote } from '../../lib/doubleheader'
import { SCORE } from '../../lib/scales'
import { categoryColumns, categoryValues } from '../../lib/categoryColumns'
import { downloadBoardCard } from '../shareCard'
import { usePreview, ShowMoreButton } from '../ListPreview'
import { callStatus, boardOfRows } from '../../lib/callStatus'
import { reasonContext, boardReasonFor } from '../../lib/mlb/boardReason'
import { useWhySheet, whyColumn } from '../WhySheet'
import { ordinal } from '../../lib/format'

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
  { key: 'hrw', label: 'HRW', fmt: scoreFmt, title: "HR window: how his bat has looked lately. His last 20 plate appearances of contact (ideal home-run contact, barrels, 350 and 375 ft balls, hard-hit, exit velo, fly balls, pull, xwOBA) plus his last 5-7 games (home runs first, then extra-base hits), trusted more the more recent data there is. 0-88." },
  { key: 'dc', label: 'DC', fmt: scoreFmt, title: 'Damage conversion — how much of his hard contact becomes extra bases rather than loud outs.' },
  { key: 'pmix', label: 'PMix', fmt: scoreFmt, title: "How well his swing matches the arsenal he is facing tonight." },
  { key: 'hit', label: 'Hit', fmt: scoreFmt, title: 'The 1+ hit model score.' },
  { key: 'hrr', label: 'HRR', fmt: scoreFmt, title: 'The H+R+RBI production score.' },
  { key: 'tb', label: 'TB', fmt: scoreFmt, title: 'The total-bases score.' },
  { key: 'phr9', label: 'Arm HR9', fmt: (v) => v.toFixed(2), title: "Home runs allowed per nine by tonight's starter. Read it from the bat's side: a HIGH number is the good one here, because it is the arm most likely to give this up." },
]

const TITLES = {
  top: ['Top Board', 'MOONSHOT’s overall #1s — ranked by its own top_board_score_v2, the number the Top-30 sheet sorts by, untouched by site adjustments'],
  hr:  ['The Board',         'Every hitter tonight, #1 down — the HR score, season homers and season exit velocity averaged, because on the pregame record that order finds more homers than the score alone. The same order as the full board, the alerts and the tweet.'],
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

// Columns this board already draws under its own names, so the shared set
// skips them rather than printing HRW or the arm's HR/9 twice.
const CAT_OMIT = {
  default: ['hrw', 'pHR9', 'hrsc'],
  hr: ['hrw', 'pHR9', 'hrsc', 'iso'],
}
// RANKINGS (2026-10-07): the category set repeated nine columns the board's own groups already carry
// (L5 AVG, L10 AVG, Szn AVG, Pwr-3, HR L5 / L10, Park, Since HR ...), the same number twice under the same
// label. On Rankings the board's copy wins and the set keeps only what the board lacks. The rest of the
// set's columns land in the board's groups instead of one lump called "This board".
const CAT_DUPES = ['p3', 'hrL5', 'hrL10', 'a5', 'a10', 'aSzn', 'obp', 'iso', 'slg', 'k', 'spot', 'brl', 'ev', 'park', 'since', 'h5', 'pWHIP']
const CAT_GROUP = {
  hrBBE: 'season', maxEV: 'statcast', hard: 'statcast', aArm: 'hand', h10: 'form', xbh5: 'form', xbh10: 'form',
  rbi5: 'form', r5: 'form', pK: 'arm', hrsc: 'scores',
}

// RANKINGS (2026-10-06, the Boards + Rankings merge). `rankings` is this board dressed as the one
// Rankings page: its own title and subtitle, every hitter on The Board lens (no 60-row cut), the
// CALLED / ON THE BOARD stamp, and a Why on every row with the sheet behind it. `compact` is the phone:
// no title block (the page's one control row and subtitle sit above), no filter bar of its own, the
// share button under the table. `viewMode` / `onViewMode` let the page own the List / Cards switch.
const WHY_PARTS = [
  { key: 'hr', label: 'HR score', get: (p) => hrScore(p), text: (v) => v.toFixed(1) },
  { key: 'szn', label: 'Season home runs', get: (p) => (Number.isFinite(Number(p?.season_hr)) && p?.season_hr != null ? Number(p.season_hr) : null), text: (v) => `${Math.round(v)}` },
  { key: 'ev', label: 'Season exit velocity', get: (p) => (Number.isFinite(Number(p?.season_avg_ev)) && Number(p?.season_avg_ev) > 0 ? Number(p.season_avg_ev) : null), text: (v) => `${v.toFixed(1)} mph` },
]
// The Why sits right after the name and the call. Its own group, not the Call group: the phone folds
// every Call column into the name's sub-line, and a sentence has to stay a column you can tap.
const WHY_GROUP = { key: 'why', label: 'Why', order: 0.5 }
// where v sits among tonight's hitters, 0-100 (ties share their average place)
const pctAmong = (vals, v) => {
  if (!vals.length) return null
  const lt = vals.filter((x) => x < v).length
  const eq = vals.filter((x) => x === v).length
  return Math.round((100 * (lt + (eq + 1) / 2)) / vals.length)
}

export default function RankedBoard({ players, type = 'hr', onAdd, onWatch, watchIds, onPlayerClick, onOpenPitcher = null, limit = 60, slateDate = null, filterState = null, setupHomers, onOpenCard = null, rankings = false, compact = false, colsView = 'all', onColsView = null, slate = null, viewMode: viewProp = null, onViewMode = null }) {
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
  const [ownView, setOwnView] = useState('list')
  const viewMode = viewProp ?? ownView
  const setViewMode = onViewMode ?? setOwnView
  const catOmit = [...(CAT_OMIT[type] || CAT_OMIT.default), ...(rankings ? CAT_DUPES : [])]
  const whyOn = rankings && type === 'hr'
  // WHY: the sentence the player card already prints (lib/mlb/boardReason.js), ranked against the whole slate
  const whyPool = slate || players
  const rctx = useMemo(() => (whyOn ? reasonContext(whyPool) : null), [whyOn, whyPool])
  const partVals = useMemo(() => (whyOn
    ? Object.fromEntries(WHY_PARTS.map((c) => [c.key, whyPool.map((p) => c.get(p)).filter((v) => v != null)]))
    : null), [whyOn, whyPool])
  const { open: openWhy, sheet: whySheet } = useWhySheet({ theme: C, accent: C.orange, numFont: NUM_FONT })
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
  //
  // 2026-09-25: the HR board lists in the board order (lib/boardOrder.js --
  // the bot's board_rank), so the list reads top to bottom in the same order
  // the # column counts. The other boards still sort on their own score.
  const rowLimit = whyOn ? Number.MAX_SAFE_INTEGER : limit   // Rankings is every hitter, #1 to the bottom
  const ranked = useMemo(
    () => (type === 'hr'
      ? boardOrder(filtered).slice(0, rowLimit)
      : [...filtered].sort((a, b) => scoreFor(b, type) - scoreFor(a, type)).slice(0, rowLimit)),
    [filtered, type, rowLimit],
  )
  // the board's size the bot published (lib/callStatus boardOfRows), not this list's length
  const boardOf = useMemo(() => boardOfRows(whyPool) || whyPool.length, [whyPool])
  // the sheet for one row: his sentence, the three numbers his board place is made of, and where to look next
  const whyItem = (r) => {
    const p = r._raw
    const w = r._why || { why: [], watch: null }
    const id = mlbId(p)
    const parts = WHY_PARTS.map((c) => {
      const v = c.get(p)
      const pct = v == null ? null : pctAmong(partVals[c.key], v)
      return v == null ? null : { label: c.label, text: `${c.text(v)}${pct != null ? ` \u00b7 ${ordinal(pct)} percentile` : ''}`, pct }
    }).filter(Boolean)
    // the card on one of its tabs (the address then says p= and view=; Back closes the card)
    const card = (view, label) => ({ label, onClick: () => (onOpenCard ? onOpenCard(p, view) : onPlayerClick?.(p)) })
    return {
      name: nameOf(p), rank: r.rank,
      lead: `${w.why.length ? `${w.why.map((x) => x.text).join('. ')}. ` : ''}His place on the board is the average of his rank in these three.`,
      watch: w.watch ? `${w.watch.text}.` : null,
      parts,
      links: id ? [
        { label: 'His card: every number behind the score', onClick: () => onPlayerClick?.(p) },
        card('splits', 'Splits: head-to-head and situations'),
        card('ev', 'EV Log: how hard he has been hitting it'),
        card('spray', 'Spray: where he puts the ball'),
        card('pitcher', 'The arm he faces tonight'),
      ] : [{ label: 'His card: every number behind the score', onClick: () => onPlayerClick?.(p) }],
    }
  }

  // Cards view is opt-in (list is the default, see above) but still a real
  // wall once chosen -- up to `limit` (60) player cards with nothing
  // collapsed. Phase 1 simplify pass, 2026-09-11: same site-wide long-list
  // rule as the watchlist -- preview 5, "Show N more" the rest.
  const cardsPreview = usePreview(ranked, 5)

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
  // Slate-wide facts for the board columns, over the FULL players prop.
  const boardCtx = useMemo(() => boardRowContext(players, { watchIds }), [players, watchIds])

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
      {!compact && <BoardFilters state={state} total={players.length} shown={filtered.length} />}
      {!ranked.length && <Empty text={state.active ? 'No hitters clear this filter.' : `No ${type.toUpperCase()} picks yet.`} />}
      {/* Section header — refreshed dress (2026-08-08, modest): the title
          wears the board's ember signature as a gradient underline, and the
          count moves into a pill. Structure unchanged — "I like the lead". */}
      {!compact && <><div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 0,
        paddingBottom: 8,
        gap: 10, flexWrap: 'wrap',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: TYPE.title, fontWeight: 900, letterSpacing: '-.02em' }}>{rankings ? 'Rankings' : title}</span>
            <span style={{
              fontSize: TYPE.micro, fontWeight: 800, fontFamily: NUM_FONT, color: C.orange,
              border: '1px solid rgba(249,115,22,.4)', background: 'rgba(249,115,22,.08)',
              borderRadius: 999, padding: '1px 9px',
            }} title="Rows this board ranks. The filter bar's own count is the pool those rows are drawn from, which is a longer list.">{ranked.length} ranked</span>
          </div>
          <div style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT, marginTop: 2 }}>{rankings ? `Who we rank tonight, and why.${type === 'hr' ? '' : ` ${title}: ${sub}.`}` : sub}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* COLUMNS (2026-10-07): the same board laid out the way he reads it; rides the address as cols= */}
          {rankings && onColsView && viewMode === 'list' && (
            <div role="group" aria-label="Columns" style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginRight: 6 }}>
              <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>Columns</span>
              {COLUMN_VIEWS.map((v) => {
                const on = columnViewKey(colsView) === v.key
                return (
                  <button key={v.key} type="button" onClick={() => onColsView(v.key)} aria-pressed={on} title={v.title} style={{
                    padding: '4px 11px', fontSize: TYPE.label, fontWeight: 700, borderRadius: 7, cursor: 'pointer',
                    border: `1px solid ${on ? C.orange : C.border}`,
                    background: on ? 'rgba(249,115,22,.12)' : 'transparent',
                    color: on ? C.orange : C.text3,
                  }}>{v.label}</button>
                )
              })}
            </div>
          )}
          {/* 📸 SHARE (2026-08-23) — this board as a PNG, zero backend, same
              canvas mechanism as the Watchlist/Player share cards. */}
          {ranked.length > 0 && (
            <button onClick={() => downloadBoardCard(ranked, { title, sub, type, boardOf, scoreOf: (p) => scoreFor(p, type) })}
              title="Download this board as a PNG for posting"
              aria-label="Download board as image"
              style={{
                padding: '4px 11px', fontSize: TYPE.label, fontWeight: 700, borderRadius: 7, cursor: 'pointer',
                border: `1px solid ${C.border}`, background: 'rgba(249,115,22,.10)', color: C.orange,
              }}>📸</button>
          )}
          <button onClick={() => setViewMode('list')} style={{
            padding: '4px 11px', fontSize: TYPE.label, fontWeight: 700, borderRadius: 7, cursor: 'pointer',
            border: `1px solid ${viewMode === 'list' ? C.orange : C.border}`,
            background: viewMode === 'list' ? 'rgba(249,115,22,.12)' : 'transparent',
            color: viewMode === 'list' ? C.orange : C.text3,
          }}>☰ List</button>
          <button onClick={() => setViewMode('cards')} style={{
            padding: '4px 11px', fontSize: TYPE.label, fontWeight: 700, borderRadius: 7, cursor: 'pointer',
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
      }} /></>}

      {compact && viewMode === 'cards' && (
        <button type="button" onClick={() => setViewMode('list')} style={{ minHeight: 44, margin: '0 0 8px', padding: '0 14px', borderRadius: 8, cursor: 'pointer', fontSize: TYPE.label, fontWeight: 700, border: `1px solid ${C.border}`, background: 'transparent', color: C.orange }}>☰ Back to the list</button>
      )}

      {/* One line, only on a doubleheader slate. Empty string otherwise. */}
      {dhNote && (
        <div style={{ fontSize: TYPE.micro, color: C.text3, lineHeight: 1.6, maxWidth: 800, marginBottom: 8 }}>
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
            // THE FULL BOARD RIDES UNDER THIS TABLE'S OWN FIELDS (2026-09-25,
            // Donovan: every column, on every table). lib/boardColumns.js;
            // the board's keys go first so this table's own meaning of a
            // shared key (iso ×100, hr9 with its ⚠) wins.
            const base = boardRow(p, i, boardCtx)
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
              ...base,
              _key: `${playerId(p)}-${p?.game_pk ?? ''}-${i}`,
              _raw: p,
              _why: whyOn ? boardReasonFor(p, rctx) : null,
              // Lights the watch column below. DenseTable's action column
              // reads the row's own truthy field, and hands `_raw ?? row` to
              // onAction — so the real slate row reaches toggleWatch, which
              // needs it (the star is keyed on the composite player+game key).
              watched: watchIds?.has(playerId(p)) ? 1 : 0,
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
              // #45: carried so the column can mark a rate the site's own
              // regressed figures decline to publish. See the note there.
              //
              // NOT nn(): that helper falls back to 0, and 0 would be
              // indistinguishable from "this pitcher has no published sample
              // at all" — which would put a ⚠ and a tooltip asserting "built
              // on 0 tracked batted balls" on a row that has no sample to
              // describe. Absent stays absent.
              hr9Bbe: Number.isFinite(Number(p?.pitcher_xhr_bbe)) ? Number(p.pitcher_xhr_bbe) : null,
              // THE CATEGORY'S OWN STAT SET (2026-09-06) -- lib/categoryColumns.js.
              // Same keys, same order, on every table that shows this category.
              ...categoryValues(p, type, { omit: catOmit }),
            }
          })}
          columns={applyColumnView(withBoardColumns([
            // ── THE WATCH COLUMN (2026-09-18) ──────────────────────────────
            // Donovan: "watch list button in general is not working." It was
            // not broken — on THIS board, the one he actually reads, it did
            // not exist. The board defaults to the list view (tables lead,
            // 2026-09-14), and the only save control RankedBoard had lived in
            // the CARDS view behind the toggle. Worse, the list already shows
            // a ★ on most rows — the WEAK SPOT flag, four columns over, which
            // is a data mark and not a button. So the page looked like it had
            // a star on every row and did nothing when you pressed it.
            //
            // Same native DenseTable action column LongestBoard.js and
            // Games.js already use, in the same leading slot, with the same
            // ☆/★ marks and the same wording — not a new mechanism.
            { key: 'watched', label: '☆', action: true, w: 30, mark: '★', markOff: '☆',
              titleOn: 'Remove from watchlist', titleOff: 'Add to watchlist', onAction: onWatch },
            { key: 'rank', answers: 'mlb-rank', label: '#', heat: false, w: 34, mono: true, dim: true,
              title: 'His rank on this board — the thing the cards never showed' },
            { key: 'name',   label: 'Player', heat: false, w: 150, bold: true, sticky: true },
            { key: 'team',   label: 'Tm', heat: false, w: 34, mono: true, dim: true, teamMark: 'mlb' },   // his team is the logo (10-03)
            // Only present when a matchup actually repeats tonight.
            ...(dh.size ? [{ key: 'g', label: 'G', heat: false, w: 28, mono: true, dim: true,
              fmt: (v) => (v ? `G${v}` : '—'),
              title: 'Which game of a doubleheader. G1 is the earlier first pitch. A hitter whose team plays twice appears once per game and both rows are real — his board rank is the same in both.' }] : []),
            ...(whyOn ? [{ ...whyColumn({
              textOf: (r) => (r._why?.why?.[0] ? `${r._why.why[0].text}.` : r._why?.watch ? `Against him: ${r._why.watch.text}.` : ''),
              itemOf: whyItem, open: openWhy, theme: C, numFont: NUM_FONT, w: compact ? 168 : 230, group: WHY_GROUP, tidy: true,
            }), fold: false }] : []),
            // The pitcher opens the PITCHER, not the hitter whose row he's in
            // (audit 00A P0: "Kyle Freeland" opened Murakami).
            { key: 'facing', group: BOARD_GROUPS.arm, label: 'Facing', heat: false, w: 116, dim: true, link: (p) => (onOpenPitcher && p?.pitcher_id ? () => onOpenPitcher(p.pitcher_id) : null) },
            { key: 'isPick', group: BOARD_GROUPS.marks, answers: 'called', label: '🤖', flag: true, mark: '●', w: 30,
              title: `MOONSHOT's designated ${{ top: 'TOP', hr: 'HR', hit: 'HIT', hrr: 'HRR', tb: 'CONTACT', contact: 'CONTACT' }[type] || ''} pick tonight — THIS category's pick specifically, not any pick. A hitter picked in a different category shows in the Pick column instead.` },
            { key: 'otherPick', group: BOARD_GROUPS.signal, label: 'Pick', heat: false, w: 46, mono: true, dim: true,
              title: 'Picked tonight, but in a DIFFERENT category than this board — informational, not an endorsement here' },
            { key: 'b2b', group: BOARD_GROUPS.marks, label: '🔁', flag: true, mark: '↻', w: 28,
              title: 'Homered on the night that would set this up, PROVEN from that day\u2019s graded file — not inferred from a slate field that means \u201chis most recent game\u201d and can mean today. A heads-up, not a signal: B2Bs are folklore-grade, the score columns are the evidence.' },
            { key: 'weak',   label: '★', flag: true, mark: '★', w: 28,
              title: ['hr', 'hrr'].includes(type)
                ? 'Weak spot — a home-run flag: tonight’s starter has given up real damage to this lineup slot'
                : 'Weak spot — a home-run flag. Shown for context on this board; it was not measured on this category\'s outcome.' },
            { key: 'multiHit', group: BOARD_GROUPS.marks, label: '2️⃣', flag: true, mark: '2️⃣', w: 30,
              title: 'Multi-hit look — real contact skill (average, BABIP, K-rate, recent hit volume), lineup spot for actual at-bat volume, and a pitcher who\'s been hit hard this year (WHIP, AVG/OBP/BABIP allowed). New as of 2026-08-13 — unlike ★ weak spot, this hasn\'t been graded against the archive yet, so read it as a reasoned first cut, not a proven one.' },
            { key: 'aligned', label: '🧩', flag: true, mark: '◆', w: 28,
              title: ['hr', 'hrr'].includes(type)
                ? 'Aligned — weak spot + pitch match + ISO ≥ .18'
                : 'Aligned — the home-run stack. Context here, not proof: it was measured on homers, not this category.' },
            { key: 'edgeF', group: BOARD_GROUPS.marks, label: '🎯', flag: true, mark: '●', w: 28,
              title: ['hr', 'hrr'].includes(type)
                ? 'Pitch match — his damage pitches overlap tonight\'s arsenal'
                : 'Pitch match — a home-run flag. Context on this board, not category proof.' },
            // 'Adj' and 'Raw' were two columns showing the same hitter before
            // and after the site's ISO adjustment. The site ranks on the bot's
            // raw score now (2026-08-09, see lib/scoring.js), so they'd print
            // identical numbers side by side — one column, named for what it
            // is. ISO keeps its own column: the audit's finding is real and
            // now it's VISIBLE next to the score instead of folded silently
            // into it.
            { key: 'adj', group: BOARD_GROUPS.signal, answers: type === 'hr' ? 'mlb-hr' : null, label: type === 'hr' ? 'HR score' : 'Score', w: 56, dp: 1, ...SCORE, primary: true, art: type === 'hr' ? 'mlb-hr' : null,  // components/ScoreArt.js
              title: type === 'hr'
                ? 'MOONSHOT’s own HR score — the number this board is ranked by. Read the ISO column beside it — a big score on thin power is the trap to watch for.'
                : 'The score this board is ranked by' },
            ...(type !== 'hr' ? [
              { key: 'hrRaw', group: BOARD_GROUPS.signal, label: 'HR sc', w: 48, dp: 1, ...SCORE,
                title: 'MOONSHOT’s HR score, for context on every board — this column never ranks here, but a high number means the power lane is live for him tonight too' },
            ] : []),
            ...(type === 'hr' ? [
              { key: 'iso', group: BOARD_GROUPS.season, label: 'ISO', w: 42, dp: 0, primary: true,
                title: 'Season ISO ×100 — slugging minus batting average, so it measures extra-base pop with the singles stripped out. Read it WITH the score, not instead of it.' },
            ] : []),
            { key: 'rec', group: BOARD_GROUPS.signal,    label: 'When picked', heat: false, w: 82, mono: true,
              title: `His archive record when MOONSHOT designated him in this category — a rate at 3+ picks, a raw fraction under that.` },
            { key: 'bestOther', group: BOARD_GROUPS.scores, label: 'Best other', heat: false, w: 66, mono: true, dim: true,
              title: 'His strongest OTHER category tonight — if this number dwarfs his score here, he might be the wrong kind of bet' },
            { key: 'hrw', answers: 'mlb-hrw', label: 'HRW', w: 44, dp: 0, ...SCORE, primary: true },
            { key: 'xpa', group: BOARD_GROUPS.season,    label: 'xPA', w: 44, dp: 2, title: XPA_TITLE },
            { key: 'l5', group: BOARD_GROUPS.form,     label: 'L5', heat: false, w: 58, mono: true, dim: true },
            // ── #45: THE OUTLIER THAT FED THE NIGHT'S LEAD CALL ─────────
            // This column read 6.00 for one matchup while its neighbours sat
            // at 0.87, 1.10, 1.42, 1.47, 1.56 -- a visible outlier, unflagged,
            // and the same arm the night's headline call was built on. That
            // 6.00 is a few innings of data: the Pitchers page dashes out XHR
            // and HR LUCK for him, because pitcher_xhr_bbe is under the 50
            // batted balls this site needs before it will publish a regressed
            // rate. The raw number stays -- it is real -- and now says it is
            // thin, which is the convention TUDDY already has and MOONSHOT
            // did not.
            { key: 'hr9', group: BOARD_GROUPS.arm,    label: 'P HR/9', w: 58, dp: 2,
              title: 'The starter\u2019s home runs allowed per nine. A ⚠ means it is built on fewer than 50 tracked batted balls — thin enough that the regressed version is withheld on the Pitchers page.',
              fmt: (v, r) => {
                const rate = Number(v)
                if (!Number.isFinite(rate) || rate <= 0) return '—'
                // Thin means "we have a sample and it is small". No published
                // sample is not thin, it is unknown, and gets no mark.
                const bbe = r?.hr9Bbe
                const thin = Number.isFinite(bbe) && bbe < 50
                return (
                  <span style={{ opacity: thin ? 0.72 : 1 }}>
                    {rate.toFixed(2)}
                    {thin && <b style={{ color: C.amber, fontWeight: 900 }}> ⚠</b>}
                  </span>
                )
              } },
            ...categoryColumns(type, { omit: catOmit }).map((c) => (rankings && CAT_GROUP[c.key.replace(/^cat_/, '')] ? { ...c, group: BOARD_GROUPS[CAT_GROUP[c.key.replace(/^cat_/, '')]] } : c)),
          ], { onWatch, dhOn: dh.size > 0 }), colsView)}
          onRowClick={onPlayerClick}
          initialSort={whyOn ? { key: 'rank', dir: 'asc' } : type === 'hr' ? 'raw' : null}
          sortUrlKey={rankings ? 'sort' : null}
          // the v2 skin's status stamp: the one rule (lib/callStatus), the bot's designation + his board place
          {...(whyOn ? { statusOf: (r) => callStatus({ role: r._raw?.game_pick_role, board_rank: r.rank, board_of: boardOf }), maxRows: Math.max(ranked.length, 1) } : null)}
          maxHeight={rankings ? 640 : 520}
          caption={`Ranked by ${type === 'hr' ? 'MOONSHOT’s HR score, with ISO beside it' : 'the category score'}. ${type === 'hr' ? 'A big score on thin power is the board’s most common trap. ' : ''}"When picked" is what he actually did the other times MOONSHOT picked him here. Tap any header to re-sort; the # column always gets you back to the board's own order.`}
        />
      )}

      {compact && viewMode === 'list' && ranked.length > 0 && (
        <button onClick={() => downloadBoardCard(ranked, { title, sub, type, boardOf, scoreOf: (p) => scoreFor(p, type) })}
          title="Download this board as a PNG for posting" aria-label="Download board as image"
          style={{ minHeight: 44, margin: '8px 0 0', padding: '0 14px', borderRadius: 8, cursor: 'pointer', fontSize: TYPE.label, fontWeight: 700, border: `1px solid ${C.border}`, background: 'transparent', color: C.text2 }}>📸 Download this board as an image</button>
      )}
      {whySheet}

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
        scoreLabel={type === 'hr' ? 'MOONSHOT’s HR score' : `the board’s ${title.replace(' Board', '')} score`}
        title={type === 'hr'
          ? 'Top 15 by HR score — what separates them'
          : `Top 15 by ${title.replace(' Board', '')} — what separates them`}
        caption={type === 'hr'
          ? 'Read ISO with the score especially: a big score on thin power is the trap to watch for, and it is exactly the kind of thing a ▼ ISO chip is here to say out loud.'
          : undefined}
        // DenseTable already unwraps _raw for the handler -- see Shortlist.
        onRowClick={onPlayerClick || null}
      />}

      {viewMode === 'cards' && (
      <>
      <Grid>
        {cardsPreview.shown.map((p) => (
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
      <ShowMoreButton {...cardsPreview} itemWord="players" />
      </>
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
