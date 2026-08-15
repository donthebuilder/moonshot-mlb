'use client'
import { useState, useMemo, useEffect } from 'react'
import {
  playerId, mlbId, nameOf, teamOf, oppOf, hrScore, hitScore, prodScore, tbScore,
  nn, n, clean, arr, obj, barrelRate, avgEV, pitchMixScore,
} from '../../lib/player'
import { tierRole, isAligned } from '../../lib/scoring'
import { dedupeGraded } from '../../lib/graded'
import { recordNight, ledgerTotals } from '../../lib/watchLedger'
import { C, NUM_FONT } from '../../lib/theme'
import { PanelTitle, Grid, Empty } from '../ui'
import DenseTable from '../DenseTable'
import BoardFilters, { useBoardFilter } from '../BoardFilters'
import PlayerCard from '../PlayerCard'
import { downloadShareCard } from '../shareCard'

// The bot's designated category for tonight, straight off the slate row —
// "HR", "HIT", "TOP/HR", or '' when he isn't one of the ~105 designated
// hitters. Shown wherever a watchlist name meets the slate, because "is my
// guy also the bot's guy" is the first cross-reference question there is.
const botPickOf = (p) => String(p?.game_pick_role || '').trim().toUpperCase()

// TRACK RECORD (2026-08-12, on request) — same snapshot RankedBoard's "When
// picked" column and the Results tab's full Player Pick Record table read:
// public/pick_matrix.json, the 39-day archive of every pick the bot has ever
// graded. Fetched once per session and shared by every Watchlist render,
// same pattern as RankedBoard.js's fetchMatrix (kept as its own module-level
// copy rather than imported cross-tab, matching how PlayerPickRecord.js also
// keeps its own separate fetch of the same underlying data).
//
// Watchlist shows the OVERALL rate (every category combined), not a single
// category like RankedBoard does — a saved name isn't tied to one board, and
// a watchlist is as likely to hold an off-slate player as an on-slate pick.
// Same threshold rule as everywhere else this archive is read: a rate only
// at 3+ picks, a raw fraction under that, because 1/1 is not 100%.
let _wlMatrixPromise = null
function fetchWlMatrix() {
  if (!_wlMatrixPromise) {
    _wlMatrixPromise = fetch('/pick_matrix.json')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
  }
  return _wlMatrixPromise
}
const MIN_TRACK_PICKS = 3
function useTrackRecords() {
  const [matrix, setMatrix] = useState(null)
  useEffect(() => {
    let alive = true
    fetchWlMatrix().then((m) => { if (alive) setMatrix(m) })
    return () => { alive = false }
  }, [])
  return useMemo(() => {
    const m = new Map()
    arr(matrix?.players).forEach((p) => {
      const key = String(p?.n || '').toLowerCase().trim()
      if (key) m.set(key, { picks: n(p.p, 0), did: n(p.d, 0) })
    })
    return (name) => m.get(String(name || '').toLowerCase().trim()) || null
  }, [matrix])
}
function trackText(rec) {
  if (!rec || !rec.picks) return '—'
  if (rec.picks >= MIN_TRACK_PICKS) return `${Math.round((100 * rec.did) / rec.picks)}% (${rec.did}/${rec.picks})`
  return `${rec.did}/${rec.picks}`
}

const EXPORT_COLUMNS = [
  { key: 'name',     label: 'Player',          get: (p) => nameOf(p) },
  { key: 'team',     label: 'Team',            get: (p) => teamOf(p) },
  { key: 'opp',      label: 'Opponent',        get: (p) => oppOf(p) },
  { key: 'role',     label: 'Role',            get: (p) => tierRole(p) },
  { key: 'botpick',  label: 'Bot Pick',        get: (p) => botPickOf(p) || 'No' },
  { key: 'hr',       label: 'HR Score',        get: (p) => hrScore(p).toFixed(1) },
  { key: 'hrr',      label: 'HRR Score',       get: (p) => prodScore(p).toFixed(1) },
  { key: 'hit',      label: 'Hit Score',       get: (p) => hitScore(p).toFixed(1) },
  { key: 'tb',       label: 'TB Score',        get: (p) => tbScore(p).toFixed(1) },
  { key: 'hrw',      label: 'HRW',             get: (p) => (p?.hrw_score ?? '').toString() },
  { key: 'dmg',      label: 'Damage Conv.',    get: (p) => (p?.damage_conversion_score ?? '').toString() },
  { key: 'pmatch',   label: 'Pitch Match',     get: (p) => (p?.pitch_type_match_score ?? '').toString() },
  { key: 'weakspot', label: 'Weak Spot',       get: (p) => (p?.weak_spot_flag ? 'Yes' : 'No') },
  { key: 'aligned',  label: 'Aligned Signals', get: (p) => (isAligned(p) ? 'Yes' : 'No') },
  { key: 'lineup',   label: 'Lineup Spot',     get: (p) => (p?.lineup_spot ?? '').toString() },
  { key: 'pitcher',  label: 'Pitcher',         get: (p) => (p?.pitcher_name ?? '') },
]

