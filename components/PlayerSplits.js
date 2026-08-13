'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean, obj } from '../lib/player'
import { splitsUrl } from '../lib/dataSource'
import DenseTable from './DenseTable'

// Situational splits — day/night, home/away, day of week, win/loss.
//
// player_splits.py has been writing one of these per hitter since the Streamlit
// migration and publish_data.sh has been copying current/splits/ to the data
// branch the whole time. 297 files on the live slate. Nothing on this site read
// a single one of them until this tab existed.
//
// A caution that belongs on the page rather than in a comment: these are the
// splits people most often over-read. A season divides into day/night at maybe
// 380 and 250 plate appearances, which is thin but arguable; it divides into
// seven days of the week at roughly 60 PA each, which is not. A .263 Monday
// against a .125 Tuesday is one extra hit a week. The rows carry their PA and
// anything under 100 is called out, because the shape of this data invites
// exactly the wrong conclusion.

const GROUPS = [
  { key: 'home_away',   label: 'Home / Away',  order: ['Home', 'Away'] },
  { key: 'win_loss',    label: 'Team won / lost', order: ['Win', 'Loss', 'W', 'L'] },
  { key: 'day_of_week', label: 'Day of week',  order: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
]
// day_night deliberately dropped from this list (2026-08-13): player_splits.py's
// day/night bucket comes off MLB gameLog's game.dayNight field, and at least one
// real hitter's file showed 100% of a full season's PA bucketed as "Day" and zero
// as "Night" -- implausible for a real slate of games, and never independently
// verified since nothing here can reach the live API to check the raw values.
// Rather than debug a field this file doesn't otherwise touch, day/night now
// comes from the SAME live, verified sitCodes mechanism RISP/platoon already use
// below (codes 'd'/'n') -- see LIVE_SIT_GROUPS. One less place for this file and
// the live API to quietly disagree.

const THIN_PA = 100

// ── Live situational splits (2026-08-13) ────────────────────────────────────
// Everything below rides the SAME mechanism the 2026-08-08 platoon/RISP table
// already proved out: MLB's own statSplits + sitCodes, fetched live in the
// browser, season-long, real samples -- not something player_splits.py needs
// to carry, not something the bot-ship pipeline needs to pull. Full code list
// confirmed directly against MLB's own meta endpoint
// (statsapi.mlb.com/api/v1/situationCodes) rather than assumed.
const SIT_LABELS = {
  vl: 'vs LHP', vr: 'vs RHP', risp: 'RISP', risp2: 'RISP · 2 out',
  o0: 'No outs', o1: '1 out', o2: '2 outs',
  d: 'Day', n: 'Night',
  ac: 'Ahead in count', bc: 'Behind in count', ec: 'Even count',
  '2s': '2 strikes', fc: 'Full count',
  r0: 'Bases empty', r1: 'Runner on 1st', r2: 'Runner on 2nd', r3: 'Runner on 3rd',
  r12: 'Runners on 1st & 2nd', r13: 'Runners on 1st & 3rd', r23: 'Runners on 2nd & 3rd',
  r123: 'Bases loaded', ron: 'Runners on', ron2: 'Runners on · 2 out',
}

// Order matters within a group (display order), group order is tab order.
// 'platoon' is the existing front-door group -- unchanged default, unchanged
// hero tiles above it. Everything else is new, reachable via the pill row.
const LIVE_SIT_GROUPS = [
  { key: 'platoon', label: 'Platoon + RISP', codes: ['vl', 'vr', 'risp', 'risp2'],
    caption: 'The most decision-relevant table on this tab: which ARM he punishes, and what he does with runners in scoring position. Season-long samples, live from the StatsAPI — check the PA column, then check which hand tonight’s starter throws with.' },
  { key: 'outs', label: 'Outs', codes: ['o0', 'o1', 'o2'],
    caption: 'How he hits with 0, 1, or 2 outs in the inning. Roughly a third of his PA fall in each bucket, so these samples run bigger than most splits on this tab.' },
  { key: 'count', label: 'Count', codes: ['ac', 'bc', 'ec', '2s', 'fc'],
    caption: 'Ahead/behind/even in the count, with a 2-strikes cut and a full-count cut layered in. Full count especially is a real minority of his plate appearances — check PA before reading much into it.' },
  { key: 'daynight', label: 'Day / Night', codes: ['d', 'n'],
    caption: 'Live from the league, replacing the bot-file version of this split — see the note in this file’s header for why.' },
  { key: 'runners', label: 'Runners on base', codes: ['r0', 'r1', 'r2', 'r3', 'r12', 'r13', 'r23', 'r123', 'ron', 'ron2'],
    caption: 'Exact base-out state. Bases loaded and the two-runner combos are genuinely rare situations for any one hitter — read the PA column first, these rows will often be the thinnest on the whole tab.' },
]
const LIVE_SIT_CODES = LIVE_SIT_GROUPS.flatMap((g) => g.codes)

// ── ONE PICKER FOR EVERY SPLIT ON THIS TAB (2026-08-13) ─────────────────────
// Donovan: "a intuitive thing where i can filter home away day of the week
// certain situations. so i can see the avg and stats based on the filters."
// Before this, home/away, win/loss and day-of-week (the bot's file) sat as
// three tables stacked and always on screen, while outs/count/runners/
// platoon (the live league splits) sat behind their own separate picker,
// one group at a time — two different interaction patterns for what reads
// to him as one idea. This merges them into one pill row and one table:
// pick ANY split, bot file or live league, see its rows.
//
// What this ISN'T: a filter that reaches into the LIVE league splits (RISP,
// outs, count, runners-on, platoon). Those come back one split per sitCode
// from MLB's statSplits endpoint, not the Cartesian product of several codes
// at once — combining any of those with anything else would mean pulling
// this hitter's full play-by-play and intersecting it client-side, still a
// much bigger, separate build, not attempted here. Every one of these is
// filterable on its own, same "one active cut, not several stacked" idea
// the BBE log and the live spray/zone filters use elsewhere on this site.
const PICKER_GROUPS = [
  ...GROUPS.map((g) => ({ key: g.key, label: g.label, source: 'file' })),
  ...LIVE_SIT_GROUPS.map((g) => ({ key: g.key, label: g.label, source: 'live' })),
]

// ── COMBINE FILTERS (2026-08-13) ────────────────────────────────────────────
// Donovan, right after the picker above shipped: "how a player does on
// monday splits then at home in a win day game... i can't filter like
// that." He's right, and the picker above says so in its own comment — but
// day-of-week, home/away, result and day/night are all GAME-level facts,
// not PA-level ones. player_splits.py already visits every one of a
// hitter's games once to build its four tables; it now also keeps one raw
// row per game (date/dow/home/win/dn + that game's own box score line), at
// zero extra API cost. That's enough to build any AND-combination of these
// four client-side — "Monday AND home AND a win AND a day game" is now a
// real, if often thin, single line. RISP/outs/count/runners-on still can't
// join in — those live in the league's PA-level splits, not this file.
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function Sel({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontSize: 10.5, fontWeight: 600, padding: '4px 8px', borderRadius: 6,
        background: C.bg2, border: `1px solid ${C.border}`,
        color: value ? C.text : C.text3, cursor: 'pointer',
      }}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  )
}

