import './globals.css'
import DashNetworkNav from '../components/DashNetworkNav'

export const metadata = {
  title: 'DASH Network · Moonshot, Tuddy & Franchise',
  description: 'DASH Network — Moonshot MLB, Tuddy NFL, and Franchise fantasy football.',
  // INSTALLABLE (2026-08-09). Two reasons, and the second one is the point:
  // it puts the site on a home screen like an app, and on iOS Safari grants
  // notification permission ONLY to a site opened from the Home Screen. No
  // manifest, no alerts on iPhone, ever. See public/sw.js for what does and
  // does not survive the tab closing.
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'DASH' },
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/favicon-32.png',
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  // Chrome/Edge deprecated apple-mobile-web-app-capable in favour of the
  // standard tag (2026-08-24, console warning Donovan saw). Next 14's
  // metadata API only emits the apple- prefixed one from appleWebApp above —
  // there's no built-in field for the standard name yet — so it's added
  // straight through `other`. Both tags now render; nothing behind
  // appleWebApp changes, this just stops the warning and covers the browsers
  // that only recognise the new name.
  other: { 'mobile-web-app-capable': 'yes' },
}

// THE MOBILE LINCHPIN (found missing 2026-08-05). Without a viewport export,
// phones render the page at desktop width and zoom out — every media query
// in MobileCSS was written correctly and then never fired, because the
// browser reported ~980px regardless of the screen. One export turns the
// entire existing mobile pass on.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#09090b',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}<DashNetworkNav /></body>
    </html>
  )
}
