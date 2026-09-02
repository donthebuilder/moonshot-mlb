import './globals.css'
import DashSync from '../components/DashSync'

// C1 rebrand sweep (dash-network-master-plan-2026-08-28.md): title, footer,
// and share cards were already DASH-branded; OG/Twitter card metadata never
// existed at all (not a rebrand inconsistency, a genuine gap — confirmed by
// reading this file before this change, no openGraph/twitter keys present).
// Needs NEXT_PUBLIC_SITE_URL set on Vercel to resolve the image URL below to
// the real domain instead of localhost — see .env.example, already
// documents the var, just needs a value in the actual Vercel project.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'DASH Network · Moonshot, Tuddy & Franchise',
  description: 'DASH Network — Moonshot MLB, Tuddy NFL, and Franchise fantasy football.',
  // #96: there was no canonical URL on the front door at all. The board is a
  // hash-routed single page, so every deep link (#tab=…&p=…) is the same
  // document to a crawler; without this they compete with each other.
  alternates: { canonical: '/' },
  // #97: the card was `summary` pointing at a 1024x1024 app icon, so a shared
  // link rendered as a small logo tile -- for a product that is entirely
  // visual boards, and whose whole distribution is people sharing links.
  // og-card.png is 1200x630, the size both crawlers actually want.
  openGraph: {
    title: 'DASH Network',
    description: 'Moonshot MLB, Tuddy NFL, and Franchise fantasy football — every call graded in public.',
    url: SITE_URL,
    siteName: 'DASH Network',
    images: [{ url: '/og-card.png', width: 1200, height: 630, alt: 'DASH Network — every call graded in public' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DASH Network',
    description: 'Moonshot MLB, Tuddy NFL, and Franchise fantasy football — every call graded in public.',
    images: ['/og-card.png'],
  },
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
      <body>{children}<DashSync /></body>
    </html>
  )
}
