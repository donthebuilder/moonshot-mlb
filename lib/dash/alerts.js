'use client'

// 🔔 WHAT YOU WANT TO BE TOLD.
//
// The alert pipeline already exists and is good — components/MiniWire.js polls
// the live slate, diffs it, and pushes homers, at-bats, cleared bars and cold
// starts through the service worker (lib/notify.js). What it never had was a
// SETTING. One bell, on or off, and a set of rules about which events reach
// the OS that were decided in the code and nowhere visible. Turning off the
// strikeout alert meant turning off homers too.
//
// This is that setting, and it lives on the account (lib/dash/sync.js) rather
// than the device, because "tell me when a guy I follow goes deep" is a fact
// about a person, not about a browser.
//
// THE MASTER SWITCH IS STILL `wire_notif`. MiniWire's bell has written that
// key since 2026-08-06 and people have it set; making the panel a second
// source of truth would mean a bell that says on and a panel that says off.
// Both write both. This file is the one that knows they are the same switch.
//
// WHAT THIS CAN AND CANNOT DO — rewritten 2026-08-30, because the paragraph
// that used to sit here ("with the site fully CLOSED, nothing arrives... this
// site publishes nothing and stores nothing of the sort by design") stopped
// being true on 2026-08-28 and nobody came back for it. Web Push DOES exist
// now: VAPID keys are configured, app/api/dash/push/subscribe stores a
// subscription per device, and app/api/dash/push/tick decides what to send on
// a cron (added to vercel.json 2026-08-30 — it could not exist before, because
// Hobby caps cron at once a day and the sender is written for ten minutes).
//
// The limit that IS still real, and the one the panel states: only two of the
// eight categories below can reach a closed device — `homer` and `nfltd`.
// lib/dash/pushRules.js produces those two and nothing else. Every other
// category is an in-app/OS toast from components/MiniWire.js and needs a tab
// open somewhere. components/AlertsPanel.js says exactly this on screen; if a
// third category ever becomes pushable, pushRules is where it starts.

import { useCallback, useEffect, useState } from 'react'

import { markDirty } from './sync'

const KEY = 'dash_alerts_v1'
const BELL = 'wire_notif'
export const ALERTS_EVENT = 'dash-alerts-change'

