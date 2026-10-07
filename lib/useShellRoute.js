'use client'
// ONE SHELL ROUTER FOR THE LIVE-DATA PRODUCTS (2026-10-02). LAMP's routing --
// the address contract, the trail, Back that returns where you came from,
// detail pages that push one marked history entry, deep links, hashchange --
// moved out of components/lamp/LampDashboard.js line for line so BUCKETS runs
// on the same code instead of a copy that drifts (Donovan 10-02: change the
// architecture now). Every rule and its reason is kept below; what differs per
// product is config:
//   sport, nav (the product's NAV table), datedTabs, ids ({ game, team, player }
//   regexes), keep ({ game, m, player, team }: tabs that keep that param), rewrite
//   (r, get) -> r (e.g. LAMP's board&m=sog -> shots).
//
// THE ADDRESS CONTRACT, identical across products so a link is a link
// everywhere: #sport=<s>&tab=<key>[&date=YYYY-MM-DD][&game=<id>][&team=<code>]
// [&player=<id>] (`p=` is read as `player=`).
//   · an unknown tab answers NO SUCH TAB, never a silent Home or a blank div;
//   · a TAB YOU TAP pushes one history entry, so Back returns to the tab you
//     came from (setTab's push); arriving on an address replaces. A detail page
//     pushes ONE marked entry. Same rule on all four products (Donovan
//     2026-10-04: "Back = previous tab"; MOONSHOT's and TUDDY's shells too);
//   · a hash naming another sport is a sport switch.
import { useEffect, useRef, useState } from 'react'
import { resolveTab } from './routes'
import { canonLedgerHash, queueLedgerView } from './ledger/views'
import { resolveColdTab } from './shellRoute'
import { initialHashParams, setSport } from './sport'
import { writeHash, hashParams, closeOpenedStack } from './urlState'
import { listenForWorkerOpen } from './workerOpen'
import { etToday } from './freshness'
import { useTabView } from './tabView'

// The detail entry's marker. Named for LAMP, where it began; every shell uses
// it now (writeHashParam in components/lamp/ui.js preserves exactly this key).
export const DETAIL_MARK = 'lampDetail'
// THE PLAYER PEEK (2026-10-03, Donovan: "I don't like that LAMP doesn't have
// a player modal like the other sites"). A tap on a player opens his card OVER
// the page you are on (components/PlayerPeek.js), MOONSHOT's way: one marked
// history entry carrying `pm=<id>`, so Back closes it and a shared link opens
// it; "Full page" is the old player page (openPlayer).
export const PEEK_MARK = 'shellPeek'
// The tabs of a player card pushed on top of its entry (lib/urlState cardViewPush); closing steps back over them.
export const VIEWS_KEY = 'lampViews'

export const readParam = (k) => { try { return hashParams().get(k) } catch { return null } }
/** `date=` only when it is a REAL calendar day (2026-13-45 is not); else null. */
export function readDay() {
  const d = readParam('date')
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '')
  if (!m) return null
  const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return t.getUTCFullYear() === +m[1] && t.getUTCMonth() === +m[2] - 1 && t.getUTCDate() === +m[3] ? d : null
}
export function writeParam(key, value) {
  try {
    const h = hashParams()
    if (value == null || value === '') h.delete(key); else h.set(key, String(value))
    writeHash(h, { state: window.history.state?.[DETAIL_MARK] ? { [DETAIL_MARK]: true } : null })
  } catch { /* the page still works without the address */ }
}

/** THE TAB-SWITCH ADDRESS (R7, 2026-10-04): what a tap on a tab writes, one rule
 *  for every shell that edits the live hash (this hook -- LAMP, BUCKETS -- and
 *  TUDDY's NflDashboard). `keep` maps a param to the tabs that keep it (any
 *  other tab drops it); `clearOnChange` params go whenever the tab changes.
 *  `changed` = there was a tab and it is a different one: the push rule
 *  ("Back = previous tab"; arriving on an address replaces). MOONSHOT's
 *  Dashboard builds its address from state instead -- its move is R7 core. */
