// C1 rebrand sweep: same OG/Twitter gap as the root layout (app/layout.js) —
// inherits metadataBase from there, so the relative image path below
// resolves against NEXT_PUBLIC_SITE_URL once that's set on Vercel.
export const metadata = {
  title: 'Franchise · DASH Network',
  description: 'Build a team. Run your league. Own the season.',
  openGraph: {
    title: 'Franchise · DASH Network',
    description: 'Build a team. Run your league. Own the season.',
    siteName: 'DASH Network',
    images: [{ url: '/icon-1024.png', width: 1024, height: 1024, alt: 'Franchise · DASH Network' }],
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Franchise · DASH Network',
    description: 'Build a team. Run your league. Own the season.',
    images: ['/icon-1024.png'],
  },
}

// ── THE THREE-SITE DOCK IS GONE (2026-09-07) ────────────────────────────────
// Donovan: "the mobile thing that has the three sites needs to be just removed
// from the navigator."
//
// It was mounted here for every Franchise route as a fixed phone-only dock. By
// tonight a league room on a phone was stacking THREE navigations up the
// bottom of the screen: the network switch inline in the room header, this
// dock, and the league bar under it. The header row does this job already, on
// every screen, and it is the row that replaced the old back link -- so the
// way out of Franchise is not lost with the dock, it is just only stated once.
//
// #76: stamps html[data-theme] on Franchise routes. Without it every light
// rule in fantasy.module.css matches nothing — see ThemeSync.js.
import ThemeSync from '../../components/fantasy/ThemeSync'
// css-loader pure-selector fix, 2026-09-06 — see theme-tokens.css's own header
import './theme-tokens.css'

export default function FantasyLayout({ children }) {
  return (
    <>
      <ThemeSync />
      {children}
    </>
  )
}
