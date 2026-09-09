'use client'

// Mounts the account sync once, for the whole network. Renders nothing.
//
// In the root layout rather than per-dashboard on purpose: MOONSHOT, TUDDY and
// Franchise all live under this layout, and a person who stars a hitter and
// then walks over to Franchise should not have that star waiting on a page
// they didn't open. See lib/dash/sync.js for what it actually does — and for
// why signed out (the common case) costs one request and then nothing.

import { useEffect } from 'react'

import { startSync } from '../lib/dash/sync'

export default function DashSync() {
  useEffect(() => startSync(), [])
  return null
}
