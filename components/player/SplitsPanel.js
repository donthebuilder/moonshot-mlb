'use client'
// THE SPLITS PANEL, ON THE CARD'S FRONT (2026-10-22, Donovan: "I would like the player splits to be shown ... just like
// the props matrix ... I want to be able to filter depending on the situation. Sports can get real situational.")
//
// One table, one situation at a time, picked from a chip row:
//   Tonight   vs tonight's arm (marked) and the other arm, his last 7 / 15 / 30 games, the season, RISP
//   Hand · Recent · Home/Away · Day/Night · Count · Runners · Outs   (each its own rows)
// The game windows (Tonight, Recent) also take the props grid's situation filters: the starter's arm and home or
// away, applied to his game log, so "L15 · vs RHP starters · on the road" is two taps.
//
// Sources, both already on the card: the league's statSplits (the same request the full Splits sheet makes, one row
// per code, the club total for a traded hitter) and his game log (lib/gamelogs thresholdRates, the props grid's own
// fetch, cached). The starter's arm per game is lib/gamelogs starterHands, fetched only when that filter is touched.
// Nothing is adjusted or invented: a row with no plate appearances isn't drawn.
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import DenseTable from '../DenseTable'
import { flatChip, FLAT_CHIP_CLASS } from '../../lib/chips'
import { thresholdRates, starterHands, seasonYear } from '../../lib/gamelogs'
import { countsFromGames, gameFromFlat, rowFromCounts } from '../../lib/splitWindow'
import { sitUrl, parseSitRows, SIT_LABELS } from '../PlayerSplits'

const CODES = ['vl', 'vr', 'risp', 'risp2', 'h', 'a', 'd', 'n', 'ac', 'bc', 'ec', '2s', 'fc', 'r0', 'ron', 'ron2', 'r123', 'o0', 'o1', 'o2']
const WINDOWS = [['L7', 7], ['L15', 15], ['L30', 30]]

// the situations (a menu, not table columns): id + the chip's word
const SITS = [
  { id: 'tonight', word: 'Tonight', games: true },
  { id: 'hand', word: 'Hand', codes: ['vr', 'vl'] },
  { id: 'recent', word: 'Recent', games: true },
  { id: 'ha', word: 'Home/Away', codes: ['h', 'a'] },
  { id: 'dn', word: 'Day/Night', codes: ['d', 'n'] },
  { id: 'count', word: 'Count', codes: ['ac', 'ec', 'bc', '2s', 'fc'] },
  { id: 'runners', word: 'Runners', codes: ['r0', 'ron', 'risp', 'risp2', 'ron2', 'r123'] },
  { id: 'outs', word: 'Outs', codes: ['o0', 'o1', 'o2'] },
]

// a slash-line rate the way baseball prints it: .221, 1.012
const rate = (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(3).replace(/^0(?=\.)/, ''))
const COLS = [
  { key: 'split', label: 'Split', group: 'Split', heat: false, w: 78, bold: true, sticky: true, numeric: false },
  { key: 'pa', label: 'PA', group: 'Sample', heat: false, w: 36, title: 'The sample. Read this before any rate on the row.' },
  { key: 'avg', label: 'AVG', group: 'Line', w: 42, fmt: rate },
  { key: 'ops', label: 'OPS', group: 'Line', w: 44, fmt: rate },
  { key: 'iso', label: 'ISO', group: 'Power', w: 42, fmt: rate },
  { key: 'hr', label: 'HR', group: 'Power', w: 34 },
  { key: 'hrPa', label: 'HR%', group: 'Power', w: 42, dp: 1, title: 'Home runs per plate appearance.' },
  { key: 'kPct', label: 'K%', group: 'Discipline', w: 40, dp: 0, invert: true, title: 'Inverted: a low strikeout rate is the good outcome for the hitter.' },
]

const sitCache = new Map()
function sitRows(pid) {
  const url = sitUrl(pid, seasonYear(), CODES)
  if (!sitCache.has(url)) sitCache.set(url, fetch(url).then((r) => (r.ok ? r.json() : null)).then(parseSitRows).catch(() => []))
  return sitCache.get(url)
}