// Each category names the toast kinds MiniWire fires for it. `live: true` means
// it reaches the OS even while you are looking at the site — reserved for the
// two events with a shelf life, which is the rule that was already in the code
// (2026-08-09: "if a pick is at the plate I need a noti").
export const CATEGORIES = [
  // ── MOONSHOT ──────────────────────────────────────────────────────────────
  { key: 'homer', sport: 'mlb', group: 'Moonshot', scope: 'personal', priority: 0, push: true, live: true,
    label: 'Homers', detail: 'A followed hitter goes deep', kinds: ['hr'] },
  { key: 'lineup', sport: 'mlb', group: 'Moonshot', scope: 'personal', priority: 1, push: true, live: false,
    label: 'Lineup posted', detail: 'He is in tonight, and where he is batting', kinds: [] },
  { key: 'ondeck', sport: 'mlb', group: 'Moonshot', scope: 'personal', priority: 1, push: true, live: false,
    label: 'Coming up', detail: 'On deck or in the hole — time to go and watch', kinds: [] },
  { key: 'clutch', sport: 'mlb', group: 'Moonshot', scope: 'personal', priority: 1, push: true, live: false,
    label: 'Clutch spot', detail: 'At the plate late, runners on, game in the balance', kinds: [] },
  { key: 'multihit', sport: 'mlb', group: 'Moonshot', scope: 'personal', priority: 2, push: true, live: false,
    label: 'Multi-hit', detail: 'Two hits, and again at three', kinds: [] },
  { key: 'xbh', sport: 'mlb', group: 'Moonshot', scope: 'personal', priority: 2, push: true, live: false,
    label: 'Extra-base hit', detail: 'He doubles or triples', kinds: ['d2', 'd3'] },
  { key: 'hrr', sport: 'mlb', group: 'Moonshot', scope: 'personal', priority: 2, push: true, live: false,
    label: 'HRR cleared', detail: 'Hits + runs + RBI reaches two', kinds: [] },
  { key: 'bigbases', sport: 'mlb', group: 'Moonshot', scope: 'personal', priority: 2, push: true, live: false,
    label: 'Big bases', detail: 'Four or more total bases', kinds: [] },
  { key: 'cold', sport: 'mlb', group: 'Moonshot', scope: 'personal', priority: 3, push: true, live: false,
    label: 'Going cold', detail: '0-for with the strikeouts piling up', kinds: ['k'] },
  { key: 'firstpitch', sport: 'mlb', group: 'Moonshot', scope: 'personal', priority: 3, push: true, live: false,
    label: 'First pitch', detail: 'A game with one of your names starts', kinds: [] },
  { key: 'finalline', sport: 'mlb', group: 'Moonshot', scope: 'personal', priority: 3, push: true, live: false,
    label: 'Final line', detail: 'His night is over — here is the line', kinds: [] },
  { key: 'slate', sport: 'mlb', group: 'Moonshot', scope: 'everyone', priority: 4, push: true, live: false,
    label: 'Any slate homer', detail: 'Anyone goes deep, not just your names', kinds: ['anyhr'] },
  { key: 'atbat', sport: 'mlb', group: 'Moonshot', scope: 'personal', priority: 1, push: false, live: true,
    label: 'At the plate', detail: 'Your pick is batting right now', kinds: ['up'] },
  { key: 'cleared', sport: 'mlb', group: 'Moonshot', scope: 'personal', priority: 2, push: false, live: false,
    label: 'Bar cleared', detail: "A bot pick clears its own category bar", kinds: ['clr', 'tb4'] },

  // ── MOONSHOT, BEFORE FIRST PITCH ──────────────────────────────────────────
  // The only four that reach you while you can still act. About two on a normal
  // night between them, which is why they ship on rather than off.
  { key: 'boardup', sport: 'mlb', group: 'Moonshot', scope: 'personal', priority: 1, push: true, live: false,
    label: "Tonight's board is up", detail: 'How many of your names are on it, and the best one', kinds: [] },
  { key: 'lastcall', sport: 'mlb', group: 'Moonshot', scope: 'personal', priority: 1, push: true, live: false,
    label: 'Last call', detail: 'Your names are half an hour from first pitch', kinds: [] },
  { key: 'gameoff', sport: 'mlb', group: 'Moonshot', scope: 'personal', priority: 0, push: true, live: false,
    label: 'Game is off', detail: 'Postponed, suspended or delayed', kinds: [] },
  { key: 'scratched', sport: 'mlb', group: 'Moonshot', scope: 'personal', priority: 0, push: true, live: false,
    label: 'Not in the lineup', detail: 'The card is posted and he is not on it', kinds: [] },

  // ── TUDDY ─────────────────────────────────────────────────────────────────
  { key: 'nfltd', sport: 'nfl', group: 'Tuddy', scope: 'personal', priority: 0, push: true, live: true,
    label: 'Touchdowns', detail: 'A followed player finds the end zone', kinds: ['nfltd'] },
  { key: 'nflbig', sport: 'nfl', group: 'Tuddy', scope: 'personal', priority: 2, push: true, live: false,
    label: 'Big day', detail: '100 rushing or receiving, 300 passing', kinds: [] },
  { key: 'nflclose', sport: 'nfl', group: 'Tuddy', scope: 'personal', priority: 2, push: true, live: false,
    label: 'Close game', detail: 'One score in the fourth, with your name in it', kinds: [] },
  { key: 'nflkick', sport: 'nfl', group: 'Tuddy', scope: 'personal', priority: 3, push: true, live: false,
    label: 'Kickoff', detail: 'A game with one of your names starts', kinds: ['nflkick'] },
  { key: 'nflbar', sport: 'nfl', group: 'Tuddy', scope: 'personal', priority: 2, push: false, live: false,
    label: 'Market bar', detail: 'He crosses the bar on one of the seven markets', kinds: ['nflbar'] },

  // ── FRANCHISE ─────────────────────────────────────────────────────────────
  // Addressed to you, not broadcast to followers, and all four are priority 0
  // because all four expire. On by default: a draft happens once, and an
  // alert nobody switched on in advance is an alert nobody gets.
  { key: 'frdraft', sport: 'fantasy', group: 'Franchise', scope: 'personal', priority: 0, push: true, live: false,
    label: 'Draft is live', detail: 'Your league started drafting', kinds: [] },
  { key: 'frclock', sport: 'fantasy', group: 'Franchise', scope: 'personal', priority: 0, push: true, live: false,
    label: 'You are on the clock', detail: 'Your pick, and how long is left on it', kinds: [] },
  { key: 'frauto', sport: 'fantasy', group: 'Franchise', scope: 'personal', priority: 0, push: true, live: false,
    label: 'Auto-picked', detail: 'The timer ran out and the board picked for you', kinds: [] },
  { key: 'frlineup', sport: 'fantasy', group: 'Franchise', scope: 'personal', priority: 0, push: true, live: false,
    label: 'Lineup not set', detail: 'A starting spot is still empty and kickoff is close', kinds: [] },
]

