import './globals.css'

export const metadata = {
  title: 'MLB HR Dashboard',
  description: 'MLB Home Run picks, results, and pair history',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
