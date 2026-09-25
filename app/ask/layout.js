// 2026-09-24 (SEO): /ask is a client component, so its metadata lives here.
// An internal reply-writing tool; not a page for search engines.
export const metadata = {
  title: 'The answer · DASH Network',
  robots: { index: false, follow: false },
}

export default function AskLayout({ children }) {
  return children
}