export function tabSwitchHash(raw, { sport, next, keep = {}, clearOnChange = [] }) {
  const hash = new URLSearchParams(String(raw || '').replace(/^#/, ''))
  const was = hash.get('tab')
  hash.set('sport', sport)
  hash.set('tab', next)
  for (const [param, tabs] of Object.entries(keep)) if (!tabs.has(next)) hash.delete(param)
  const changed = Boolean(was) && was !== next
  if (changed) for (const k of clearOnChange) hash.delete(k)
  return { hash, changed }
}

// `night` (optional): the slate date the server calls tonight (lib/slateNight). A product that
// has it follows the server's night, not the ET wall clock, so a late game stays Today past 00:00 ET.
export function useShellRoute({ sport, nav, datedTabs, ids, keep = {}, rewrite = (r) => r, night = null }) {
  const TABS = useRef(new Set(Object.keys(nav))).current
  const keepGame = new Set(['game', ...(keep.game || [])])
  const keepM = new Set(keep.m || [])
  const keepPlayer = new Set(['player', ...(keep.player || [])])
  const keepTeam = new Set(['team', ...(keep.team || [])])
  const [tab, setTabRaw] = useState('home')
  useTabView(sport, tab)
  const tabRef = useRef('home')
  useEffect(() => { tabRef.current = tab }, [tab])
  const [gameId, setGameId] = useState(null)
  const [teamKey, setTeamKey] = useState(null)
  const [playerId, setPlayerId] = useState(null)
  const [peekId, setPeekId] = useState(null)
  // what readHash needs to tell "Back closed the card" from a real move
  const peekRef = useRef(null)
  useEffect(() => { peekRef.current = peekId }, [peekId])
  const [missingTab, setMissingTab] = useState('')
  // ONE DAY FOR THE WHOLE SHELL: null = today; rides the address on the dated tabs.
  const [date, setDateRaw] = useState(() => readDay())
  // A date= that isn't a real day becomes tonight -- and the page says so, once.
  const [badDate, setBadDate] = useState('')
  useEffect(() => { const raw = readParam('date'); if (raw && !readDay()) setBadDate(String(raw).slice(0, 20)) }, [])
  const setDate = (d) => setDateRaw(d && d !== (night || etToday()) ? d : null)
  useEffect(() => { if (datedTabs.has(tab)) writeParam('date', date) }, [tab, date]) // eslint-disable-line react-hooks/exhaustive-deps

  // a tab you tap adds a history entry, so Back returns to the last one; the mount-time resolve replaces
  const setTab = (asked, { push = true } = {}) => {
    // an old key (results, lampledger ...) opens the page it became; an old Ledger key also queues its sub-tab
    const r0 = resolveTab(sport, asked)
    if (r0.status === 'alias' && r0.view) queueLedgerView(r0.view)
    const next = r0.status === 'alias' ? r0.tab : asked
    if (!TABS.has(next)) return
    // Leaving through the chrome is a fresh start, not a step on the trail.
    if (next !== 'game' && next !== 'team' && next !== 'player') trail.current = []
    setMissingTab('')
    setTabRaw(next)
    try {
      const { hash, changed } = tabSwitchHash(window.location.hash, { sport, next,
        keep: { game: keepGame, m: keepM, date: datedTabs, team: keepTeam, player: keepPlayer, p: keepPlayer, lv: new Set(['ledger']) } })
      if (changed && next !== 'player') hash.delete('view')   // a card's tab belongs to the card
      // a detail page keeps its entry's marker; never the whole history.state (lib/urlState.js)
      const detail = next === 'game' || next === 'team' || next === 'player'
      const keepMark = detail && window.history.state?.[DETAIL_MARK] ? { [DETAIL_MARK]: true } : null
      writeHash(hash, { push: push && !detail && changed, state: keepMark })
    } catch { /* the tab still works without the address */ }
  }

  // ── THE TRAIL: a detail page goes back to where it was opened from ──
  // Every opener records the view it left (tab + its id or day); goBack()
  // restores it and the button is labelled with that place. Opening a detail
  // page PUSHES one marked history entry, so the browser's Back agrees.
  const trail = useRef([])
  // which page + id the address names (not its view=), so a card's tab change is not a move
  const keyOf = (h) => `${h.get('tab') || ''}|${h.get('game') || ''}|${h.get('team') || ''}|${h.get('player') || h.get('p') || ''}`
  const detailKey = useRef('')
  const here = () => ({ tab, gameId, teamKey, playerId, date: readParam('date') })
  const remember = () => {
    const h = here()
    const top = trail.current[trail.current.length - 1]
    if (top && top.tab === h.tab && top.gameId === h.gameId && top.teamKey === h.teamKey && top.playerId === h.playerId && top.date === h.date) return
    trail.current = [...trail.current.slice(-11), h]
  }
  const backTarget = () => trail.current[trail.current.length - 1] || null
  const backLabel = (fallback) => nav[backTarget()?.tab || fallback]?.label || nav[fallback]?.label || 'Back'
  const goBack = (fallback) => {
    if (window.history.state?.[DETAIL_MARK]) { trail.current.pop(); closeOpenedStack(DETAIL_MARK, VIEWS_KEY, () => {}); return }
    // opened by a link and moved through its tabs: step back over them first, then go where the trail says
    if (Number(window.history.state?.[VIEWS_KEY]) > 0) { closeOpenedStack(DETAIL_MARK, VIEWS_KEY, () => goBackTrail(fallback)); return }
    goBackTrail(fallback)
  }
  const goBackTrail = (fallback) => {
    const to = trail.current.pop()
    if (!to) { setTab(fallback); return }
    if (to.tab === 'game' && to.gameId) setGameId(to.gameId)
    if (to.tab === 'team' && to.teamKey) setTeamKey(to.teamKey)
    if (to.tab === 'player' && to.playerId) setPlayerId(to.playerId)
    setTab(to.tab)
    if (to.tab === 'game' && to.gameId) writeParam('game', to.gameId)
    if (to.tab === 'team' && to.teamKey) writeParam('team', to.teamKey)
    if (to.tab === 'player' && to.playerId) writeParam('player', to.playerId)
    if (to.date && datedTabs.has(to.tab)) { writeParam('date', to.date); setDateRaw(to.date) }
  }
  // one new history entry for a detail page, pushed ONCE with its final address and marked
  const openDetail = (next, key, value) => {
    try {
      const h = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
      h.set('sport', sport); h.set('tab', next)
      for (const k of ['game', 'team', 'player', 'p', 'pm', 'view']) h.delete(k)
      if (!datedTabs.has(next)) h.delete('date')
      h.set(key, value)
      detailKey.current = keyOf(h)
      window.history.pushState({ [DETAIL_MARK]: true }, '', `#${h.toString()}`)
    } catch { /* the page still works without the address */ }
    setMissingTab('')
    setPeekId(null)
    setTabRaw(next)
  }
  const openGame = (id) => { if (!ids.game.test(String(id || ''))) return; remember(); setGameId(String(id)); openDetail('game', 'game', String(id)) }
  const openTeam = (code) => { const c = String(code || '').toUpperCase(); if (!ids.team.test(c)) return; remember(); setTeamKey(c); openDetail('team', 'team', c) }
  const openPlayer = (id) => { if (!ids.player.test(String(id || ''))) return; remember(); setPlayerId(String(id)); openDetail('player', 'player', String(id)) }
  // the peek: same page underneath, one marked entry, Back closes it
  const peekPlayer = (id) => {
    const v = String(id || '')
    if (!ids.player.test(v)) return
    try {
      const h = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
      h.set('sport', sport); h.set('pm', v); h.delete('view')
      if (window.history.state?.[PEEK_MARK]) window.history.replaceState({ [PEEK_MARK]: true }, '', `#${h.toString()}`)
      else window.history.pushState({ [PEEK_MARK]: true }, '', `#${h.toString()}`)
    } catch { /* the card still opens without the address */ }
    setPeekId(v)
  }
  const closePeek = () => {
    // the card's tabs sit on top of its entry: step back over all of them (lib/urlState closeOpenedStack)
    closeOpenedStack(PEEK_MARK, VIEWS_KEY, () => {
      try {
        const h = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
        h.delete('pm'); h.delete('view'); window.history.replaceState(null, '', `#${h.toString()}`)
      } catch { /* ignore */ }
      setPeekId(null)
    })
  }
  // ‹ › on a card: another man, same entry, same tab (a replace, so Back does not walk the list)
  const stepPlayer = (id) => {
    const v = String(id || '')
    if (!ids.player.test(v)) return
    try {
      const h = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
      const st = window.history.state || {}
      const keep = {}
      for (const k of [PEEK_MARK, DETAIL_MARK, VIEWS_KEY]) if (st[k]) keep[k] = st[k]
      if (peekId) h.set('pm', v); else { h.set('player', v); h.delete('p') }
      window.history.replaceState(Object.keys(keep).length ? keep : null, '', `#${h.toString()}`)
      detailKey.current = keyOf(h)
    } catch { /* the card still moves without the address */ }
    if (peekId) setPeekId(v); else setPlayerId(v)
  }

  // Deep links: the live hash answers when it names this product, else the snapshot.
  const hashDone = useRef(false)
  useEffect(() => {
    if (hashDone.current) return
    hashDone.current = true
    try {
      const live = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
      // `p=` is rewritten to `player=` before the tab resolves
      if (live.get('sport') === sport && live.get('p') && !live.get('player')) {
        live.set('player', live.get('p')); live.delete('p')
        window.history.replaceState(null, '', `#${live.toString()}`)
      }
    } catch { /* ignore */ }
    try { detailKey.current = keyOf(new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))) } catch { /* ignore */ }
    canonLedgerHash(sport)   // #tab=lampledger -> #tab=ledger&lv=called, before the tab is resolved
    const snap = initialHashParams()
    const get = (k) => readParam(k) || snap.get(k)
    const r = rewrite(resolveColdTab(sport, window.location.hash, snap.get('tab')), get)
    if (r.status === 'missing') { setMissingTab(r.asked); return }
    const g = get('game')
    // any id that's there goes through -- the Game page says NO SUCH GAME for a bad one (audit 14 N2)
    if (r.tab === 'game' && g) setGameId(String(g))
    const tm = String(get('team') || '').toUpperCase()
    if (r.tab === 'team' && ids.team.test(tm)) setTeamKey(tm)
    // any id a link carries reaches the player page, so a bad one can say NO SUCH PLAYER
    const pl = readParam('player') || readParam('p') || snap.get('player') || snap.get('p')
    if (r.tab === 'player' && pl) setPlayerId(String(pl).slice(0, 20))
    const pm = readParam('pm') || snap.get('pm')
    if (pm && ids.player.test(String(pm))) setPeekId(String(pm))
    setTab(r.tab, { push: false })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Typed and browser-driven hash changes stay in sync with the panel.
  useEffect(() => {
    const readHash = () => {
      try {
        canonLedgerHash(sport)
        const hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
        const sp = hash.get('sport')
        if (sp && sp !== sport) { setSport(sp); return }
        if (sp !== sport) return
        const r = rewrite(resolveTab(sport, hash.get('tab')), (k) => hash.get(k))
        if (r.status === 'missing') { setMissingTab(r.asked); return }
        setMissingTab('')
        if (r.tab === 'game') { const g = hash.get('game'); if (g) setGameId(String(g)) }
        if (r.tab === 'team') { const tm = String(hash.get('team') || '').toUpperCase(); if (ids.team.test(tm)) setTeamKey(tm) }
        if (r.tab === 'player') { const pl = hash.get('player') || hash.get('p'); if (pl) setPlayerId(String(pl).slice(0, 20)) }
        const pm = hash.get('pm')
        setPeekId(pm && ids.player.test(String(pm)) ? String(pm) : null)
        // a Back that only closed the peek leaves the page (and its trail) as it was
        if (hash.get('tab') === tabRef.current && !pm && peekRef.current) { peekRef.current = null; return }
        const dk = keyOf(hash)
        if (dk !== detailKey.current) trail.current = []   // a card's tab change is not a move
        detailKey.current = dk
        setDateRaw(readDay())
        setTabRaw(r.tab)
      } catch { /* ignore malformed hashes */ }
    }
    window.addEventListener('hashchange', readHash)
    // a push tapped while the product is open lands where it says
    const stopWorker = listenForWorkerOpen(readHash)
    return () => { window.removeEventListener('hashchange', readHash); stopWorker() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { tab, setTab, gameId, teamKey, playerId, missingTab, date, setDate, badDate, setBadDate, openGame, openTeam, openPlayer, backLabel, goBack, peekId, peekPlayer, closePeek, stepPlayer }
}
