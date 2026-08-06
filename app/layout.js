import './globals.css'

export const metadata = {
  title: 'MLB HR Dashboard',
  description: 'MLB Home Run picks, results, and pair history',
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
      <body>{children}</body>
    </html>
  )
}
