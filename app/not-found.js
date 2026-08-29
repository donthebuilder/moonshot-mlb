// The network's 404. Until 2026-08-29 a wrong URL got Next's unbranded black
// default — no logo, no way home. A 404 is the one page guaranteed to be seen
// by someone who is lost, so its whole job is doors: the front door and all
// three products. Styles are inline on purpose — this page must render
// correctly with no CSS module, no theme state, and no JS.

import Link from 'next/link'

export const metadata = { title: 'Not found · DASH Network' }

const wrap = {
  minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', gap: 0, padding: '40px 20px', background: '#0b0b0a',
  color: '#f4f1eb', fontFamily: 'Arial, Helvetica, sans-serif', textAlign: 'center',
}
const doors = {
  display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 26,
}
const door = (accent) => ({
  display: 'block', padding: '11px 16px', border: `1px solid ${accent}55`,
  borderRadius: 11, background: `${accent}14`, color: '#f4f1eb',
  font: '800 11px/1 monospace', letterSpacing: '.06em', textDecoration: 'none',
})

export default function NotFound() {
  return (
    <main style={wrap}>
      <img src="/icon-192.png" alt="" width="52" height="52" style={{ borderRadius: 14 }} />
      <p style={{ margin: '22px 0 0', color: '#f97316', font: '900 9px/1 monospace', letterSpacing: '.18em' }}>
        DASH NETWORK · 404
      </p>
      <h1 style={{ margin: '12px 0 8px', fontSize: 'clamp(26px, 5vw, 40px)', letterSpacing: '-.03em' }}>
        That page isn&apos;t on the board.
      </h1>
      <p style={{ margin: 0, maxWidth: 440, color: '#8a8580', fontSize: 13, lineHeight: 1.6 }}>
        The address may have changed when the network moved, or it never existed.
        Everything real is one of these doors.
      </p>
      <nav style={doors} aria-label="DASH Network destinations">
        <Link href="/" style={door('#f4f1eb')}>⌂ FRONT DOOR</Link>
        <Link href="/app#sport=mlb&tab=home" style={door('#f97316')}>MOONSHOT · MLB</Link>
        <Link href="/app#sport=nfl&tab=home" style={door('#22c55e')}>TUDDY · NFL</Link>
        <Link href="/fantasy" style={door('#ff633e')}>FRANCHISE · FANTASY</Link>
        <Link href="/login" style={door('#8a8580')}>SIGN IN</Link>
      </nav>
    </main>
  )
}
