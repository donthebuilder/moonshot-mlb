// FOUNDING MEMBERS (2026-09-30, BATCH-MEMBERS M1). The paid thing is
// DELIVERY -- the card before lock, the live alerts, the grade, in a private
// Discord channel -- never access to the site, which stays free. Checkout is
// Whop's; the site only links to it.
//
// One place for the URL and the words, so /start and /called can't drift.
// The checkout URL is WHOP_URL below; NEXT_PUBLIC_MEMBERS_URL can override it (it used to be required;
// until 2026-10-16 membersUrl() was null without it and the Join line did
// not render anywhere). Only an https URL counts.
// The FREE Discord (2026-10-16, Donovan): the community door. A public invite link, not a secret. Make sure the invite is set to never expire.
export const DISCORD_URL = 'https://discord.gg/y6nSBarf9'

// The Founding members checkout on Whop (Donovan, 2026-10-16: $10/mo or $2.50/wk, 14-day free trial). A public URL, so it lives in code: the Join
// buttons show without a Vercel setting. NEXT_PUBLIC_MEMBERS_URL, when set to an https URL, still overrides it (a new Whop product, a promo link).
export const WHOP_URL = 'https://whop.com/dashnetwork/dash-founding-member/'

export function membersUrl() {
  const u = String(process.env.NEXT_PUBLIC_MEMBERS_URL || '').trim()
  return /^https:\/\/\S+$/.test(u) ? u : WHOP_URL
}

// 2026-10-04: 'live alerts' came out -- alerts are free for everyone; members get
// THE DAY's picks, the wins and the morning grade (lib/card/wins.js, 2026-10-23). /members says it all.
// 2026-10-16 (Donovan): $10 a month or $2.50 a week with a 14-day free trial (as set up in Whop), no member count, and the /members wording -- every game's write-up is part of what is delivered.
// The two halves of the price, for a page that lays them out itself (the front door's offer strip); MEMBERS_LINE below says the same in one sentence.
export const MEMBERS_PRICE = '$10 a month or $2.50 a week'
export const MEMBERS_TRIAL = '14-day free trial'
export const MEMBERS_LINE = 'Founding members ($10/mo or $2.50/wk, 14-day free trial): today\u2019s picks with the why, every game\u2019s write-up, and every pick graded, in a private Discord.'
