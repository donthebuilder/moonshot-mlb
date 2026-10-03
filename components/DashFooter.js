'use client'
import { BRAND } from '../lib/routes'
import { contactEmail } from '../lib/siteContact'

// THE DASH FOOTER (2026-10-03, Donovan: "I don't like that it shows at the
// bottom where we're getting our stats from ... put like a contact thing").
// One footer for all four products: the product, the stats-not-advice line
// MOONSHOT has carried since 08-08, and the doors people actually want --
// how this works, the record, terms, contact. The per-page "Source: <API>"
// lines are gone from the pages; how each number is built lives in the
// product's Guide.
export default function DashFooter({ sport, theme: C, onGuide = null }) {
  const name = BRAND[sport]?.name || 'DASH'
  const email = contactEmail()
  const link = { color: C.text2, textDecoration: 'none', fontWeight: 700 }
  const sep = <span aria-hidden="true" style={{ color: C.text3, margin: '0 8px' }}>·</span>
  return (
    <footer style={{ marginTop: 22, padding: '16px 12px 12px', borderTop: `1px solid ${C.border}`, textAlign: 'center', color: C.text3, fontSize: 12, lineHeight: 1.6 }}>
      <nav aria-label={`${name} footer`} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', rowGap: 6, marginBottom: 8 }}>
        {onGuide ? <button type="button" onClick={onGuide} style={{ ...link, background: 'none', border: 0, padding: '6px 2px', cursor: 'pointer', font: 'inherit', fontWeight: 700 }}>How this works</button> : null}
        {onGuide ? sep : null}
        <a href={`/called?sport=${sport}`} style={{ ...link, padding: '6px 2px' }}>The record</a>
        {sep}
        <a href="/terms" style={{ ...link, padding: '6px 2px' }}>Terms</a>
        {email ? <>{sep}<a href={`mailto:${email}`} style={{ ...link, padding: '6px 2px' }}>Contact</a></> : null}
      </nav>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        {name} is stats and analysis for entertainment — measured data, graded in public.
        It is <b style={{ color: C.text2 }}>not financial, betting, or investment advice</b>, and nothing here is a
        recommendation to wager. If you bet, that&apos;s your decision and your responsibility — play responsibly.
      </div>
    </footer>
  )
}
