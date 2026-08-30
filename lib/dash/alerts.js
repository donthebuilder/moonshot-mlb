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
  // ── MOONSHOT ──
  { key: 'homer', sport: 'mlb', label: 'Homers', detail: 'A pick or a followed player goes deep', kinds: ['hr'], live: true },
  { key: 'atbat', sport: 'mlb', label: 'At the plate', detail: 'Your pick is batting right now', kinds: ['up'], live: true },
  { key: 'cleared', sport: 'mlb', label: 'Bars cleared', detail: 'Doubles, triples, and a pick clearing its bar', kinds: ['d2', 'd3', 'clr', 'tb4'], live: false },
  { key: 'cold', sport: 'mlb', label: 'Going cold', detail: 'A pick is 0-for with strikeouts piling up', kinds: ['k'], live: false },
  { key: 'slate', sport: 'mlb', label: 'Any slate homer', detail: 'Anyone goes deep, not just your names', kinds: ['anyhr'], live: false },
  // ── TUDDY (2026-08-28, once components/nfl/NflWire.js gave football a live
  // feed to diff — see lib/nfl/liveSlate.js for why it needed one) ──
  { key: 'nfltd', sport: 'nfl', label: 'Touchdowns', detail: 'A pinned or followed player finds the end zone', kinds: ['nfltd'], live: true },
  { key: 'nflbar', sport: 'nfl', label: 'Bars cleared', detail: 'He crosses the bar on one of the seven markets', kinds: ['nflbar'], live: false },
  { key: 'nflkick', sport: 'nfl', label: 'Kickoff', detail: 'A game with one of your names in it starts', kinds: ['nflkick'], live: false },
]

const DEFAULTS = {
  homer: true, atbat: true, cleared: true, cold: true, slate: false,
  nfltd: true, nflbar: true, nflkick: false,
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
  return { prefs, setMaster, setCategory }
}
