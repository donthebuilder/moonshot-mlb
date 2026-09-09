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

export async function getFlag(key, defaultValue = true) {
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