// One raw row in, one aggregated line out — mirrors player_splits.py's own
// finish()/add() shape so a combo line reads exactly like every other row
// on this tab, just computed in the browser instead of the bot.
function aggregateGames(rows) {
  if (!rows.length) return { g: 0 }
  const acc = rows.reduce((a, r) => {
    a.pa += n(r.pa, 0); a.ab += n(r.ab, 0); a.h += n(r.h, 0); a.hr += n(r.hr, 0)
    a.xbh += n(r['2b'], 0) + n(r['3b'], 0) + n(r.hr, 0)
    a.bb += n(r.bb, 0); a.k += n(r.k, 0); a.rbi += n(r.rbi, 0); a.tb += n(r.tb, 0)
    return a
  }, { pa: 0, ab: 0, h: 0, hr: 0, xbh: 0, bb: 0, k: 0, rbi: 0, tb: 0 })
  return {
    _key: 'combo', split: 'Combo', g: rows.length, pa: acc.pa, hr: acc.hr,
    xbh: acc.xbh, rbi: acc.rbi, bb: acc.bb,
    avg: acc.ab ? acc.h / acc.ab : 0,
    obp: (acc.ab + acc.bb) ? (acc.h + acc.bb) / (acc.ab + acc.bb) : 0,
    slg: acc.ab ? acc.tb / acc.ab : 0,
    ops: acc.ab ? (acc.h / acc.ab) + (acc.tb / acc.ab) : 0,
    iso: acc.ab ? (acc.tb - acc.h) / acc.ab : 0,
    hrPa: acc.pa ? (100 * acc.hr) / acc.pa : 0,
    kPct: acc.pa ? (100 * acc.k) / acc.pa : 0,
    bbPct: acc.pa ? (100 * acc.bb) / acc.pa : 0,
  }
}