// WHAT REACHES A CLOSED DEVICE. `push: true` means lib/dash/pushRules.js has a
// producer for it and the cron can send it with no tab open anywhere.
// `push: false` is an in-app toast from components/MiniWire.js and needs the
// site open — either because its meaning expires faster than the cron runs
// (at the plate), or because it grades against the bot's own role and line for
// that player tonight, which the sender does not read (the two bar categories).
export const PUSHABLE = CATEGORIES.filter((c) => c.push).map((c) => c.key)

// PRESETS. The whole list is a lot to hand somebody, and the honest default is
// the quiet one: two categories, only your names, only the thing you followed
// them for. The others are opt-in and say what they cost.
export const PRESETS = [
  {
    key: 'essentials', label: 'Essentials', detail: 'The pregame four, homers and touchdowns. About 4-5 a night.',
    on: ['homer', 'nfltd', 'boardup', 'lastcall', 'gameoff', 'scratched',
         'frdraft', 'frclock', 'frauto', 'frlineup'],
  },
  {
    key: 'closely', label: 'Following closely', detail: 'How your guys are doing, without opening the site. Around 10 a night.',
    on: ['homer', 'nfltd', 'boardup', 'lastcall', 'gameoff', 'scratched',
         'frdraft', 'frclock', 'frauto', 'frlineup',
         'lineup', 'ondeck', 'multihit', 'xbh', 'bigbases', 'nflbig', 'finalline'],
  },
  {
    key: 'everything', label: 'Everything', detail: 'Every alert about your names. Around 20 a night, never more than one message per minute.',
    on: CATEGORIES.filter((c) => c.push && c.scope === 'personal').map((c) => c.key),
  },
]

const DEFAULTS = (() => {
  const out = {}
  // Everything off, then the essentials on. A category nobody has touched must
  // default to silence: this is a message that arrives on a locked phone.
  CATEGORIES.forEach((c) => { out[c.key] = false })
  PRESETS[0].on.forEach((k) => { out[k] = true })
  // The in-app toasts keep the behaviour they have always had -- they cost
  // nothing when the site is closed, because they cannot fire then.
  CATEGORIES.filter((c) => !c.push).forEach((c) => { out[c.key] = true })
  return out
})()

/** Which preset these settings are, or 'custom'. */
export function presetOf(events) {
  const on = new Set(Object.entries(events || {}).filter(([k, v]) => v && PUSHABLE.includes(k)).map(([k]) => k))
  for (const p of PRESETS) {
    if (p.on.length === on.size && p.on.every((k) => on.has(k))) return p.key
  }
  return 'custom'
}

