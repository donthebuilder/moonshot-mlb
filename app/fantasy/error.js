'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// ── #69: THE REFERENCE NEVER CHANGED ────────────────────────────────────────
//
// `Reference 4202374051` came back identical across separate failures, and it
// was presented as the thing to quote in a bug report. It is Next's `digest`:
// a hash OF THE ERROR MESSAGE, so it identifies the error TYPE and is stable
// by design. Two people hitting the same bug a week apart quote the same
// number, and it can never say which occurrence anybody means.
//
// It is worth keeping -- a stable type id is exactly what groups reports
// together -- so it is relabelled honestly and given the thing it was missing:
// a moment. Time plus type is enough to find one occurrence in a log, which
// the type alone never was.
//
// Read in an effect, never during render: this component server-renders, and a
// clock read on both sides produces two different strings for the same node,
// which is a hydration error on the page whose entire job is to survive an
// error.
export default function FantasyError({ error, reset }) {
  const [at, setAt] = useState('')
  useEffect(() => { setAt(new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z') }, [])
  return (
    <main style={{ minHeight: '100vh', background: '#0b0b0a', color: '#f8f4ec', display: 'grid', placeItems: 'center', padding: '32px', fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div style={{ maxWidth: 520, textAlign: 'center' }}>
        <p style={{ color: '#f6a928', fontSize: 11, fontWeight: 900, letterSpacing: '.18em', margin: '0 0 10px' }}>FRANCHISE</p>
        <h1 style={{ fontSize: 34, letterSpacing: '-.03em', margin: '0 0 12px' }}>That page didn&apos;t load.</h1>
        <p style={{ color: '#a9a39a', lineHeight: 1.5, margin: '0 0 22px' }}>
          Something broke on the way to your league. Try again — if it keeps happening, the league data may still be syncing.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => reset()} style={{ border: 0, borderRadius: 9, background: '#f6a928', color: '#171009', padding: '13px 20px', fontWeight: 900, cursor: 'pointer' }} type="button">Try again</button>
          <Link href="/fantasy" style={{ border: '1px solid #302d29', borderRadius: 9, color: '#a9a39a', padding: '13px 20px', fontWeight: 900, textDecoration: 'none' }}>Back to Franchise</Link>
        </div>
        {error?.digest && (
          <p style={{ color: '#5f5a53', fontSize: 11, marginTop: 20, lineHeight: 1.6 }}>
            Error type <code>{error.digest}</code>{at ? <> · seen {at}</> : null}
            <br />
            <span style={{ opacity: .8 }}>Quote both — the type groups reports, the time finds this one.</span>
          </p>
        )}
      </div>
    </main>
  )
}
