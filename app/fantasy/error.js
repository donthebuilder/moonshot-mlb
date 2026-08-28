'use client'

import Link from 'next/link'

export default function FantasyError({ error, reset }) {
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
        {error?.digest && <p style={{ color: '#5f5a53', fontSize: 11, marginTop: 20 }}>Reference {error.digest}</p>}
      </div>
    </main>
  )
}