export default function SplitsPanel({ player, accent = C.orange }) {
  const pid = player?.player_id || player?.id
  const arm = String(player?.pitcher_throws || '').toUpperCase().slice(0, 1)
  const [sit, setSit] = useState('tonight')
  const [live, setLive] = useState(null)       // statSplits rows (null = loading)
  const [log, setLog] = useState(null)         // his game log, newest first (null = loading, [] = none)
  const [hands, setHands] = useState(null)     // gamePk -> starter's arm, once the arm filter is touched
  const [armF, setArmF] = useState('ALL')
  const [haF, setHaF] = useState('ALL')

  useEffect(() => {
    if (!pid) return undefined
    let alive = true
    setLive(null); setLog(null); setHands(null); setArmF('ALL'); setHaF('ALL'); setSit('tonight')
    sitRows(pid).then((r) => { if (alive) setLive(r || []) })
    thresholdRates(pid).then((d) => { if (alive) setLog(d?.logAll || []) }).catch(() => { if (alive) setLog([]) })
    return () => { alive = false }
  }, [pid])
  useEffect(() => {
    if (armF === 'ALL' || hands || !pid) return undefined
    let alive = true
    starterHands(pid).then((h) => { if (alive) setHands(h || {}) })
    return () => { alive = false }
  }, [armF, hands, pid])

  const spec = SITS.find((s) => s.id === sit) || SITS[0]
  const filtered = useMemo(() => (log || []).filter((g) => {
    if (haF !== 'ALL' && (haF === 'home') !== (g.home === true)) return false
    if (armF !== 'ALL') { const h = hands?.[g.gamePk]; if (!h || h !== armF) return false }
    return true
  }), [log, haF, armF, hands])
  const filterWord = [armF !== 'ALL' && `vs ${armF}HP starters`, haF !== 'ALL' && (haF === 'home' ? 'at home' : 'on the road')].filter(Boolean).join(' · ')

  const gameRows = useMemo(() => {
    if (!filtered.length) return []
    const flat = filtered.map((g) => gameFromFlat({ ...g, date: g.iso }))
    const rows = WINDOWS.filter(([, n]) => n < flat.length + 1).map(([label, n]) => rowFromCounts(label, `Last ${n}`, countsFromGames(flat.slice(0, n))))
    // the log carries his October games too (lib/gamelogs asks for every game type), so the row says so
    const post = filtered.some((g) => g.gt && g.gt !== 'R')
    rows.push(rowFromCounts('szn', post ? 'Season + Oct' : 'Season', countsFromGames(flat)))
    return rows
  }, [filtered, filterWord])

  const codeRow = (c) => {
    const r = (live || []).find((x) => x.code === c)
    if (!r || !r.pa) return null
    const tonightSide = (c === 'vr' && arm === 'R') || (c === 'vl' && arm === 'L')
    return { ...r, split: `${SIT_LABELS[c] || r.split}${tonightSide ? ' ⌖' : ''}`, _tonight: tonightSide }
  }

  const rows = useMemo(() => {
    if (spec.id === 'tonight') {
      const hand = arm === 'L' ? ['vl', 'vr'] : ['vr', 'vl']
      return [...hand.map(codeRow), ...gameRows, codeRow('risp')].filter(Boolean)
    }
    if (spec.id === 'recent') return gameRows
    return spec.codes.map(codeRow).filter(Boolean)
  }, [spec, live, gameRows, arm])   // eslint-disable-line react-hooks/exhaustive-deps

  const loading = spec.games ? (log === null || (spec.id === 'tonight' && live === null)) : live === null
  const waitingHands = armF !== 'ALL' && hands === null
  const chip = (on) => ({ ...flatChip(on, accent, C, NUM_FONT), padding: '2px 8px', fontSize: 9.5 })

  if (!pid) return null
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ font: `900 12px/1.2 ${NUM_FONT}`, letterSpacing: '.08em', color: C.text }}>SPLITS</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          {spec.games && filterWord ? filterWord : spec.games ? 'season + his last games' : 'season · live from the league'}
        </span>
      </div>
      {/* one row that scrolls sideways: the situation, then (for the game windows) the game filters, never a wall */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none', marginBottom: 6, paddingBottom: 1 }}>
        {SITS.map((s) => (
          <button key={s.id} type="button" className={FLAT_CHIP_CLASS} aria-pressed={sit === s.id} onClick={() => setSit(s.id)} style={{ ...chip(sit === s.id), flex: '0 0 auto', whiteSpace: 'nowrap' }}>{s.word}</button>
        ))}
      </div>
      {spec.games && (
        <div className="chip-row" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em' }}>Games</span>
          {[['ALL', 'All'], ['R', 'vs RHP'], ['L', 'vs LHP']].map(([k, l]) => (
            <button key={k} type="button" className={FLAT_CHIP_CLASS} aria-pressed={armF === k} onClick={() => setArmF(k)} title={k === 'ALL' ? 'Every game' : `Only games a ${k === 'R' ? 'right' : 'left'}-handed pitcher started`} style={chip(armF === k)}>{l}</button>
          ))}
          {[['ALL', 'Both'], ['home', 'Home'], ['away', 'Away']].map(([k, l]) => (
            <button key={k} type="button" className={FLAT_CHIP_CLASS} aria-pressed={haF === k} onClick={() => setHaF(k)} style={chip(haF === k)}>{l}</button>
          ))}
        </div>
      )}
      {loading || waitingHands
        ? <div style={{ fontSize: 10.5, color: C.text3, padding: '8px 0' }}>Loading splits…</div>
        : rows.length
          ? <DenseTable rows={rows} columns={COLS} initialSort={null} maxHeight={320} dimRow={null}
              caption={spec.games
                ? 'Hand rows are pitch by pitch from the league; game rows are his last games, newest first (the arm is the starter’s). Check PA before any rate.'
                : 'Season, live from the league. Check PA before any rate; nothing here is park- or opponent-adjusted.'} />
          : <div style={{ fontSize: 10.5, color: C.text3, padding: '8px 0', lineHeight: 1.5 }}>
              {spec.games && (armF !== 'ALL' || haF !== 'ALL') ? 'No games of his match those filters.' : 'The league has no splits for him in this situation yet.'}
            </div>}
    </div>
  )
}
