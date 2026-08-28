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

export default function FantasyLayout({ children }) {
  return children
}
