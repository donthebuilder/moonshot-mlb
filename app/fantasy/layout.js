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

// ── FRANCHISE KEEPS ITS WAY BACK (2026-08-29) ───────────────────────────────
// The floating DASH launcher used to be the only thing on a Franchise screen
// that could reach MOONSHOT or TUDDY. It is deleted (Donovan: "remove the
// little floating ico, its redundant now"), and MOONSHOT/TUDDY replaced it
// with the network switch inside their bottom bar — but Franchise has no such
// bar to put it in, and its league rooms are server components spread over
// nine files. So the switch is mounted once here, for every Franchise route,
// as a slim dock that only appears on a phone; on desktop the room header's
// "← FRANCHISE" and the front door carry it, exactly as before.
//
// It sits ABOVE Franchise's own .mobileNav (64px tall, fixed at bottom on the
// league index) rather than fighting it for the same strip, and the page gets
// the extra bottom padding so nothing lands underneath either one.
import NetworkSwitch from '../../components/NetworkSwitch'

export default function FantasyLayout({ children }) {
  return (
    <>
      {children}
      <div aria-hidden="true" className="fantasyNetworkDockSpacer" />
      <div className="fantasyNetworkDock">
        <NetworkSwitch />
      </div>
    </>
  )
}