function ComboFilter({ games, cols }) {
  const [dow, setDow] = useState('')
  const [ha, setHa] = useState('')
  const [res, setRes] = useState('')
  const [dn, setDn] = useState('')

  const result = useMemo(() => {
    const matches = games.filter((g) => (
      (!dow || g.dow === dow) &&
      (!ha || (ha === 'home' ? g.home === true : g.home === false)) &&
      (!res || (res === 'win' ? g.win === true : g.win === false)) &&
      (!dn || g.dn === dn)
    ))
    return aggregateGames(matches)
  }, [games, dow, ha, res, dn])

  const anyOn = dow || ha || res || dn

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <Sel value={dow} onChange={setDow} placeholder="Any day"
          options={DOW.map((d) => ({ v: d, label: d }))} />
        <Sel value={ha} onChange={setHa} placeholder="Home/Away"
          options={[{ v: 'home', label: 'Home' }, { v: 'away', label: 'Away' }]} />
        <Sel value={res} onChange={setRes} placeholder="Win/Loss"
          options={[{ v: 'win', label: 'Win' }, { v: 'loss', label: 'Loss' }]} />
        <Sel value={dn} onChange={setDn} placeholder="Day/Night"
          options={[{ v: 'Day', label: 'Day game' }, { v: 'Night', label: 'Night game' }]} />
        {anyOn && (
          <button
            onClick={() => { setDow(''); setHa(''); setRes(''); setDn('') }}
            style={{ fontSize: 10, fontWeight: 700, color: C.text3, background: 'none',
              border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
            clear
          </button>
        )}
      </div>

      {!anyOn ? (
        <div style={{ fontSize: 10.5, color: C.text3, padding: '4px 0' }}>
          Pick at least one filter above to see a combined line — mix as many as you want.
        </div>
      ) : result.g === 0 ? (
        <div style={{ fontSize: 10.5, color: C.text3, padding: '4px 0' }}>
          No games matched that combination this season.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 9.5, color: result.pa < 20 ? C.orange : C.text3, fontFamily: NUM_FONT, marginBottom: 4 }}>
            {result.g} game{result.g === 1 ? '' : 's'} · {result.pa} PA
            {result.pa < 20 ? ' — very thin, read this as a curiosity, not a signal' : ''}
          </div>
          <DenseTable rows={[result]} columns={cols} initialSort={null} maxHeight={90} />
        </>
      )}
    </div>
  )
}

// column set shared by the in-body tables and the missing-file branch
const MISSING_COLS = [
  { key: 'split', label: 'Split', heat: false, w: 78, bold: true, sticky: true },
  { key: 'g', label: 'G', w: 38 }, { key: 'pa', label: 'PA', w: 44 },
  { key: 'avg', label: 'AVG', w: 52, dp: 3 }, { key: 'obp', label: 'OBP', w: 52, dp: 3 },
  { key: 'slg', label: 'SLG', w: 52, dp: 3 }, { key: 'ops', label: 'OPS', w: 54, dp: 3 },
  { key: 'iso', label: 'ISO', w: 52, dp: 3 }, { key: 'hr', label: 'HR', w: 40 },
  { key: 'hrPa', label: 'HR/PA%', w: 56, dp: 2 }, { key: 'xbh', label: 'XBH', w: 42 },
  { key: 'rbi', label: 'RBI', w: 42 },
  { key: 'bb', label: 'BB', w: 38 }, { key: 'bbPct', label: 'BB%', w: 50, dp: 1 },
  { key: 'kPct', label: 'K%', w: 46, dp: 1, invert: true },
]

