export const metadata = {
  title: 'MOONSHOT · NFL',
  description: 'MOONSHOT — NFL props, receipts first. Preseason preview.',
}

export const viewport = { width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{
        margin: 0, background: '#09090b', color: '#fafafa',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
      }}>
        {/* the ember signature bar, green-shifted for football */}
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 400,
          background: 'linear-gradient(90deg, #22c55e, #f97316, #22c55e)',
        }} />
        {children}
      </body>
    </html>
  )
}