function csvCell(value) {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function buildCsv(items) {
  const header = EXPORT_COLUMNS.map((c) => csvCell(c.label)).join(',')
  const rows = items.map((p) => EXPORT_COLUMNS.map((c) => csvCell(c.get(p))).join(','))
  return [header, ...rows].join('\n')
}

function downloadCsv(items) {
  const csv = buildCsv(items)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toLocaleDateString('en-CA')
  a.href = url
  a.download = `watchlist_${stamp}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Plain-text list, formatted to echo the card/bot-board look: emoji + name +
// score, one player per line. final_hr_role already starts with the role
// emoji (🏆/🔥/🏁/🔭/💠/⛔), so this just reuses it directly rather than
// re-deriving the symbol.
function buildTextList(items) {
  const lines = items.map((p) => {
    const role = tierRole(p)
    const score = Math.round(hrScore(p))
    const align = isAligned(p) ? ' 🧩' : ''
    const bp = botPickOf(p)
    return `${role}  ${nameOf(p)} (${teamOf(p)} vs ${oppOf(p)})  HR ${score}${align}${bp ? `  [bot: ${bp}]` : ''}`
  })
  const stamp = new Date().toLocaleDateString()
  return [`Watchlist — ${stamp} — ${items.length} players`, '', ...lines].join('\n')
}

function downloadTxt(items) {
  const text = buildTextList(items)
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toLocaleDateString('en-CA')
  a.href = url
  a.download = `watchlist_${stamp}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function copyTextList(items, onDone) {
  const text = buildTextList(items)
  try {
    await navigator.clipboard.writeText(text)
    onDone?.(true)
  } catch {
    onDone?.(false)
  }
}

// Cross-reference — paste a list from anywhere and see it against the slate.
//
// The formats people actually paste are messy: ranking numbers, bullets, odds,
// team codes in brackets. Stripping those is the whole feature; a box that only
// accepts clean names is a box nobody uses twice.
function CrossReference({ players, onPlayerClick, onWatch, watchedIds }) {
  const [text, setText] = useState('')

  const norm = (v) => String(v || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim()

  const parsed = useMemo(() => {
    const lines = text.split(/[\n,]/).map((l) => l
      .replace(/\[[^\]]*\]/g, '')                      // [bot: TOP] \u2014 our own export!
      .replace(/\([^)]*\)/g, '')                       // (PHI), (BAL vs LAA)
      .replace(/^\s*(?:\d+[.)]|[-*\u2022])\s*/, '')   // 1.  1)  -  *  bullets
      .replace(/[+-]\d{3,}/g, '')                      // +410, -125
      .trim()).filter(Boolean)

    const byName = new Map(players.map((p) => [norm(nameOf(p)), p]))
    // Pre-normalised names, longest first, so "Will Smith" can't steal a line
    // that actually contains a longer name around it.
    const nameIndex = players
      .map((p) => ({ p, nk: norm(nameOf(p)) }))
      .filter((x) => x.nk.length > 4)
      .sort((a, b) => b.nk.length - a.nk.length)

    return lines.map((line) => {
      const k = norm(line)
      // Three passes, strict to loose:
      //   1. the line IS a name ("Pete Alonso")
      //   2. the line CONTAINS a name \u2014 this is the one that makes the
      //      site's own .txt export round-trip ("Power Watch Pete Alonso
      //      BAL vs LAA HR 58 bot TOP" after stripping still carries junk,
      //      but the name is in there) and survives any other format that
      //      wraps a name in labels
      //   3. the line is PART of a name (someone typed "alonso")
      const hit = byName.get(k)
        || nameIndex.find((x) => k.includes(x.nk))?.p
        || nameIndex.find((x) => x.nk.includes(k))?.p
      return { line, hit: hit || null }
    })
  }, [text, players])

  const found = parsed.filter((r) => r.hit)

  return (
    <details style={{
      background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: '10px 14px', marginBottom: 14,
    }}>
      <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: C.text2 }}>
        📋 Cross-reference a list of players
      </summary>
      <div style={{ fontSize: 10.5, color: C.text3, margin: '8px 0 6px', lineHeight: 1.55 }}>
        Paste names one per line or comma-separated. Ranking numbers, bullets, odds and team codes
        are stripped automatically.
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={'Aaron Judge\nShohei Ohtani +410\n3. Kyle Schwarber (PHI)'}
        style={{
          width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '8px 10px', fontSize: 12, color: C.text, fontFamily: NUM_FONT,
          outline: 'none', resize: 'vertical',
        }}
      />
      {parsed.length > 0 && (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            margin: '8px 0 6px',
          }}>
            <span style={{ fontSize: 10.5, color: C.text3 }}>
              {found.length} of {parsed.length} matched to tonight&apos;s slate
              {found.length > 0 && (
                <> · <b style={{ color: C.orange }}>{found.filter((r) => botPickOf(r.hit)).length}</b> also a bot pick</>
              )}
            </span>
            {/* THE BULK SAVE. Pasting a list and having the site do nothing
                with it felt like the box swallowed your work — the matches
                existed on screen but never became yours. One click stars
                every matched hitter, exactly as if you'd found each on a
                board and starred him: same watchlist, same pair-builder
                anchors, same everything downstream. */}
            {onWatch && found.length > 0 && (() => {
              const unsaved = found.filter((r) => !watchedIds?.has(playerId(r.hit)))
              return unsaved.length > 0 ? (
                <button
                  onClick={() => unsaved.forEach((r) => onWatch(r.hit, true))}
                  style={{
                    fontSize: 10.5, fontWeight: 800, padding: '4px 12px', borderRadius: 7,
                    border: `1px solid ${C.orange}`, background: 'rgba(249,115,22,.12)',
                    color: C.orange, cursor: 'pointer', fontFamily: NUM_FONT,
                  }}
                >★ Save all {unsaved.length} to watchlist</button>
              ) : (
                <span style={{ fontSize: 10, color: C.green, fontFamily: NUM_FONT }}>
                  ✓ all matched are on your watchlist
                </span>
              )
            })()}
          </div>
          <DenseTable
            rows={parsed.map((r, i) => {
              const p = r.hit
              return {
                _key: `${r.line}-${i}`,
                _raw: p,
                watched: p && watchedIds?.has(playerId(p)) ? 1 : 0,
                input: r.line,
                name: p ? nameOf(p) : '— not on slate —',
                team: p ? teamOf(p) : '',
                opp: p ? oppOf(p) : '',
                facing: p ? clean(p?.pitcher_name, 'TBD') : '',
                botpick: p ? (botPickOf(p) || '—') : '',
                isPick: p && botPickOf(p) ? 1 : 0,
                weak: p?.weak_spot_flag ? 1 : 0,
                l5: p ? `${n(p?.last5_hits, 0)}H/${n(p?.last5_hr, 0)}HR/${n(p?.last5_xbh, 0)}X` : '',
                hr: p ? hrScore(p) : null,
                hrw: p ? nn(p?.hrw_score) : null,
                dc: p ? nn(p?.damage_conversion_score) : null,
                iso: p ? nn(p?.season_iso) * 100 : null,
                brl: p ? barrelRate(p) * 100 : null,
                ev: p ? avgEV(p) : null,
                pmix: p ? pitchMixScore(p) : null,
                hrr: p ? prodScore(p) : null,
                hitS: p ? hitScore(p) : null,
                hr9: p ? n(p?.pitcher_hr9, null) : null,
              }
            })}
            columns={[
              // Star first: paste a list, star the keepers, done — the whole
              // reason this box lives on the Watchlist tab.
              ...(onWatch ? [{
                key: 'watched', label: '☆', action: true, w: 30, mark: '★', markOff: '☆',
                titleOn: 'Remove from watchlist', titleOff: 'Add to watchlist',
                onAction: (row) => row?._raw && onWatch(row._raw, !watchedIds?.has(playerId(row._raw))),
              }] : []),
              { key: 'input', label: 'Pasted', heat: false, w: 118, dim: true },
              { key: 'name',  label: 'Matched', heat: false, w: 148, bold: true, sticky: true },
              { key: 'team',  label: 'Tm',   heat: false, w: 34, mono: true, dim: true },
              { key: 'opp',   label: 'Opp',  heat: false, w: 34, mono: true, dim: true },
              { key: 'facing', label: 'Facing', heat: false, w: 118, dim: true },
              { key: 'isPick', label: '🤖',  flag: true, mark: '●', w: 32,
                title: 'The bot designated this hitter as one of tonight’s picks' },
              { key: 'botpick', label: 'Pick', heat: false, w: 58, mono: true,
                title: 'Which category the bot picked him for — HR, TOP, HIT, HRR, CONTACT. Dash = on the slate but not designated.' },
              { key: 'weak',  label: '★',    flag: true, mark: '★', w: 30,
                title: 'Weak lineup spot against tonight’s starter' },
              { key: 'l5',    label: 'L5',   heat: false, w: 76, mono: true, dim: true,
                title: 'Last five games — hits / homers / extra-base hits' },
              { key: 'hr',    label: 'HR',   w: 44, dp: 1,
                title: 'HR score' },
              { key: 'hrw',   label: 'HRW',  w: 46, dp: 0,
                title: 'HR Watch — the bot’s heat/recency read, 0–100' },
              { key: 'dc',    label: 'DC',   w: 42, dp: 0,
                title: 'Damage conversion — how often his hard contact becomes damage' },
              { key: 'iso',   label: 'ISO',  w: 44, dp: 0,
                title: 'Season ISO ×100. The strongest HR predictor in the graded archive: sub-13 homered 8.2%, 23+ homered 22.2%.' },
              { key: 'brl',   label: 'Brl%', w: 46, dp: 1,
                title: 'Recent barrel rate' },
              { key: 'ev',    label: 'EV',   w: 46, dp: 1,
                title: 'Average exit velocity' },
              { key: 'pmix',  label: 'PMix', w: 46, dp: 0,
                title: 'Pitch-mix fit vs tonight’s starter' },
              { key: 'hrr',   label: 'HRR',  w: 44, dp: 1 },
              { key: 'hitS',  label: 'Hit',  w: 44, dp: 1 },
              { key: 'hr9',   label: 'P HR/9', w: 50, dp: 2,
                title: 'The starter he faces — homers allowed per nine' },
            ]}
            onRowClick={(r) => r && onPlayerClick?.(r)}
            maxHeight={340}
            caption="Star a row to save him to the watchlist without leaving the box. 🤖 + Pick = the bot designated him tonight and for what. Every numeric column heats against this pasted list only, so bright means best of YOUR names, not best of the slate. Rows with no match either aren't playing tonight or came through with a spelling the slate doesn't use."
          />
        </>
      )}
    </details>
  )
}

