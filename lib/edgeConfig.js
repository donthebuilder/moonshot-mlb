// lib/edgeConfig.js
//
// Thin wrapper around @vercel/edge-config for MOONSHOT's kill-switch flags.
//
// The EDGE_CONFIG env var is injected into this project automatically once
// the "moonshot-config" Edge Config store (Vercel > Storage) is connected to
// it. Nothing else to configure -- just import and use the functions below.
//
// Design choice: every read FAILS OPEN. If Edge Config is unreachable, slow,
// or a key is missing, these functions return the provided default rather
// than throwing. This store exists to make an incident recoverable -- it
// should never become a new way for things to break.

import { get } from '@vercel/edge-config'

// NOT CONNECTED YET IS NOT A FAILURE (item 13, 2026-09-11). Every tick route
// that calls a getFlag()-based check (homers/tick, push/tick, fantasy/scoring)
// fires roughly once a minute, and no "moonshot-config" Edge Config store has
// ever been connected to this Vercel project -- so, until one is, EVERY single
// call here was hitting the catch below and logging an ERROR-level line
// ("No connection string provided"), ~1,440 times a day, drowning out real
// errors in Runtime Logs for a condition that isn't actually wrong: every kill
// switch this file exposes is designed to fail open exactly like this. That's
// a genuinely unconfigured feature working as intended, not a runtime fault --
// so it shouldn't cost an error-level log every single call, forever, unless
// Donovan actually wants these kill switches live (connecting the store in
// Vercel > Storage is what turns this from silent-default back into a real
// flag read -- nothing in this file needs to change for that).
//
// `process.env.EDGE_CONFIG` is what @vercel/edge-config's own get() checks
// before doing anything else -- reading it here first, before ever calling
// get(), means "not configured" returns the default immediately and quietly.
// A genuine failure AFTER that point (the store IS connected, but a read
// still throws -- unreachable, malformed, timed out) is the real anomaly and
// still gets its console.error, same as before.
const EDGE_CONFIG_CONNECTED = Boolean(process.env.EDGE_CONFIG)

export async function getFlag(key, defaultValue = true) {
  if (!EDGE_CONFIG_CONNECTED) return defaultValue
  try {
    const value = await get(key)
    return typeof value === 'boolean' ? value : defaultValue
  } catch (err) {
    console.error(`[edgeConfig] failed to read "${key}", using default (${defaultValue})`, err)
    return defaultValue
  }
}

/** Site-wide kill switch. Defaults to false (site NOT in maintenance) if unreadable. */
export async function isMaintenanceMode() {
  return getFlag('maintenance_mode', false)
}

/** Franchise scheduler / scoring tick kill switch. Defaults to true (enabled) if unreadable. */
export async function isFranchiseSchedulerEnabled() {
  return getFlag('franchise_scheduler_enabled', true)
}

/** NFL red zone alerts kill switch. Defaults to true (enabled) if unreadable. */
export async function isRedZoneAlertsEnabled() {
  return getFlag('red_zone_alerts_enabled', true)
}
