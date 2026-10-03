// THE CONTACT ADDRESS, ONCE (2026-10-03). Donovan, 2026-10-01: donto123@gmail.com
// until there is a DASH address; NEXT_PUBLIC_CONTACT_EMAIL overrides it without
// a code change. Read by /terms and the DASH footer.
export function contactEmail() {
  const email = String(process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'donto123@gmail.com').trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}
