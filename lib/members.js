// FOUNDING MEMBERS (2026-09-30, BATCH-MEMBERS M1). The paid thing is
// DELIVERY -- the card before lock, the live alerts, the grade, in a private
// Discord channel -- never access to the site, which stays free. Checkout is
// Whop's; the site only links to it.
//
// One place for the URL and the words, so /start and /called can't drift.
// NEXT_PUBLIC_MEMBERS_URL is set by Donovan once the Whop product exists
// (BATCH-MEMBERS-PLAN D1); until then membersUrl() is null and the line does
// not render anywhere. Only an https URL counts.
export function membersUrl() {
  const u = String(process.env.NEXT_PUBLIC_MEMBERS_URL || '').trim()
  return /^https:\/\/\S+$/.test(u) ? u : null
}

// 2026-10-04: 'live alerts' came out -- alerts are free for everyone; members get
// the full board at lock and its grade (lib/dash/membersPost.js). /members says it all.
// 2026-10-16 (Donovan): $10 a month, no member count, and the /members wording -- every game's write-up is part of what is delivered.
export const MEMBERS_LINE = 'Founding members ($10/mo): every game\u2019s write-up, plus the board at lock and its grade, in a private Discord.'
