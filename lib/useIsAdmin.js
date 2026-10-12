'use client'
// IS THIS SESSION THE ADMIN? (2026-10-12, the admin hub). The answer is the SERVER's (GET /api/admin/me -> { admin }), asked once per page load and
// only for a signed-in session (a signed-out visitor never makes the request). Until it answers, and for everyone it says no to, the result is false:
// nothing admin is drawn. Used by the header menu, the More drawer and QuickSearch's admin commands.
import { useEffect, useState } from 'react'
import { useDashAccount } from './dash/sync'

let asked = null
const ask = () => {
  if (!asked) {
    asked = fetch('/api/admin/me', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { admin: false }))
      .then((j) => j?.admin === true)
      .catch(() => { asked = null; return false })
  }
  return asked
}

export function useIsAdmin() {
  const account = useDashAccount()
  const [admin, setAdmin] = useState(false)
  useEffect(() => {
    let alive = true
    if (!account?.signedIn) { asked = null; setAdmin(false); return undefined }
    ask().then((v) => { if (alive) setAdmin(v) })
    return () => { alive = false }
  }, [account?.signedIn])
  return admin
}