// ⭐ THE TRACKER (2026-08-09, Donovan: "add a tracker to the watchlist like
// results, something minimal but useful").
//
// The page already showed TONIGHT. What it couldn't answer is the question
// that decides whether keeping a watchlist is worth the trouble: does starring
// names work for you, over time? So each graded night's counts get written to
// this device (lib/watchLedger.js) and this strip reads them back.
//
// FOUR NUMBERS AND A SPARK ROW. Not a chart — he asked for minimal, and the
// Results tab is where charts live. Every rate prints its own denominator,
// because "18%" over 11 at-bats is not a fact about anything.
//
// SCOPE IS SAID OUT LOUD. There is no account and no server here; the
// watchlist is device-local and so is its record. A number whose scope you
// misunderstand is worse than no number.
function WatchTracker({ items, nightOf, slateDate, mode }) {
  const [led, setLed] = useState(null)

  // Write tonight, then read the whole ledger back. Recording is idempotent by
  // date — this runs on every results refresh and just overwrites today's row
  // as grading progresses, so the ledger converges on the final numbers
  // instead of double-counting a night.
  //
  // TOMORROW SLATES RECORD NOTHING. There is no result to record, and writing
  // a row for a date that hasn't happened would put a permanent 0-for-N in the
  // history the moment somebody clicks the Tomorrow toggle.
  useEffect(() => {
    if (mode !== 'tomorrow' && slateDate) {
      const lines = items.map((p) => {
        const g = nightOf.get(mlbId(p))
        return g ? { ab: n(g.actual_ab, 0), hr: n(g.actual_hr, 0), hits: n(g.actual_hits, 0) } : null
      }).filter(Boolean)
      if (lines.length) recordNight(slateDate, lines)
    }
    setLed(ledgerTotals())
  }, [items, nightOf, slateDate, mode])

  if (!led || !led.nights) return null

  const spark = led.rows.slice(-14)
  const cell = (label, value, sub, col) => (
    <div key={label} style={{
      background: `linear-gradient(135deg, ${col}12, ${col}04)`,
      border: `1px solid ${col}33`, borderRadius: 10, padding: '7px 13px', minWidth: 0,
    }}>
      <div style={{ fontSize: 8.5, textTransform: 'uppercase', letterSpacing: '.07em', color: C.text3, fontWeight: 800 }}>{label}</div>
      <div style={{ fontFamily: NUM_FONT, fontSize: 16, fontWeight: 900, color: col, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>{sub}</div>
    </div>
  )

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(252,211,77,.03))`,
      border: '1px solid rgba(252,211,77,.25)', borderRadius: 12,
      padding: '9px 13px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 7 }}>
        <span style={{ fontSize: 11.5, fontWeight: 900 }}>⭐ Your watchlist, graded</span>
        <span style={{ fontSize: 9.5, color: C.text3 }}>
          {led.nights} night{led.nights === 1 ? '' : 's'} recorded on this device
        </span>
      </div>
      <div className="watch-track" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {cell('Went deep', led.hrPct == null ? '—' : `${led.hrPct.toFixed(1)}%`, `${led.hr} of ${led.n} starts`, led.hr ? '#4ade80' : C.text3)}
        {cell('Got a hit', led.hitPct == null ? '—' : `${led.hitPct.toFixed(1)}%`, `${led.hit} of ${led.n}`, '#a78bfa')}
        {cell('Starts tracked', led.n, `across ${led.nights} night${led.nights === 1 ? '' : 's'}`, C.orange)}
        {cell('Void', led.void, 'saved but never batted', C.text3)}
      </div>
      {spark.length > 1 && (
        <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', marginBottom: 6 }}>
          {spark.map((r) => {
            // Bar height is the night's homer rate; the tooltip carries the
            // raw counts, because a tall bar off two at-bats is not a good night.
            const rate = r.n ? r.hr / r.n : 0
            const h = 4 + Math.round(rate * 20)
            return (
              <span key={r.date}
                title={`${r.date} — ${r.hr} of ${r.n} saved hitters homered${r.void ? `, ${r.void} never batted` : ''}`}
                style={{
                  width: 12, height: h, borderRadius: 2, cursor: 'help',
                  background: r.hr ? '#4ade80' : 'rgba(255,255,255,.10)',
                  boxShadow: r.hr ? '0 0 6px rgba(74,222,128,.35)' : 'none',
                }} />
            )
          })}
          <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT, marginLeft: 4, alignSelf: 'center' }}>
            last {spark.length} nights · bar = share who homered
          </span>
        </div>
      )}
      <div style={{ fontSize: 9, color: C.text3, lineHeight: 1.55 }}>
        Counted the same way the bot grades itself: a saved hitter only counts on a night he actually
        batted — scratched and never-used names are <b style={{ color: C.text2 }}>void, not misses</b>.
        This history lives in your browser, like the watchlist does, so it only knows the nights you had
        this page open. Clearing your browser data clears it.
      </div>
    </div>
  )
}

export default function Watchlist({ items, players = [], pairSummary, results, slateDate = '', mode = 'today', onWatch, onAdd, onPlayerClick }) {
  // ACCURACY CHECK — did the list deliver tonight? Graded slots joined by
  // player_id give each saved hitter his live line; saved names outside the
  // graded pool stay unknown rather than counting as misses.
  //
  // DEDUPED FIRST (lib/graded.js): the graded file publishes one row per pick
  // CATEGORY, so a saved hitter designated in two of them had two rows and
  // this map kept whichever one came last. dedupeGraded merges them, taking
  // the max of each actual_* field, so a starred name can't show the lower of
  // two lines depending on category order.
  //
  // KEYED BY mlbId, READ BY mlbId. This map was built on String(player_id) —
  // "600036" — and every one of its three readers looked it up with
  // String(playerId(p)), which is the COMPOSITE row key, "600036-811003". The
  // lookup could never hit, so the whole graded layer of this tab has been
  // dead since the day it shipped: no "went deep" tile, no per-hitter chip
  // row, and WatchTracker below built an empty `lines` every night, which
  // means recordNight was never called and the "graded" panel could never
  // accumulate a single night. All silent — an empty board looks like a quiet
  // night. scripts/check-ids.mjs asserts the inverse of this bug and not this
  // one; it does now.
  const nightOf = useMemo(() => {
    const m = new Map()
    dedupeGraded(results?.graded_slots || results?.results || []).forEach((s2) => {
      const id = mlbId(s2)
      if (id) m.set(id, s2)
    })
    return m
  }, [results])
  // THE SAME FILTER RIG THE BOARDS RUN (2026-08-09, on request). A watchlist
  // that grows past a dozen names has the same problem a board does — you want
  // the lefties, or the ones on a leaky arm, or the band of the stat you care
  // about tonight — and the answer already existed one file over. useBoardFilter
  // is mounted on the ON-SLATE saves only: off-slate names have no current
  // numbers to filter by, so putting them through a Brl% band would silently
  // drop them for having no data rather than for failing a test. They keep
  // their own strip below, untouched.
  //
  // Hooks run before the empty-list early return on purpose — an empty
  // watchlist is a render path, not an excuse to change the hook order.
  const slateIds = useMemo(() => new Set(players.map((p) => String(playerId(p)))), [players])
  const onSlate = useMemo(
    () => items.filter((p) => slateIds.has(String(playerId(p)))),
    [items, slateIds],
  )
  const { filtered: filteredOnSlate, state: filterState } = useBoardFilter(onSlate)
  const trackOf = useTrackRecords()

  const [confirming, setConfirming] = useState(false)
  const [copied, setCopied] = useState(false)

  function handleClearAll() {
    if (!confirming) { setConfirming(true); return }
    items.forEach(p => onWatch?.(p, false))
    setConfirming(false)
  }

  function handleCopy() {
    copyTextList(items, (ok) => {
      setCopied(ok ? 'ok' : 'fail')
      setTimeout(() => setCopied(false), 1800)
    })
  }

  if (!items.length) {
    return (
      <div>
        <PanelTitle title="Watchlist" sub="Tap the ☆ on any player card to save them here. Saved on this device only." />
        <CrossReference players={players} onPlayerClick={onPlayerClick} onWatch={onWatch} watchedIds={new Set(items.map(playerId))} />
        <Empty text="No saved players yet." />
      </div>
    )
  }

  return (
    <div>
      <PanelTitle
        title="Watchlist"
        sub={`${items.length} saved`}
        right={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={handleCopy}
              style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                border: `1px solid ${copied === 'ok' ? C.green : C.border2}`,
                background: copied === 'ok' ? `${C.green}22` : 'rgba(255,255,255,.04)',
                color: copied === 'ok' ? C.green : C.text2,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {copied === 'ok' ? '✓ Copied' : copied === 'fail' ? 'Copy failed' : '📋 Copy List'}
            </button>
            <button
              onClick={() => downloadShareCard(items)}
              title="Render the list as a PNG image for posting — top 12 by HR score, with bot-pick tags"
              style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                border: `1px solid ${C.border2}`,
                background: 'rgba(249,115,22,.10)',
                color: C.orange,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              📸 Share Card
            </button>
            <button
              onClick={() => downloadTxt(items)}
              style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                border: `1px solid ${C.border2}`,
                background: 'rgba(255,255,255,.04)',
                color: C.text2,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              ⬇ Export .txt
            </button>
            <button
              onClick={() => downloadCsv(items)}
              style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                border: `1px solid ${C.border2}`,
                background: 'rgba(255,255,255,.04)',
                color: C.text2,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              ⬇ Export CSV
            </button>
            <button
              onClick={handleClearAll}
              onBlur={() => setConfirming(false)}
              style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                border: `1px solid ${confirming ? C.red : C.border}`,
                background: confirming ? `${C.red}22` : 'rgba(255,255,255,.04)',
                color: confirming ? C.red : C.text3,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {confirming ? 'Confirm Clear' : 'Clear All'}
            </button>
          </div>
        }
      />
      <WatchTracker items={items} nightOf={nightOf} slateDate={slateDate} mode={mode} />

      {/* VITALS STRIP — the list as one glance: size, bot overlap, power,
          matchup edges. Each tile is the answer to a question you'd otherwise
          scan twelve cards for. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {(() => {
          const bots = items.filter((p) => botPickOf(p)).length
          const avgHr = items.reduce((s2, p) => s2 + hrScore(p), 0) / Math.max(1, items.length)
          const weak = items.filter((p) => p?.weak_spot_flag).length
          const conf = items.filter((p) => p?.lineup_confirmed).length
          return [
            ['Saved', items.length, C.orange, ''],
            ['Bot picks', bots, '#FCD34D', bots ? 'the bot agrees on these' : ''],
            ['Avg HR score', avgHr.toFixed(1), '#f97316', ''],
            ['Weak spots', weak, '#FCD34D', ''],
            ['Confirmed', `${conf}/${items.length}`, conf === items.length ? '#4ade80' : '#a78bfa', 'lineups locked'],
            ...(() => {
              const graded = items.map((p) => nightOf.get(mlbId(p))).filter(Boolean)
              if (!graded.length) return []
              const hrs = graded.filter((g) => Number(g.actual_hr) > 0).length
              const hits = graded.filter((g) => Number(g.actual_hits) > 0).length
              return [
                ['💥 Went deep', `${hrs}/${graded.length}`, hrs ? '#4ade80' : C.text3, 'saved hitters who homered tonight'],
                ['Got a hit', `${hits}/${graded.length}`, hits > graded.length / 2 ? '#4ade80' : '#a78bfa', 'tonight, of those graded so far'],
              ]
            })(),
          ].map(([l, v, c2, note]) => (
            <div key={l} title={note} style={{
              background: `linear-gradient(135deg, ${c2}14, ${c2}05)`,
              border: `1px solid ${c2}3d`, borderRadius: 10, padding: '7px 13px',
            }}>
              <div style={{ fontSize: 8.5, textTransform: 'uppercase', letterSpacing: '.07em', color: C.text3, fontWeight: 800 }}>{l}</div>
              <div style={{ fontFamily: NUM_FONT, fontSize: 16, fontWeight: 900, color: c2 }}>{v}</div>
            </div>
          ))
        })()}
      </div>

      {/* TONIGHT — each saved hitter's live line, worn as a chip. Green =
          homered, purple = hit(s), dim = nothing yet / not graded. */}
      {(() => {
        const chips = items.map((p) => ({ p, g: nightOf.get(mlbId(p)) })).filter((x) => x.g)
        if (!chips.length) return null
        return (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {chips.map(({ p, g }) => {
              const hr = Number(g.actual_hr) > 0
              const hits = Number(g.actual_hits) || 0
              const ab = Number(g.actual_ab) || 0
              const fin = Number(g.is_final) === 1
              const col = hr ? '#4ade80' : hits > 0 ? '#a78bfa' : C.text3
              return (
                <span key={playerId(p)} onClick={() => onPlayerClick?.(p)}
                  title={fin ? 'Game final — his full line is in' : 'Game in progress — line so far'}
                  style={{
                    fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                    padding: '3px 9px', borderRadius: 7,
                    border: `1px solid ${col}55`, color: col,
                    background: hr ? 'rgba(74,222,128,.10)' : 'transparent',
                    fontFamily: NUM_FONT, opacity: fin && !hr && !hits ? 0.65 : 1,
                  }}>
                  {hr ? '💥 ' : ''}{nameOf(p)} {ab > 0 ? `${hits}-${ab}` : `${hits}H`}
                  {Number(g.actual_hr) > 0 ? ` · ${g.actual_hr}HR` : ''}
                  {fin ? ' · F' : ' · live'}
                </span>
              )
            })}
          </div>
        )
      })()}

      {/* THE LIST AS A TABLE (2026-08-08, on request) — the same dense-table
          read the boards get, over just your saved names. Cards are for one
          player at a time; this is where the list gets COMPARED. Off-slate
          saves are excluded — their numbers would be stale — they live in the
          off-slate strip below instead. */}
      {(() => {
        if (!onSlate.length) return null
        return (
          <div style={{ marginBottom: 12 }}>
            <BoardFilters state={filterState} total={onSlate.length} shown={filteredOnSlate.length} />
            {!filteredOnSlate.length ? (
              <Empty text="None of your saved hitters clear this filter. Reset it above — the categories are rarer than they look, and a band set for one stat means nothing in another's units." />
            ) : (
            <DenseTable
              rows={filteredOnSlate.map((p) => {
                const track = trackOf(nameOf(p))
                return {
                  _key: String(playerId(p)),
                  _raw: p,
                  watched: 1,
                  name: nameOf(p),
                  team: teamOf(p),
                  opp: oppOf(p),
                  spot: p?.lineup_spot ?? null,
                  facing: clean(p?.pitcher_name, 'TBD'),
                  isPick: botPickOf(p) ? 1 : 0,
                  botpick: botPickOf(p) || '—',
                  // Overall did-the-job rate across every category the bot has
                  // ever picked him for (3+ picks, else a raw fraction) — the
                  // numeric field drives sort/heat, track_t is the display string.
                  track: track && track.picks >= MIN_TRACK_PICKS ? (100 * track.did) / track.picks : null,
                  track_t: trackText(track),
                  weak: p?.weak_spot_flag ? 1 : 0,
                  l5: `${n(p?.last5_hits, 0)}H/${n(p?.last5_hr, 0)}HR/${n(p?.last5_xbh, 0)}X`,
                  hr: hrScore(p),
                  hrw: nn(p?.hrw_score),
                  dc: nn(p?.damage_conversion_score),
                  iso: nn(p?.season_iso) * 100,
                  brl: barrelRate(p) * 100,
                  ev: avgEV(p),
                  pmix: pitchMixScore(p),
                  hrr: prodScore(p),
                  hitS: hitScore(p),
                  hr9: n(p?.pitcher_hr9, null),
                }
              })}
              columns={[
                ...(onWatch ? [{
                  key: 'watched', label: '★', action: true, w: 30, mark: '★', markOff: '☆',
                  titleOn: 'Remove from watchlist', titleOff: 'Add to watchlist',
                  onAction: (row) => row?._raw && onWatch(row._raw, false),
                }] : []),
                { key: 'name',  label: 'Player', heat: false, w: 148, bold: true, sticky: true },
                { key: 'team',  label: 'Tm',   heat: false, w: 34, mono: true, dim: true },
                { key: 'opp',   label: 'Opp',  heat: false, w: 34, mono: true, dim: true },
                { key: 'spot',  label: '#',    heat: false, w: 26, mono: true, dim: true,
                  title: 'Lineup spot' },
                { key: 'facing', label: 'Facing', heat: false, w: 118, dim: true },
                { key: 'isPick', label: '🤖',  flag: true, mark: '●', w: 32,
                  title: 'The bot designated this hitter as one of tonight’s picks' },
                { key: 'botpick', label: 'Pick', heat: false, w: 58, mono: true,
                  title: 'Which category the bot picked him for — HR, TOP, HIT, HRR, CONTACT. Dash = on the slate but not designated.' },
                { key: 'track', label: 'Track record', w: 96, mono: true,
                  fmt: (v, row) => row.track_t,
                  title: `His overall did-the-job rate across every category the bot has ever picked him for — HR pick homering, HIT pick getting a hit, and so on, combined. From the same 39-day archive as the Results tab's full pick record. A percentage shows at ${MIN_TRACK_PICKS}+ picks; below that it stays a raw fraction, because 1/1 is not 100%. Dash = never a bot pick.` },
                { key: 'weak',  label: '⭐',    flag: true, mark: '★', w: 30,
                  title: 'Weak lineup spot against tonight’s starter' },
                { key: 'l5',    label: 'L5',   heat: false, w: 76, mono: true, dim: true,
                  title: 'Last five games — hits / homers / extra-base hits' },
                { key: 'hr',    label: 'HR',   w: 44, dp: 1, title: 'HR score' },
                { key: 'hrw',   label: 'HRW',  w: 46, dp: 0,
                  title: 'HR Watch — the bot’s heat/recency read, 0–100' },
                { key: 'dc',    label: 'DC',   w: 42, dp: 0,
                  title: 'Damage conversion — how often his hard contact becomes damage' },
                { key: 'iso',   label: 'ISO',  w: 44, dp: 0,
                  title: 'Season ISO ×100. The strongest HR predictor in the graded archive.' },
                { key: 'brl',   label: 'Brl%', w: 46, dp: 1, title: 'Recent barrel rate' },
                { key: 'ev',    label: 'EV',   w: 46, dp: 1, title: 'Average exit velocity' },
                { key: 'pmix',  label: 'PMix', w: 46, dp: 0,
                  title: 'Pitch-mix fit vs tonight’s starter' },
                { key: 'hrr',   label: 'HRR',  w: 44, dp: 1 },
                { key: 'hitS',  label: 'Hit',  w: 44, dp: 1 },
                { key: 'hr9',   label: 'P HR/9', w: 50, dp: 2,
                  title: 'The starter he faces — homers allowed per nine' },
              ]}
              onRowClick={(r) => r && onPlayerClick?.(r)}
              initialSort="hr"
              maxHeight={380}
              caption="Your saved hitters, side by side — every column heats against THE FILTERED LIST only, so bright means best of what's currently shown, not best of the slate. Narrow the filter and the colours re-scale to the survivors. ★ un-saves without leaving the table."
            />
            )}
          </div>
        )
      })()}

      {/* BOT AGREEMENT. The first question about a hand-built list: which of
          my saves does the bot also like tonight, and for what. One chip per
          watched player who carries a game_pick_role. */}
      {(() => {
        const agreed = items.filter((p) => botPickOf(p))
        if (!agreed.length) return null
        return (
          <div style={{ margin: '2px 0 10px' }}>
            <div style={{ fontSize: 10.5, color: C.text3, marginBottom: 6 }}>
              <b style={{ color: C.orange }}>{agreed.length}</b> of your {items.length} saved are
              also bot picks tonight:
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {agreed.map((p) => (
                <button
                  key={playerId(p)}
                  onClick={() => onPlayerClick?.(p)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                    background: 'rgba(249,115,22,.10)', border: `1px solid ${C.orange}55`,
                    borderRadius: 8, padding: '4px 10px',
                  }}
                >
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text }}>{nameOf(p)}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 900, fontFamily: NUM_FONT,
                    color: C.orange, letterSpacing: '.05em',
                  }}>🤖 {botPickOf(p)}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      {/* OFF THE SLATE TONIGHT (2026-08-08, on request) — the saved names the
          bot never scored tonight: not playing, not published, or saved from
          an older slate. They'd otherwise sit in the cards below wearing
          STALE numbers with nothing saying so. Click still opens the modal,
          which pulls his season live when there's no bot row. */}
      {(() => {
        const off = items.filter((p) => !slateIds.has(String(playerId(p))))
        if (!off.length) return null
        return (
          <div style={{
            display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
            background: C.bg2, border: `1px dashed ${C.border2}`, borderRadius: 10,
            padding: '7px 12px', marginBottom: 10,
          }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: C.text2 }}>🌙 Not on tonight&apos;s slate</span>
            <span style={{ fontSize: 9.5, color: C.text3 }}>
              saved but the bot didn&apos;t score them tonight — click for the live-season read
            </span>
            {off.map((p) => {
              const track = trackText(trackOf(nameOf(p)))
              return (
                <button key={playerId(p)} onClick={() => onPlayerClick?.(p)}
                  title={`${nameOf(p)} — no bot row tonight. Opens his modal, which falls back to live Statcast/StatsAPI.${track !== '—' ? ` Track record: ${track}.` : ''}`}
                  style={{
                    fontSize: 10.5, fontWeight: 700, cursor: 'pointer', color: C.text2,
                    border: `1px solid ${C.border2}`, background: 'rgba(255,255,255,.03)',
                    borderRadius: 7, padding: '3px 9px',
                  }}>
                  {nameOf(p)}<span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9, marginLeft: 4 }}>{teamOf(p)}</span>
                  {track !== '—' && <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9, marginLeft: 4 }}>· {track}</span>}
                </button>
              )
            })}
          </div>
        )
      })()}

      {/* CARD VIEW, demoted (2026-08-08, on request) — the table above is the
          star now; the one-card-per-player grid still exists for anyone who
          wants the full card read, but collapsed so it stops pushing the
          pairs and power tools off the screen. */}
      <details style={{
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '8px 14px', marginBottom: 10,
      }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: C.text2 }}>
          🃏 Card view — one full card per saved hitter ({items.length})
        </summary>
        <div style={{ marginTop: 10 }}>
          <Grid>
            {items.map((p) => (
              <PlayerCard
                key={playerId(p)}
                p={p}
                type="hr"
                onAdd={onAdd}
                onWatch={onWatch}
                watched={true}
                onClick={() => onPlayerClick?.(p)}
              />
            ))}
          </Grid>
        </div>
      </details>

      {/* PAIRS WITHIN THE LIST. The first version here pre-anchored the full
          pair builder to the watchlist — which, by the builder's own rules,
          could NEVER pair two watched players together: anchors are excluded
          from being partners, so a list full of anchors produced pairs of
          list-vs-slate, not list-vs-list. Exactly backwards for a watchlist.
          This is the right shape: every two-man combination FROM the saved
          names, scored on tonight plus whatever co-HR history the pair has.
          For a hitter's partners beyond the list, the full builder lives on
          Pools. */}
      {items.length >= 2 && (
        <WatchlistPairs items={items} pairSummary={pairSummary} onPlayerClick={onPlayerClick} />
      )}

      {/* CROSS-REFERENCE, moved to the bottom (2026-08-08, on request) — it's
          a power tool, not the landing element. Paste any list, match it to
          the slate, bulk-star the keepers. */}
      <div style={{ marginTop: 14 }}>
        <CrossReference players={players} onPlayerClick={onPlayerClick} onWatch={onWatch} watchedIds={new Set(items.map(playerId))} />
      </div>
    </div>
  )
}