// Pill-row picker, shared by every split on this tab regardless of source —
// takes whichever group list is currently available so the same component
// drives the "bot file missing" branch (live groups only) and the normal
// branch (everything).
function GroupPicker({ groups, active, onPick }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
      {groups.map((g) => {
        const on = g.key === active
        return (
          <button
            key={g.key}
            onClick={() => onPick(g.key)}
            style={{
              fontSize: 10.5, fontWeight: on ? 800 : 600,
              padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
              background: on ? C.bg2 : 'transparent',
              border: `1px solid ${on ? C.border : 'transparent'}`,
              color: on ? C.text : C.text3,
            }}>
            {g.label}
          </button>
        )
      })}
    </div>
  )
}

export default function PlayerSplits({ player, slateMode }) {
  const [data, setData] = useState(null)
  const [state, setState] = useState('idle')
  // Drives the ONE picker for every split on the tab — a key into either
  // GROUPS (bot file) or LIVE_SIT_GROUPS (live league), doesn't matter which;
  // see PICKER_GROUPS above.
  const [activeGroup, setActiveGroup] = useState('platoon')

  const pid = player?.player_id || player?.id

  // vs LHP / vs RHP / RISP / outs / count / day-night / runners-on-base — "all
  // that jazz" (2026-08-08, expanded 2026-08-13). The bot's splits file never
  // carried any of this, so it comes straight from the league: statSplits with
  // every sitCode this tab uses, one request, full stat lines verified live.
  const [lr, setLr] = useState(null)
  useEffect(() => {
    if (!pid) return
    let alive = true
    setLr(null)
    const yr = new Date().getFullYear()
    fetch(`https://statsapi.mlb.com/api/v1/people/${pid}/stats?stats=statSplits&group=hitting&season=${yr}&sitCodes=${LIVE_SIT_CODES.join(',')}&fields=stats,splits,split,code,description,stat,avg,obp,slg,ops,homeRuns,plateAppearances,gamesPlayed,strikeOuts,hits,atBats,doubles,triples,rbi,baseOnBalls`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return
        const rows = (j?.stats?.[0]?.splits || []).map((sp) => {
          const st = sp?.stat || {}
          const code = sp?.split?.code || ''
          const pa = n(st.plateAppearances, 0)
          const hr = n(st.homeRuns, 0)
          const label = SIT_LABELS[code] || sp?.split?.description || code
          return {
            _key: code || label,
            code,
            split: label,
            g: n(st.gamesPlayed, 0), pa,
            h: n(st.hits, 0), hr,
            xbh: n(st.doubles, 0) + n(st.triples, 0) + hr,
            rbi: n(st.rbi, 0),
            bb: n(st.baseOnBalls, 0),
            avg: parseFloat(st.avg) || 0, obp: parseFloat(st.obp) || 0,
            slg: parseFloat(st.slg) || 0, ops: parseFloat(st.ops) || 0,
            iso: (parseFloat(st.slg) || 0) - (parseFloat(st.avg) || 0),
            hrPa: pa ? (100 * hr) / pa : 0,
            kPct: pa ? (100 * n(st.strikeOuts, 0)) / pa : 0,
            bbPct: pa ? (100 * n(st.baseOnBalls, 0)) / pa : 0,
          }
        })
        if (rows.length) setLr(rows)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [pid])

  useEffect(() => {
    if (!pid) return
    let alive = true
    setState('loading'); setData(null)
    fetch(splitsUrl(pid, slateMode))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setData(j); setState(j ? 'done' : 'missing') } })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [pid, slateMode])

  const tables = useMemo(() => GROUPS.map((g) => {
    const src = obj(data?.[g.key])
    const keys = Object.keys(src)
    if (!keys.length) return null
    keys.sort((a, b) => {
      const ia = g.order.indexOf(a), ib = g.order.indexOf(b)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
    return {
      ...g,
      rows: keys.map((k) => {
        const s = obj(src[k])
        return {
          _key: k,
          split: k,
          g: n(s.G, 0),
          pa: n(s.PA, 0),
          h: n(s.H, 0),
          hr: n(s.HR, 0),
          xbh: n(s.XBH, 0),
          rbi: n(s.RBI, 0),
          // BB/BB% (2026-08-12): player_splits.py already writes "BB" (raw
          // count, same block as HR/XBH above) -- BB% is computed here off
          // that count and PA rather than assumed as its own bot-side key,
          // same as every other rate column on this table.
          bb: n(s.BB, 0),
          avg: n(s.AVG, 0),
          obp: n(s.OBP, 0),
          slg: n(s.SLG, 0),
          ops: n(s.OPS, 0),
          iso: n(s.ISO, 0),
          hrPa: n(s['HR/PA'], 0) * 100,
          kPct: n(s['K%'], 0) * 100,
          bbPct: n(s.PA, 0) ? (100 * n(s.BB, 0)) / n(s.PA, 0) : 0,
        }
      }),
    }
  }).filter(Boolean), [data])

  // Only offer a pill if it actually leads somewhere — a bot-file group with
  // no published table, or the whole live block before it's loaded, would
  // otherwise be a dead click.
  const availableGroups = useMemo(
    () => PICKER_GROUPS.filter((g) => (g.source === 'file' ? tables.some((t) => t.key === g.key) : !!lr)),
    [tables, lr],
  )
  // First real pick if the remembered one isn't available (yet) — bot file
  // still loading, this hitter has no file at all, or the live block hasn't
  // resolved — keeps the picker from opening on a pill that leads nowhere.
  const effectiveGroup = availableGroups.some((g) => g.key === activeGroup)
    ? activeGroup
    : availableGroups[0]?.key || null

  const activeFileTable = tables.find((t) => t.key === effectiveGroup) || null
  // Rows for the active group, IF it's a live-league one — null (not a
  // fallback to some other group) when the pick is a bot-file group instead,
  // so the two sources never get crossed under one label.
  const activeLiveRows = useMemo(() => {
    if (!lr) return null
    const group = LIVE_SIT_GROUPS.find((g) => g.key === effectiveGroup)
    if (!group) return null
    const rows = group.codes.map((c) => lr.find((r) => r.code === c)).filter(Boolean)
    return { group, rows }
  }, [lr, effectiveGroup])

  if (!pid) return null
  if (state === 'loading') return <div style={{ fontSize: 11, color: C.text3, padding: '10px 0' }}>Loading splits…</div>
  if (state === 'missing' || state === 'error' || !tables.length) {
    return (
      <div>
      {lr && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>Situational splits <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, fontWeight: 400 }}>season · live from the league</span></div>
          <GroupPicker groups={availableGroups} active={effectiveGroup} onPick={setActiveGroup} />
          {activeLiveRows && (
            <DenseTable rows={activeLiveRows.rows} columns={MISSING_COLS} initialSort={null} maxHeight={200} caption={activeLiveRows.group.caption} />
          )}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: C.text3, padding: '10px 0', lineHeight: 1.6 }}>
        No splits file published for this hitter. These come from{' '}
        <code>player_splits.py</code>, which runs inside the Today and Tomorrow workflows and can be
        skipped on a slow slate — it&apos;s set to <code>continue-on-error</code>, so a miss here means
        that step timed out rather than that anything is broken. The situational table above doesn&apos;t
        depend on that file at all, so it still works even when this message shows.
      </div>
      </div>
    )
  }

  const thin = tables.some((t) => t.rows.some((r) => r.pa < THIN_PA))
  const cols = [
    { key: 'split', label: 'Split', heat: false, w: 78, bold: true, sticky: true },
    { key: 'g',     label: 'G',   w: 38 },
    { key: 'pa',    label: 'PA',  w: 44, title: 'The sample. Read this before any rate on the row.' },
    { key: 'avg',   label: 'AVG', w: 52, dp: 3 },
    { key: 'obp',   label: 'OBP', w: 52, dp: 3 },
    { key: 'slg',   label: 'SLG', w: 52, dp: 3 },
    { key: 'ops',   label: 'OPS', w: 54, dp: 3 },
    { key: 'iso',   label: 'ISO', w: 52, dp: 3 },
    { key: 'hr',    label: 'HR',  w: 40 },
    { key: 'hrPa',  label: 'HR/PA%', w: 56, dp: 2 },
    { key: 'xbh',   label: 'XBH', w: 42 },
    { key: 'rbi',   label: 'RBI', w: 42 },
    { key: 'bb',    label: 'BB',  w: 38 },
    { key: 'bbPct', label: 'BB%', w: 50, dp: 1 },
    { key: 'kPct',  label: 'K%',  w: 46, dp: 1, invert: true,
      title: 'Inverted — a low strikeout rate is the good outcome for the hitter.' },
  ]

  // TONIGHT'S ARM, LEADING THE TAB (2026-08-08 hierarchy pass): four equal
  // tables gave the tab no front door. The platoon line for the side he'll
  // actually see tonight is the one split that moves a decision, so it opens
  // the page as tiles — the relevant side lit, the other side dim for
  // contrast, RISP along for the ride. Same live-API rows as the picker below.
  const tonightArm = String(player?.pitcher_throws || '').toUpperCase().slice(0, 1)
  const lrTiles = lr && (() => {
    const vsL = lr.find((r) => r.code === 'vl')
    const vsR = lr.find((r) => r.code === 'vr')
    const risp = lr.find((r) => r.code === 'risp')
    const tiles = [
      vsL && { label: 'vs LHP', r: vsL, hot: tonightArm === 'L' },
      vsR && { label: 'vs RHP', r: vsR, hot: tonightArm === 'R' },
      risp && { label: 'RISP', r: risp, hot: false },
    ].filter(Boolean)
    if (!tiles.length) return null
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {tiles.map(({ label, r, hot }) => (
          <div key={label}
            title={`${label}: ${r.pa} PA · ${r.avg.toFixed(3)}/${r.obp.toFixed(3)}/${r.slg.toFixed(3)} · ${r.hr} HR${hot ? ` — tonight's starter throws ${tonightArm}, this is the side he'll see` : ''}`}
            style={{
              flex: '1 1 150px', minWidth: 0,
              background: hot ? 'rgba(249,115,22,.10)' : C.bg2,
              border: `1px solid ${hot ? `${C.orange}66` : C.border}`,
              borderRadius: 10, padding: '7px 12px',
              boxShadow: hot ? '0 0 14px -4px rgba(249,115,22,.4)' : 'none',
              opacity: !hot && (label === 'vs LHP' || label === 'vs RHP') && (tonightArm === 'L' || tonightArm === 'R') ? 0.7 : 1,
            }}>
            <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: hot ? C.orange : C.text3 }}>
              {label}{hot ? " · tonight's side ⌖" : ''}
            </div>
            <div style={{ fontFamily: NUM_FONT, fontSize: 16, fontWeight: 900, color: hot ? C.orange : C.text }}>
              {r.ops.toFixed(3)} <span style={{ fontSize: 9, fontWeight: 700, color: C.text3 }}>OPS</span>
            </div>
            <div style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>
              {r.avg.toFixed(3)} AVG · {r.hr} HR · ISO {r.iso.toFixed(3)} · {r.pa} PA
            </div>
          </div>
        ))}
      </div>
    )
  })()

  return (
    <div>
      {lrTiles}
      <div style={{ fontSize: 10.5, color: C.text3, marginBottom: 10, lineHeight: 1.6, maxWidth: 760 }}>
        {clean(data?.name, '')} · {n(data?.games_logged, 0)} games logged · {clean(data?.season, '')} season.
        {' '}Every column is shaded against its own range <b style={{ color: C.text2 }}>within each table</b>,
        so a bright cell means high for this hitter across that one split — never across splits or
        against the league. K% is inverted; everything else reads bright-is-better for the bat.
      </div>

      {/* ── ONE PICKER, EVERY SPLIT (2026-08-13) ─────────────────────────
          Donovan: "an intuitive thing where i can filter home away day of
          the week certain situations. so i can see the avg and stats based
          on the filters." Home/away, win/loss and day-of-week (the bot's
          file) used to sit as three tables stacked here, always all on
          screen at once; outs/count/runners/platoon (the live league
          splits) sat behind a second, separate picker above this section.
          One pill row now, spanning both sources — which table you're
          looking at is a tap, not a scroll. See PICKER_GROUPS for why this
          picks ONE split at a time rather than intersecting several. */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 800 }}>Splits</span>
          <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
            pick a filter — bot file and live league, all in one place
          </span>
        </div>
        <GroupPicker groups={availableGroups} active={effectiveGroup} onPick={setActiveGroup} />

        {activeFileTable && (() => {
          const thinnest = Math.min(...activeFileTable.rows.map((r) => r.pa))
          return (
            <>
              <div style={{ fontSize: 9.5, color: thinnest < THIN_PA ? C.orange : C.text3, fontFamily: NUM_FONT, marginBottom: 4 }}>
                season · from the bot&apos;s file · {activeFileTable.rows.length} rows · thinnest {thinnest} PA
              </div>
              <DenseTable
                rows={activeFileTable.rows}
                columns={cols}
                initialSort={null}
                maxHeight={260}
                caption={
                  activeFileTable.key === 'day_of_week'
                    ? 'Seven ways to cut one season. Every row here is a few dozen plate appearances, which is not enough to separate any hitter from himself — a 130-point gap between two weekdays is two or three hits. This table is here because the bot publishes it, not because it should move a decision.'
                    : thinnest < THIN_PA
                      ? `The smallest row here is ${thinnest} plate appearances. Under about 100, batting average moves 30 points on three hits, so treat the gap between these rows as noise unless it is very large.`
                      : 'Both rows clear 100 plate appearances, which is enough to be worth a look — though a season split is still one season, and the gap you see is usually smaller next year.'
                }
              />
            </>
          )
        })()}

        {!activeFileTable && activeLiveRows && (
          <>
            <div style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, marginBottom: 4 }}>
              season · live from the league
            </div>
            <DenseTable
              rows={activeLiveRows.rows}
              columns={cols}
              initialSort={null}
              maxHeight={260}
              caption={activeLiveRows.group.caption}
            />
          </>
        )}

        {!activeFileTable && !activeLiveRows && (
          <div style={{ fontSize: 10.5, color: C.text3, padding: '10px 0' }}>Loading this split…</div>
        )}
      </div>

      {/* ── COMBINE FILTERS (2026-08-13) ─────────────────────────────────
          Donovan: "how a player does on monday splits then at home in a
          win day game... i can't filter like that." See the dated comment
          on ComboFilter above for why day-of-week/home-away/result/day-
          night specifically CAN be intersected, and RISP/outs/count/
          runners-on still can't. */}
      {Array.isArray(data?.games) && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 800 }}>🔀 Combine filters</span>
            <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
              day of week + home/away + result + day-night, all at once
            </span>
          </div>
          {!data.games.length ? (
            <div style={{ fontSize: 10.5, color: C.text3, padding: '6px 0' }}>
              This hitter&apos;s file doesn&apos;t carry per-game rows yet — publishes on the next slate this runs for.
            </div>
          ) : (
            <ComboFilter games={data.games} cols={cols} />
          )}
        </div>
      )}

      {thin && (
        <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.6, marginTop: -4 }}>
          Situational splits are the most over-read numbers in baseball. A hitter who is &quot;better at
          night&quot; usually just faced different pitchers at night. Nothing here is park- or
          opponent-adjusted, so a home/away gap partly measures the two ballparks and not the hitter.
        </div>
      )}
    </div>
  )
}
