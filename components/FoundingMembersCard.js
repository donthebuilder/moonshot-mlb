'use client'
import Link from 'next/link'
import { C, NUM_FONT, TYPE } from '../lib/theme'
import { MEMBERS_LINE, membersUrl } from '../lib/members'

// THE ONE PLACE THE SITE ASKS FOR MONEY, INSIDE THE PRODUCT (2026-10-16, Donovan: push the Founding members). The words are lib/members.js MEMBERS_LINE (price and
// what is delivered live there, once). The button goes to Whop when NEXT_PUBLIC_MEMBERS_URL is set, else to /members, which explains it. Nothing on the site is
// locked, and this says so: what members pay for is delivery to one place at lock.
export default function FoundingMembersCard({ accent = null, theme = null, numFont = null }) {
  const T = theme || C
  const NUM = numFont || NUM_FONT
  const ac = accent || T.orange
  const join = membersUrl()
  const btn = { minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px', borderRadius: 10, fontSize: TYPE.name, fontWeight: 800, textDecoration: 'none' }
  return (
    <section aria-label="Founding members" style={{ margin: '0 0 14px', padding: '13px 15px', border: `1px solid ${T.border}`, borderRadius: 13, background: T.bg2 }}>
      <div style={{ fontFamily: NUM, fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.16em', color: ac }}>FOUNDING MEMBERS</div>
      <p style={{ margin: '6px 0 4px', fontSize: TYPE.name, lineHeight: 1.5, color: T.text }}>{MEMBERS_LINE}</p>
      <p style={{ margin: '0 0 10px', fontSize: TYPE.body, lineHeight: 1.45, color: T.text2 }}>Everything on the site stays free. Members get it delivered to one place at lock.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {join ? <a href={join} target="_blank" rel="noopener noreferrer" style={{ ...btn, background: ac, color: T.bg, border: `1px solid ${ac}` }}>Join on Whop →</a> : null}
        <Link href="/members" style={{ ...btn, background: 'transparent', color: T.text, border: `1px solid ${T.border}` }}>{join ? 'How it works' : 'See what members get →'}</Link>
      </div>
    </section>
  )
}