// Every 2-combination of the saved hitters, ranked. History lookup goes
// through pair_history_summary by player_id pair, so a combo with real
// same-game history rises even if tonight's scores are middling.
function WatchlistPairs({ items, pairSummary, onPlayerClick }) {
  const rows = useMemo(() => {
    // History index: "idA|idB" (sorted) -> pair record.
    const hist = new Map()
    arr(obj(pairSummary).top_pairs).forEach((pr) => {
      const ids = arr(pr?.players).map((p) => String(p?.player_id ?? '')).filter(Boolean).sort()
      if (ids.length === 2) hist.set(ids.join('|'), pr)
    })

    const out = []
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j]
        const key = [String(a?.player_id ?? ''), String(b?.player_id ?? '')].sort().join('|')
        const h = hist.get(key)
        const hrA = hrScore(a), hrB = hrScore(b)
        const sameGame = a?.game_pk && a.game_pk === b.game_pk
        const sg = h ? Number(h.same_game_hr_count) || 0 : 0
        const sd = h ? Number(h.same_day_hr_count_season ?? h.repeat_count) || 0 : 0
        const since = h && h.days_since_last_hit != null ? Number(h.days_since_last_hit) : null
        out.push({
          _key: key || `${i}-${j}`,
          _raw: hrA >= hrB ? a : b,
          pair: `${nameOf(a)} + ${nameOf(b)}`,
          teams: `${teamOf(a)} / ${teamOf(b)}`,
          sameGm: sameGame ? 1 : 0,
          stronger: Math.max(hrA, hrB),
          weaker: Math.min(hrA, hrB),
          histSg: sg,
          histSd: sd,
          since,
          hasHist: h ? 1 : 0,
          // Rank: the weaker side leads (both must land), same-game history
          // is worth real points, same-day less, recency a nudge.
          fit: Math.min(hrA, hrB)
            + Math.min(30, sg * 12)
            + Math.min(12, sd * 2)
            + (since != null ? Math.max(0, 10 - Math.min(10, since / 3)) : 0),
        })
      }
    }
    return out.sort((a, b) => b.fit - a.fit)
  }, [items, pairSummary])

  const withHist = rows.filter((r) => r.hasHist).length

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800 }}>🔗 Pairs within your list</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          {rows.length} combos from {items.length} saved · {withHist} with co-HR history
        </span>
      </div>
      <div style={{ fontSize: 10, color: C.text3, marginBottom: 8, lineHeight: 1.5 }}>
        Every two-man combination of your saved hitters, best first. For one hitter&apos;s partners
        beyond this list, use the builder on Pools.
      </div>
      <DenseTable
        rows={rows}
        columns={[
          { key: 'pair',    label: 'Pair', heat: false, w: 230, bold: true, sticky: true },
          { key: 'teams',   label: 'Teams', heat: false, w: 76, mono: true, dim: true },
          { key: 'sameGm',  label: 'Same gm', flag: true, mark: '⚡', w: 52,
            title: 'Both hitters are in the SAME GAME tonight — correlated, higher variance' },
          { key: 'fit',     label: 'Fit', w: 46, dp: 0,
            title: 'Weaker side + same-game history (12/ea, cap 30) + same-day (2/ea, cap 12) + recency nudge',
            // 2026-08-12: same GLOSSARY['fit'] collision as PairBuilder's Fit
            // column — different formula (this one starts from the WEAKER
            // side, PairBuilder's starts from tonight's market score), so it
            // needs its own explanation rather than sharing PairBuilder's.
            explain: 'Starts from the weaker of the two hitters\' scores — since both have to land — then adds credit for same-game and same-day history together, plus a small recent-form nudge. Higher fits better.' },
          { key: 'weaker',  label: 'Weaker', w: 52, dp: 1,
            title: 'The lower HR score of the two — both have to land, so this side decides' },
          { key: 'stronger', label: 'Stronger', w: 56, dp: 1 },
          { key: 'histSg',  label: 'Hist same-gm', w: 66,
            title: 'Times these two homered in the same game this season' },
          { key: 'histSd',  label: 'Hist same-day', w: 68,
            title: 'Times they homered on the same date — different parks count' },
          { key: 'since',   label: 'Last together', w: 72, invert: true,
            fmt: (v) => (v == null ? 'never' : v === 0 ? 'today' : `${v}d ago`),
            title: 'Days since they last homered on the same day. Inverted — recent reads bright.' },
        ]}
        onRowClick={onPlayerClick}
        initialSort={null}
        maxHeight={400}
        caption="Ranked by Fit, which leads with the WEAKER side — a pair is never better than its worse half — then adds history. 'never' in Last together isn't a strike against a pair: most good pairs have no history yet, it just means the history columns contribute nothing. ⚡ marks both hitters in one game tonight: they rise and fall together."
      />
    </div>
  )
}
