import './globals.css'
import { Analytics } from '@vercel/analytics/next'

export const metadata = {
  title: 'MOONSHOT · MLB',
  description: 'MOONSHOT — MLB home run picks, live wire, and receipts',
  // INSTALLABLE (2026-08-09). Two reasons, and the second one is the point:
  // it puts the site on a home screen like an app, and on iOS Safari grants
  // notification permission ONLY to a site opened from the Home Screen. No
  // manifest, no alerts on iPhone, ever. See public/sw.js for what does and
  // does not survive the tab closing.
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'MOONSHOT' },
  icons: { icon: '/icon-192.png', apple: '/icon-192.png' },
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
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