const KIND_TO_CATEGORY = (() => {
  const map = {}
  CATEGORIES.forEach((cat) => cat.kinds.forEach((kind) => { map[kind] = cat.key }))
  return map
})()

const readRaw = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    return raw && typeof raw === 'object' ? raw : null
  } catch { return null }
}

const bellOn = () => {
  try { return localStorage.getItem(BELL) === 'on' } catch { return false }
}

/** Current preferences, with every category resolved. Safe to call anywhere. */
export function alertPrefs() {
  const raw = readRaw()
  const events = { ...DEFAULTS, ...(raw?.events && typeof raw.events === 'object' ? raw.events : {}) }
  return { on: bellOn(), events }
}

function persist(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ events: next.events }))
    localStorage.setItem(BELL, next.on ? 'on' : 'off')
  } catch { /* private mode */ }
  try { window.dispatchEvent(new Event(ALERTS_EVENT)) } catch { /* ignore */ }
  markDirty()
  return next
}

export function setAlertMaster(on) {
  const prefs = alertPrefs()
  return persist({ ...prefs, on: Boolean(on) })
}

export function setAlertCategory(key, on) {
  const prefs = alertPrefs()
  if (!(key in DEFAULTS)) return prefs
  return persist({ ...prefs, events: { ...prefs.events, [key]: Boolean(on) } })
}

/**
 * Apply a preset: everything in it on, everything else PUSHABLE off.
 *
 * Deliberately leaves the in-app-only categories alone. A preset is an answer
 * to "how much should my phone buzz", and the three categories that cannot
 * reach a phone are not part of that question -- silently switching off the
 * at-the-plate toast because somebody chose Essentials would be a surprise
 * they never asked for.
 *
 * One persist, one sync, one re-render. Twenty-three calls to
 * setAlertCategory would be twenty-three of each.
 */
export function setAlertPreset(key) {
  const prefs = alertPrefs()
  const preset = PRESETS.find((p) => p.key === key)
  if (!preset) return prefs
  const events = { ...prefs.events }
  PUSHABLE.forEach((k) => { events[k] = preset.on.includes(k) })
  return persist({ ...prefs, events })
}

/**
 * Should this toast also become an OS notification?
 *
 * Preserves the rule that was already in MiniWire — homers and at-the-plate
 * reach you with the tab open, everything else waits until it is hidden — and
 * adds the only new thing: a category you switched off never fires.
 *
 * An UNKNOWN kind falls back to the old priority rule rather than being
 * dropped. A new event type added upstream should be noisy and then get a
 * category, not be silently swallowed by a settings file that hasn't heard
 * of it.
 */
export function alertWanted(prefs, toast, hidden) {
  if (!prefs?.on) return false
  const kind = toast?.kind ? String(toast.kind) : null
  const category = kind ? KIND_TO_CATEGORY[kind] : null
  if (!category) return toast?.pri <= 0.5 || (hidden && toast?.pri <= 2)
  if (!prefs.events[category]) return false
  const spec = CATEGORIES.find((c) => c.key === category)
  return spec?.live ? true : Boolean(hidden)
}

export function useAlertPrefs() {
  const [prefs, setPrefs] = useState({ on: false, events: DEFAULTS })
  useEffect(() => {
    const sync = () => setPrefs(alertPrefs())
    sync()
    window.addEventListener(ALERTS_EVENT, sync)
    window.addEventListener('storage', sync)
    window.addEventListener('dash-sync-applied', sync)
    return () => {
      window.removeEventListener(ALERTS_EVENT, sync)
      window.removeEventListener('storage', sync)
      window.removeEventListener('dash-sync-applied', sync)
    }
  }, [])

  const setMaster = useCallback((on) => setPrefs(setAlertMaster(on)), [])
  const setCategory = useCallback((key, on) => setPrefs(setAlertCategory(key, on)), [])
  const setPreset = useCallback((key) => setPrefs(setAlertPreset(key)), [])
  return { prefs, setMaster, setCategory, setPreset }
}
