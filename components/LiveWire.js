'use client'
import { useEffect, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import PriceBubble from './PriceBubble'
import { hrPerGame } from '../lib/odds'
import { nameOf, teamOf, clean, playerId as pidOf } from '../lib/player'
import { fetchLiveSlate, pickCleared } from '../lib/liveSlate'
import { teamAbbrs } from '../lib/gamelogs'
import { fetchPenFatigue, penTier } from '../lib/bullpen'
import { leagueRates, tonightTotals } from '../lib/leagueRates'
import { ActiveFilters, FilterBar, FilterSearch, FilterSelect } from './Filters'

// 📡 LIVE WIRE — the site's live feed, and deliberately NOT a highlight
// ticker (ESPN owns that). This is the model grading itself in public:
//   · every designated pick, live, against its own category bar — ✓ cleared,
//     still working, or ran out of at-bats
//   · every homer tonight as it lands, tagged 🤖 when the bot had him and
//     ★ when he's on your watchlist
//   · the slate's games with score and inning as the spine
// Refresh is a button, plus an opt-in 60s auto while the tab is visible.
// Nothing polls in the background; nothing here feeds a score.

const ROLE_COLOR = { TOP: '#FCD34D', HR: '#FB923C', HIT: '#60A5FA', HRR: '#22d3ee', CONTACT: '#A78BFA' }
// Fixed, so a category is always in the same place on the board.
const GROUP_ORDER = ['TOP', 'HR', 'HIT', 'HRR', 'CONTACT']
const primaryRole = (p) => String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()

export default function LiveWire({ players = [], results, watchIds, mode = 'today', odds = null, onPlayerClick }) {
  const [snap, setSnap] = useState(null)
  const [busy, setBusy] = useState(false)
  const [auto, setAuto] = useState(false)
  const [open, setOpen] = useState(true)
  const [pickQuery, setPickQuery] = useState('')
  const [pickRole, setPickRole] = useState('all')
  const [pickState, setPickState] = useState('all')
  const [abbrs, setAbbrs] = useState(null)
  const timer = useRef(null)
  useEffect(() => { teamAbbrs().then(setAbbrs).catch(() => {}) }, [])
  const [pen, setPen] = useState(null)
  useEffect(() => { fetchPenFatigue().then(setPen).catch(() => {}) }, [])
  // League hits-per-game, so tonight's total has something to be measured
  // against. Cached for six hours in lib/leagueRates — a season rate does not
  // move between innings.
  const [rates, setRates] = useState(null)
  useEffect(() => { leagueRates().then(setRates).catch(() => {}) }, [])

  // The button means "now" — it bypasses the shared 15s snapshot cache in
  // lib/liveSlate.js. The auto timer does not: that's exactly the caller the
  // cache exists to collapse against MiniWire and At the Plate.
  const refresh = async (force = false) => {
    setBusy(true)
    const s = await fetchLiveSlate({ force })
    setSnap(s); setBusy(false)
  }
  useEffect(() => { refresh() }, [])
  useEffect(() => {
    clearInterval(timer.current)
    if (auto) timer.current = setInterval(() => { if (!document.hidden) refresh() }, 60000)
    return () => clearInterval(timer.current)
  }, [auto])

  if (mode === 'tomorrow') return null // tonight instrument — see MiniWire
  if (!snap) return null
  const live = snap.games.filter((g) => g.state === 'Live')
  const finals = snap.games.filter((g) => g.state === 'Final')
  // Pregame: the wire waits. But a rain delay BEFORE first pitch leaves the
  // game in Preview forever, so a slate that's entirely delayed would have
  // shown nothing at all — the one night you most want to be told.
  const anyStopped = snap.games.some((g) => g.delayed || g.postponed || g.suspended)
  if (!live.length && !finals.length && !anyStopped) return null

  const abbrFor = (p) => teamOf(p)
  // designated picks with live lines
  const picks = players
    .filter((p) => primaryRole(p))
    .map((p) => {
      const line = snap.lines[Number(p?.player_id ?? p?.id)]
      const role = primaryRole(p)
      return { p, role, line, cleared: line ? pickCleared(role, line) : null }
    })
    // ROUND 3 ordering: the HUNT leads. Still-working live picks are the
    // actionable rows; cleared ✓ follow as receipts; dead ✗ finals sink.
    .sort((a, b) => {
      const rank = (x) => !x.line ? 4
        : x.cleared === false && !x.line.settled ? 0
        : x.cleared === true ? 1
        // A stopped game outranks a finished one: it's still a live ticket.
        : x.line.delayed || x.line.suspended || x.line.postponed ? 2
        : 3
      return rank(a) - rank(b)
    })
    .filter((row, index, all) => all.findIndex((other) => (
      Number(pidOf(other.p)) === Number(pidOf(row.p)) && other.role === row.role
    )) === index)
  const graded = picks.filter((x) => x.line)
  const pickStateOf = (row) => row.cleared === true ? 'cleared'
    : !row.line?.settled ? 'live'
    : row.line?.ab === 0 || row.line?.postponed ? 'void'
    : 'missed'
  const pickNeedle = pickQuery.trim().toLowerCase()
  const visibleGraded = graded.filter((row) => (
    (pickRole === 'all' || row.role === pickRole)
    && (pickState === 'all' || pickStateOf(row) === pickState)
    && (!pickNeedle || `${nameOf(row.p)} ${teamOf(row.p)} ${row.role}`.toLowerCase().includes(pickNeedle))
  ))
  const roleOptions = [{ key: 'all', label: 'All markets', count: graded.length }, ...GROUP_ORDER.map((key) => ({
    key, label: key, count: graded.filter((row) => row.role === key).length,
  })).filter((option) => option.count)]
  const stateOptions = [
    { key: 'all', label: 'All states', count: graded.length },
    { key: 'live', label: 'Still working', count: graded.filter((row) => pickStateOf(row) === 'live').length },
    { key: 'cleared', label: 'Cleared', count: graded.filter((row) => pickStateOf(row) === 'cleared').length },
    { key: 'missed', label: 'Missed', count: graded.filter((row) => pickStateOf(row) === 'missed').length },
    { key: 'void', label: 'Void', count: graded.filter((row) => pickStateOf(row) === 'void').length },
  ].filter((option) => option.key === 'all' || option.count)
  const clearedCount = graded.filter((x) => x.cleared === true).length
  // Games the weather stopped. Kept separate from `live` and `finals` because
  // they belong to neither: nothing is happening, and nothing is decided.
  const stopped = snap.games.filter((g) => g.delayed || g.postponed || g.suspended)

  // every homer tonight, model-tagged
  const slateIds = new Map(players.map((p) => [Number(p?.player_id ?? p?.id), p]))
  const homers = Object.entries(snap.lines)
    .filter(([, l]) => l.hr > 0)
    .map(([id, l]) => {
      const p = slateIds.get(Number(id))
      return { id: Number(id), p, l, role: p ? primaryRole(p) : '', watched: p && watchIds?.has(pidOf(p)) }
    })
    .sort((a, b) => (b.role ? 1 : 0) - (a.role ? 1 : 0) || b.l.hr - a.l.hr)

  // ── 🔔 LOOK OUT — the notification layer: live tension, not results.
  // A cashed pair is news; a pair ONE LEG FROM cashing while the other leg's
  // game is still going is an alert. Same for pools one swing away and picks
  // running out of innings. Max eight, urgency-ordered.
  const alerts = []
  const lineOf = (x) => snap.lines[Number(x?.player_id)]
  const gameOf = (pkOrLine) => snap.games.find((g) => g.pk === (pkOrLine?.pk ?? pkOrLine))
  ;(results?.pair_pool_results?.all_pairs || []).forEach((pr) => {
    const la = lineOf(pr.a), lb = lineOf(pr.b)
    const aHR = la?.hr > 0, bHR = lb?.hr > 0
    if (aHR && bHR) {
      alerts.push({ pri: 0, icon: '💰', text: `PAIR CASHED — ${clean(pr.a?.name, '?')} + ${clean(pr.b?.name, '?')} both went deep (${pr.label})` })
    } else if (aHR || bHR) {
      const done = aHR ? pr.a : pr.b, needs = aHR ? pr.b : pr.a
      const nl = aHR ? lb : la
      if (nl?.state === 'Live') {
        alerts.push({ pri: 1, icon: '🎟', p: slateIds.get(Number(needs?.player_id)),
          text: `${clean(done?.name, '?')} went deep — ${clean(needs?.name, '?')} completes the "${pr.label}" pair, game live` })
      }
    }
  })
  ;(results?.pair_pool_results?.graded_pools || []).forEach((pl) => {
    const hit = Number(pl.hr_count) || 0, tot = Number(pl.total_count) || 0
    if (!tot) return
    const anyLive = (pl.players || []).some((mb) => lineOf(mb)?.state === 'Live')
    if (hit >= tot) alerts.push({ pri: 0, icon: '💰', text: `POOL CASHED — ${pl.label}, all ${tot} went deep` })
    else if (tot - hit === 1 && anyLive) {
      const missing = (pl.players || []).filter((mb) => !(lineOf(mb)?.hr > 0)).map((mb) => clean(mb?.name, '?'))
      alerts.push({ pri: 1, icon: '🎟', text: `${pl.label} is ${hit}/${tot} — one swing from cashing (${missing.join(', ')})` })
    }
  })
  // ⏸ WEATHER FIRST. A stopped game changes what every other row on this
  // board means, so it outranks a cashed pair — top priority, always shown.
  stopped.forEach((g) => {
    const away = abbrs?.[g.awayId] || '?'; const home = abbrs?.[g.homeId] || '?'
    const mine = graded.filter((x) => x.line?.pk === g.pk && x.cleared !== true).length
    const tail = g.postponed
      ? 'no at-bats will be played — those picks are void, not losses'
      : g.suspended
        ? 'it resumes later, so nothing is decided yet'
        : 'picks stay open until it resumes or is called'
    alerts.push({
      pri: 0, icon: g.postponed ? '🚫' : '⏸',
      text: `${away} @ ${home} — ${g.detail || 'delayed'}${mine ? ` (${mine} pick${mine > 1 ? 's' : ''} waiting)` : ''} — ${tail}`,
    })
  })
  graded.forEach(({ p, role, line, cleared }) => {
    if (cleared !== false && cleared !== null) return
    if (line.state !== 'Live' || line.delayed) return   // don't nag during a stoppage
    const g = gameOf(line)
    if (!g?.inning || g.inning < 7) return
    const need = role === 'HR' || role === 'TOP' ? 'a homer'
      : role === 'HIT' ? 'a hit'
      : role === 'HRR' ? `2+ H+R+RBI (has ${line.h + line.r + line.rbi})`
      : `2+ TB (has ${line.tb})`
    alerts.push({ pri: 2, icon: '⏰', p, text: `${nameOf(p)} (${role} pick) still needs ${need} — ${g.inning}th inning` })
  })
  // 🚪 BULLPEN DOOR (2026-08-07): a starter climbing toward 90 means the
  // soft underbelly is coming — and if that team's pen threw hard YESTERDAY,
  // the two facts together are the alert. Pen data from yesterday's
  // boxscores (lib/bullpen), starter counts live off tonight's.
  live.forEach((g) => {
    (g.starters || []).forEach((st) => {
      if (!st?.pitches || st.pitches < 85) return
      const tier = penTier(pen?.[st.teamId])
      const nm = String(st.name || '').split(' ').slice(-1)[0]
      if (tier?.key === 'gassed') {
        const t2 = pen[st.teamId]
        alerts.push({ pri: 1, icon: '🚪', text: `${nm} at ${st.pitches} pitches AND his pen threw ${t2.pitches} pitches yesterday (${t2.used} arms) — gassed relief is the HR window` })
      } else if (st.pitches >= 95) {
        alerts.push({ pri: 2, icon: '🚪', text: `${nm} at ${st.pitches} pitches — bullpen door opening` })
      }
    })
  })
  Object.entries(snap.lines).forEach(([id, l]) => {
    if (l.hr >= 2) {
      const p = slateIds.get(Number(id))
      alerts.push({ pri: 3, icon: '🚀', p, text: `${p ? nameOf(p) : `#${id}`} has ${l.hr} HR tonight${l.state === 'Live' ? ' — still batting' : ''}` })
    }
  })
  alerts.sort((a, b) => a.pri - b.pri)
  const topAlerts = alerts.slice(0, 8)

  // ── ROUND 3 (2026-08-08, Donovan: "tell when people still need a hit,
  // make the live at-bats better, look better in general") ──

  // what each working pick still needs, in plain words + urgency by inning
  const needOf = (role, line) => {
    const combo3 = line.h + line.r + line.rbi
    if (role === 'HIT') return 'needs a hit'
    if (role === 'HRR') return combo3 >= 2 ? null : `needs ${2 - combo3} more H+R+RBI`
    if (role === 'CONTACT') return line.tb >= 2 ? null : `needs ${2 - line.tb} more TB`
    return 'needs a homer'
  }
  const stillWorking = graded.filter((x) => x.cleared === false && !x.line.settled)

  // ── WHAT A ROW IS ALLOWED TO SAY (2026-08-09) ─────────────────────────────
  // The old rule was one line: final game → ✗. It was wrong twice.
  //
  //   1. A POSTPONED game reports abstractGameState "Final". Every pick in it
  //      was being marked a loss the instant the league posted the rainout,
  //      before those hitters had taken a swing. See lib/liveSlate.js.
  //   2. A hitter with 0 AB in a completed game was also marked ✗ — scratched,
  //      or a bench bat who never came up. He didn't miss; he was never asked.
  //      The bot's own tracker already voids these legs. The board was
  //      counting them against the model when the archive doesn't.
  //
  // Five states now, and only ONE of them is a loss.
  const rowState = (cleared, line) => {
    if (cleared === true) return { mark: '✓', color: '#4ade80', why: 'Cleared its own bar.' }
    if (line.postponed) return { mark: '⊘', color: '#a1a1aa', why: `Game postponed (${line.detail}) — void, not a loss. No at-bats will be played.` }
    if (line.suspended) return { mark: '⏸', color: '#60A5FA', why: `Game suspended (${line.detail}) — it resumes later, so this pick is still open.` }
    if (line.delayed) return { mark: '⏸', color: '#60A5FA', why: `Game delayed (${line.detail}) — play is stopped, nothing is decided.` }
    if (!line.settled) return { mark: '…', color: C.text3, why: 'Still working — his game is live.' }
    if (line.ab === 0) return { mark: '⊘', color: '#a1a1aa', why: 'Never got an at-bat — scratched or never came up. Void, not a miss: the archive doesn’t count these either.' }
    return { mark: '✗', color: 'rgba(248,113,113,.85)', why: 'Game over without clearing its bar. This one counts against the model.' }
  }

  // 🎤 AT THE PLATE — every slate name up or on deck RIGHT NOW, across all
  // live games. Tap opens his card (zones + spray + EV log live there).
  const atThePlate = []
  live.forEach((g) => {
    [[g.upBatter, 'up'], [g.onDeck, 'deck']].forEach(([bid, when]) => {
      const p = slateIds.get(Number(bid))
      if (!p) return
      const role = primaryRole(p)
      const pk2 = { role, watched: watchIds?.has(pidOf(p)) }
      if (!role && !pk2.watched) return
      const half = /top/i.test(g.half) ? '▲' : /bot/i.test(g.half) ? '▼' : ''
      atThePlate.push({
        p, when, role, watched: pk2.watched,
        ctx: `${abbrs?.[g.awayId] || ''}–${abbrs?.[g.homeId] || ''} ${half}${g.inning ?? ''}`,
        need: role ? needOf(role, snap.lines[Number(pidOf(p))] || { h: 0, r: 0, rbi: 0, tb: 0 }) : null,
      })
    })
  })
  atThePlate.sort((a, b) => (a.when === 'up' ? 0 : 1) - (b.when === 'up' ? 0 : 1))

  const SecLbl = ({ children }) => (
    <div style={{ fontSize: 8, fontWeight: 900, color: C.text3, letterSpacing: '.12em', textTransform: 'uppercase', fontFamily: NUM_FONT, margin: '10px 0 4px' }}>
      {children}
    </div>
  )

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(74,222,128,.025))`,
      border: '1px solid rgba(74,222,128,.22)', borderRadius: 12,
      padding: '9px 13px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', cursor: 'pointer' }}
        onClick={() => setOpen((v) => !v)}>
        <span style={{ fontSize: 12, fontWeight: 900, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 6 }}>
          {live.length > 0 && (
            <span style={{
              width: 7, height: 7, borderRadius: '50%', background: '#4ade80',
              boxShadow: '0 0 8px #4ade80', animation: 'wirePulse 1.6s ease-in-out infinite',
            }} />
          )}
          📡 Live wire {open ? '▾' : '▸'}
        </span>
        <style>{'@keyframes wirePulse{0%,100%{opacity:1}50%{opacity:.35}}'}</style>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
          {live.length ? `${live.length} live` : 'slate final'}
          {graded.length > 0 && <> · <b style={{ color: '#4ade80' }}>{clearedCount}</b>/{graded.length} cleared</>}
          {stillWorking.length > 0 && <> · <b style={{ color: '#FCD34D' }}>{stillWorking.length}</b> still hunting</>}
          {homers.length > 0 && <> · {homers.reduce((a, h) => a + h.l.hr, 0)} HR</>}
        </span>
        {/* 🥎 THE NIGHT'S BATS, with a yardstick. A raw hit total is a number;
            the same total against what a slate this size usually produces is a
            read. Scaled by GAMES UNDER WAY, not by the calendar — see
            lib/leagueRates for why "per day" is the wrong unit. */}
        {(() => {
          const t = tonightTotals(snap)
          if (!t.started || !t.hits) return null
          const exp = rates ? rates.hitsPerGame * t.started : null
          const done = t.final === t.started
          const pct = exp ? (100 * t.hits) / exp : null
          const col = pct == null ? C.text3 : pct >= 112 ? C.orange : pct <= 88 ? '#60a5fa' : C.text2
          return (
            <span
              title={rates
                ? `${t.hits} base hits across ${t.started} game${t.started === 1 ? '' : 's'} under way. `
                  + `The league has averaged ${rates.hitsPerGame.toFixed(2)} hits per game across `
                  + `${rates.games.toLocaleString()} games this season, so a ${t.started}-game slate `
                  + `typically produces about ${Math.round(exp)}. `
                  + `${done ? 'All those games are final.' : 'Games are still in progress, so the count is still climbing.'}`
                : `${t.hits} base hits across ${t.started} game${t.started === 1 ? '' : 's'} under way. Loading the league average to compare against.`}
              style={{ fontSize: 10, fontFamily: NUM_FONT, color: C.text3, cursor: 'help' }}>
              🥎 <b style={{ color: col }}>{t.hits}</b> hits
              {exp != null && (
                <span style={{ color: C.text3 }}>
                  {' '}vs <b style={{ color: C.text3 }}>~{Math.round(exp)}</b> typical
                  {done ? '' : ' (still going)'}
                </span>
              )}
            </span>
          )
        })()}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setAuto((v) => !v)} title="Re-pull every 60s while this tab is visible" style={{
            fontSize: 9, fontWeight: 700, fontFamily: NUM_FONT, cursor: 'pointer', borderRadius: 6, padding: '2px 8px',
            border: `1px solid ${auto ? '#4ade80' : C.border}`, background: auto ? 'rgba(74,222,128,.12)' : 'transparent',
            color: auto ? '#4ade80' : C.text3,
          }}>{auto ? '● auto 60s' : '○ auto'}</button>
          <button onClick={() => refresh(true)} disabled={busy} style={{
            fontSize: 9, fontWeight: 700, fontFamily: NUM_FONT, cursor: 'pointer', borderRadius: 6, padding: '2px 8px',
            border: `1px solid ${C.border}`, background: 'transparent', color: C.text3,
          }}>{busy ? '…' : '↻ refresh'}</button>
        </span>
      </div>

      {open && (
        <div style={{ maxHeight: 'min(62vh, 520px)', overflowY: 'auto', paddingRight: 3, marginTop: 5 }}>
          {graded.length > 0 && (
            <div style={{
              position: 'sticky', zIndex: 3, top: 0, display: 'flex', flexDirection: 'column', gap: 6,
              padding: '7px 8px', marginBottom: 5, border: `1px solid ${C.border}`,
              borderRadius: 9, background: C.bg2,
            }}>
              <FilterBar>
                <FilterSearch value={pickQuery} onChange={setPickQuery} placeholder="Find live pick…" width={145} />
                <FilterSelect value={pickRole} options={roleOptions} onChange={setPickRole} />
                <FilterSelect value={pickState} options={stateOptions} onChange={setPickState} />
                <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 8.5 }}>{visibleGraded.length}/{graded.length} picks</span>
              </FilterBar>
              <ActiveFilters
                filters={[
                  pickQuery && { key: 'query', label: pickQuery, onClear: () => setPickQuery('') },
                  pickRole !== 'all' && { key: 'role', label: pickRole, onClear: () => setPickRole('all') },
                  pickState !== 'all' && { key: 'state', label: stateOptions.find((item) => item.key === pickState)?.label || pickState, onClear: () => setPickState('all') },
                ]}
                onClearAll={() => { setPickQuery(''); setPickRole('all'); setPickState('all') }}
              />
            </div>
          )}
          {/* 🎤 at the plate — the wire's heartbeat: your names batting NOW.
              Tap = his full card, where the zone map and spray chart live. */}
          {atThePlate.length > 0 && (
            <>
              <SecLbl>🎤 At the plate</SecLbl>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {atThePlate.slice(0, 6).map((ab2, i) => (
                  <button key={i} onClick={() => onPlayerClick?.(ab2.p)}
                    title="Open his card — zone map, spray chart and live EV log inside"
                    style={{
                      display: 'flex', gap: 7, alignItems: 'baseline', cursor: 'pointer',
                      border: `1px solid ${ab2.when === 'up' ? 'rgba(74,222,128,.55)' : 'rgba(252,211,77,.35)'}`,
                      background: ab2.when === 'up' ? 'rgba(74,222,128,.09)' : 'rgba(252,211,77,.05)',
                      borderRadius: 8, padding: '4px 11px',
                      boxShadow: ab2.when === 'up' ? '0 0 12px rgba(74,222,128,.15)' : 'none',
                    }}>
                    <span style={{ fontSize: 11 }}>{ab2.when === 'up' ? '🎤' : '⏳'}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: C.text }}>{nameOf(ab2.p)}</span>
                    {ab2.role && <span style={{ fontSize: 8.5, fontWeight: 900, fontFamily: NUM_FONT, color: ROLE_COLOR[ab2.role] || C.orange }}>🤖 {ab2.role}</span>}
                    {ab2.watched && <span style={{ fontSize: 9 }}>★</span>}
                    {ab2.need && <span style={{ fontSize: 9, color: '#FCD34D', fontFamily: NUM_FONT }}>{ab2.need}</span>}
                    <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>{ab2.ctx}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* 🔔 look out — live tension, urgency-ordered */}
          {topAlerts.length > 0 && (
            <>
            <SecLbl>🔔 Look out</SecLbl>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {topAlerts.map((a, i) => (
                <div key={i} onClick={() => a.p && onPlayerClick?.(a.p)} style={{
                  display: 'flex', gap: 7, alignItems: 'baseline', cursor: a.p ? 'pointer' : 'default',
                  fontSize: 10.5, lineHeight: 1.45, padding: '3px 8px', borderRadius: 7,
                  background: a.pri === 0 ? 'rgba(74,222,128,.09)' : a.pri === 1 ? 'rgba(252,211,77,.07)' : 'rgba(255,255,255,.02)',
                  border: `1px solid ${a.pri === 0 ? 'rgba(74,222,128,.35)' : a.pri === 1 ? 'rgba(252,211,77,.28)' : C.border}`,
                }}>
                  <span style={{ fontSize: 11, flexShrink: 0 }}>{a.icon}</span>
                  <span style={{ color: a.pri <= 1 ? C.text : C.text2, fontWeight: a.pri === 0 ? 800 : 600 }}>{a.text}</span>
                </div>
              ))}
            </div>
            </>
          )}

          {/* the spine: every game, score and inning, live first */}
          {abbrs && (live.length + finals.length + stopped.length) > 0 && (
            <>
            <SecLbl>🏟 The slate</SecLbl>
            {/* Stopped games lead. They used to sit in the Final pile at 55%
                opacity wearing an "F" — the single most misleading chip on the
                page, since nothing about a rainout is final. */}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {[...stopped, ...live.filter((g) => !g.delayed), ...finals.filter((g) => g.settled)].map((g) => {
                const isStopped = g.delayed || g.postponed || g.suspended
                const isLive = !isStopped && g.state === 'Live'
                const half = /top/i.test(g.half) ? '▲' : /bot/i.test(g.half) ? '▼' : ''
                const sCol = g.postponed ? '#a1a1aa' : isStopped ? '#60A5FA' : isLive ? '#4ade80' : C.text3
                return (
                  <div key={g.pk}
                    title={isStopped
                      ? `${g.detail}${g.inning ? ` — stopped in the ${g.inning}` : ''}. ${g.postponed ? 'No at-bats will be played; picks in it are void, not losses.' : 'Nothing is decided — picks stay open.'}`
                      : isLive ? `${g.detail} — ${g.half} ${g.inning}` : g.detail}
                    style={{
                      display: 'flex', gap: 5, alignItems: 'baseline', fontFamily: NUM_FONT,
                      border: `1px solid ${isStopped ? `${sCol}66` : isLive ? 'rgba(74,222,128,.35)' : C.border}`,
                      background: isStopped ? `${sCol}12` : isLive ? 'rgba(74,222,128,.05)' : 'transparent',
                      borderRadius: 6, padding: '2px 8px', opacity: isLive || isStopped ? 1 : 0.55,
                    }}>
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: C.text2 }}>
                      {abbrs[g.awayId] || '?'} <b style={{ color: C.text }}>{g.awayScore ?? '-'}</b>
                      {'–'}
                      <b style={{ color: C.text }}>{g.homeScore ?? '-'}</b> {abbrs[g.homeId] || '?'}
                    </span>
                    <span style={{ fontSize: 8.5, fontWeight: 900, color: sCol }}>
                      {isStopped ? `${g.postponed ? '🚫' : '⏸'} ${g.statusLabel}` : isLive ? `${half}${g.inning ?? ''}` : 'F'}
                    </span>
                  </div>
                )
              })}
            </div>
            </>
          )}

          {/* homers as they land, model-tagged */}
          {homers.length > 0 && (
            <>
            <SecLbl>💥 Tonight&apos;s homers</SecLbl>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {homers.map((h) => (
                <button key={h.id} onClick={() => h.p && onPlayerClick?.(h.p)} style={{
                  display: 'flex', gap: 6, alignItems: 'baseline', cursor: h.p ? 'pointer' : 'default',
                  border: `1px solid ${h.role ? 'rgba(249,115,22,.5)' : C.border}`,
                  background: h.role ? 'rgba(249,115,22,.08)' : 'rgba(255,255,255,.02)',
                  borderRadius: 7, padding: '3px 9px',
                }}>
                  <span style={{ fontSize: 11 }}>💥</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: h.p ? C.text : C.text3 }}>
                    {h.p ? nameOf(h.p) : (h.l.name || `#${h.id}`)}{h.l.hr > 1 ? ` ×${h.l.hr}` : ''}
                  </span>
                  {h.role && <span style={{ fontSize: 8.5, fontWeight: 900, color: ROLE_COLOR[h.role] || C.orange, fontFamily: NUM_FONT }}>🤖 {h.role}</span>}
                  {h.watched && <span style={{ fontSize: 9 }}>★</span>}
                </button>
              ))}
            </div>
            </>
          )}

          {/* the picks, graded live against their own bars */}
          {graded.length > 0 && (
            <>
            <SecLbl>🤖 The picks — live vs their own bars</SecLbl>
            {/* GROUPED BY PICK TYPE (2026-08-15, Donovan: "group the plaeyeres
                by pick type. so its easier to findplayers"). One flat list
                sorted hunt-first meant HR picks were scattered between HIT and
                CONTACT ones and finding "did my HR guys go" was a scan of the
                whole board.

                Groups sit in a FIXED order — that's the point of grouping.
                A category that moves position depending on how its picks are
                doing is no easier to find than no grouping at all. Hunt-first
                ordering is kept INSIDE each group, where it still does its job.

                The 44px per-row role column is gone with it: the header says
                the category now, and those 44px go back to the name, which
                this file's own comment already called out as too tight. */}
            {GROUP_ORDER.map((gRole) => {
              const rows = visibleGraded.filter((x) => x.role === gRole)
              if (!rows.length) return null
              const col = ROLE_COLOR[gRole] || C.text3
              const got = rows.filter((x) => x.cleared === true).length
              const openN = rows.filter((x) => x.cleared === false && !x.line.settled).length
              return (
                <div key={gRole} style={{ marginBottom: 7 }}>
                  <div style={{
                    display: 'flex', alignItems: 'baseline', gap: 7,
                    padding: '2px 0 3px', borderBottom: `1px solid ${col}2e`, marginBottom: 3,
                  }}>
                    <span style={{
                      fontSize: 9, fontWeight: 900, fontFamily: NUM_FONT,
                      color: col, letterSpacing: '.08em',
                    }}>{gRole}</span>
                    <span style={{ fontSize: 8.5, fontFamily: NUM_FONT, color: C.text3 }}>
                      {got}/{rows.length} cleared{openN ? ` · ${openN} still live` : ''}
                    </span>
                  </div>
            <div className="wire-picks" style={{ display: 'grid', gap: 3, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
              {rows.map(({ p, role, line, cleared }) => {
                const st = rowState(cleared, line)
                const status = st.mark
                const sCol = st.color
                // Round 2 (2026-08-07): the counting markets show live progress
                // toward their own bar, and a pick literally at the plate says so.
                const g = gameOf(line)
                const pid2 = Number(p?.player_id ?? p?.id)
                const due = line.state === 'Live' && g
                  ? (g.upBatter === pid2 ? '🎤' : g.onDeck === pid2 ? '⏳' : '')
                  : ''
                const combo2 = line.h + line.r + line.rbi
                const prog = cleared === true ? null
                  : role === 'HRR' ? `${Math.min(combo2, 2)}/2`
                  : (role === 'CONTACT' || role === 'TB') ? `${Math.min(line.tb, 2)}/2`
                  : null
                return (
                  <div key={pidOf(p)} onClick={() => onPlayerClick?.(p)} title={st.why} className="tap-row" style={{
                    display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', minWidth: 0,
                    padding: '3px 6px', borderRadius: 6,
                    background: cleared === true ? 'rgba(74,222,128,.06)'
                      : (line.delayed || line.suspended) ? 'rgba(96,165,250,.07)' : 'transparent',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 900, color: sCol, width: 13, flexShrink: 0, textAlign: 'center' }}>{status}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>
                      {nameOf(p)}
                    </span>
                    {/* .live-marker: Quiet mode hides these two glyphs — a
                        running "he is up NOW" notification on a board you are
                        trying to read. The row, the name and every number on
                        it stay exactly where they were. */}
                    {due && <span className="live-marker" title={due === '🎤' ? 'At the plate RIGHT NOW' : 'On deck'} style={{ fontSize: 10, flexShrink: 0 }}>{due}</span>}
                    {/* A stopped game says so on the row itself — the reason a
                        pick isn't moving belongs beside the pick, not only in
                        the alert strip above it. */}
                    {(line.delayed || line.suspended || line.postponed) && (
                      <span style={{ fontSize: 8.5, fontWeight: 900, fontFamily: NUM_FONT, color: line.postponed ? '#a1a1aa' : '#60A5FA', flexShrink: 0 }}>
                        {line.postponed ? 'PPD' : line.suspended ? 'SUSP' : 'DELAY'}
                      </span>
                    )}
                    {/* ROUND 3: uncleared + live = say WHAT he still needs,
                        colored by how late it's getting */}
                    {cleared === false && line.state === 'Live' && !line.delayed && needOf(role, line) && (
                      <span title={`${needOf(role, line)} — ${g?.inning ? `${g.inning}th inning` : 'game live'}`} style={{
                        fontSize: 8.5, fontWeight: 800, fontFamily: NUM_FONT, flexShrink: 0,
                        color: (g?.inning ?? 0) >= 7 ? '#f87171' : (g?.inning ?? 0) >= 5 ? '#FCD34D' : C.text3,
                      }}>{needOf(role, line)}{(g?.inning ?? 0) >= 7 ? ` · ${g.inning}th` : ''}</span>
                    )}
                    {prog && <span title="Live progress toward this pick's own bar" style={{ fontSize: 8.5, fontWeight: 900, fontFamily: NUM_FONT, color: prog.startsWith('1') ? '#FCD34D' : C.text3, flexShrink: 0 }}>{prog}</span>}
                    {/* 💸 what it paid. On a live board the price is the one
                        thing that can't change under you, so it belongs beside
                        the grade rather than only pre-game. */}
                    <PriceBubble odds={odds} player={p} cat={role}
                      rate={role === 'HR' || role === 'TOP' ? hrPerGame(p) : null} />
                    <span style={{ fontSize: 9, fontFamily: NUM_FONT, color: C.text3, flexShrink: 0 }}>
                      {line.h}-{line.ab}{line.hr ? ` ${line.hr}HR` : ''}{line.tb > 1 ? ` ${line.tb}TB` : ''}
                    </span>
                  </div>
                )
              })}
            </div>
                </div>
              )
            })}
            {!visibleGraded.length && (
              <div style={{ padding: 14, border: `1px dashed ${C.border}`, borderRadius: 8, color: C.text3, fontSize: 10, textAlign: 'center' }}>
                No live pick matches these filters.
              </div>
            )}
            </>
          )}

          <div style={{ fontSize: 8.5, color: C.text3, marginTop: 7, lineHeight: 1.5 }}>
            The model grading itself in public: each pick against ITS OWN bar (HR homers, HIT a hit,
            HRR 2+ H+R+RBI, CONTACT 2+ TB). <b style={{ color: '#4ade80' }}>✓</b> cleared ·{' '}
            <b style={{ color: C.text3 }}>…</b> still working ·{' '}
            <b style={{ color: '#60A5FA' }}>⏸</b> his game is stopped, nothing decided ·{' '}
            <b style={{ color: '#a1a1aa' }}>⊘</b> void — postponed, or he never got an at-bat ·{' '}
            <b style={{ color: 'rgba(248,113,113,.85)' }}>✗</b> game over without it, and this one counts
            against the model. A pick is only ✗ once his game is genuinely done. 💥 chips
            are every slate homer tonight, orange when the bot had him. Boxscore truth, refreshed when
            you ask{auto ? ' (auto every 60s while visible)' : ''} — no background polling.
          </div>
        </div>
      )}
    </div>
  )
}
