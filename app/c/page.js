// /c -- THE CARD LANDING (2026-10-16, Phase 1 of the revenue plan; Donovan: "the card only", simple).
// An X post shows a collectible card; its link lands HERE: the exact card, one line about it, "Sign up free", the public record,
// and one members line. No wall before the card. Signing up returns the person to the app on the matching board with
// ?welcome=1 (the first-visit tutorial, Step 3). Public and indexable (robots.js); every number comes from the locked-record
// module, never typed here. The card is the share route's own picture (/api/card/share), so the post, the preview and this page agree.
import Link from 'next/link'
import AuthPageHeader from '../../components/AuthPageHeader'
import CardLandingImage from '../../components/CardLandingImage'
import styles from '../(front)/dash.module.css'
import { BRAND, appHref, playerHref, isHiddenSport } from '../../lib/routes'
import { MEMBERS_LINE } from '../../lib/members'
import { readLockedRecord } from '../../lib/calibration/readMlbCalibration'
import { lockedCallsLine } from '../../lib/record/lockedRecord'

export const dynamic = 'force-dynamic'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://dashnetwork.vercel.app'
// the share route's own parameters, nothing else is passed on
const KINDS = ['ranked', 'game', 'pitcher', 'pick', 'record', 'postseason', 'series']
const PASS = ['kind', 'sport', 'market', 'type', 'ids', 'game', 'id', 'date', 'season', 'week', 'mode', 'side', 'group', 'team']
const one = (v) => String(Array.isArray(v) ? v[0] : v || '').slice(0, 120)

function cardOf(params) {
  const sport = one(params.sport).toLowerCase()
  const kind = one(params.kind)
  if (!BRAND[sport] || isHiddenSport(sport) || !KINDS.includes(kind)) return null
  const q = new URLSearchParams()
  for (const k of PASS) { const v = one(params[k]); if (v) q.set(k, k === 'sport' ? sport : v) }
  return { sport, kind, id: one(params.id), qs: q.toString() }
}

export async function generateMetadata({ searchParams }) {
  const card = cardOf((await searchParams) || {})
  const brand = card ? BRAND[card.sport] : null
  const title = brand ? `${brand.name} ${brand.league} card · DASH Network` : 'DASH Network'
  const description = 'Every call graded in public, hits and misses. Free to join.'
  const image = card ? `${SITE_URL}/api/card/share?${card.qs}&w=720` : null
  return {
    title, description,
    robots: { index: true, follow: true },
    openGraph: { title, description, ...(image ? { images: [{ url: image, width: 720, height: 900 }] } : {}) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description, ...(image ? { images: [image] } : {}) },
  }
}

// MLB's locked record line (the one source). A failed read leaves the line off: nothing is invented.
async function recordLine() {
  try {
    const rec = await readLockedRecord(new Date().toISOString().slice(0, 10))
    if (!rec) return null
    const calls = Object.values(rec.picks || {}).reduce((a, r) => a + (r?.n || 0), 0)
    return calls ? lockedCallsLine(rec, calls) : null
  } catch { return null }
}

// a sport's own record line, by sport key (a table, not a ternary); a sport without one shows the link to its record only
const RECORD_LINE = { mlb: recordLine }

export default async function CardLanding({ searchParams }) {
  const params = (await searchParams) || {}
  const card = cardOf(params)
  const sport = card?.sport || 'mlb'
  const brand = BRAND[sport]
  // after sign-up: the player's page for a pick or a starter, else the product's home board
  const board = card && (card.kind === 'pick' || card.kind === 'pitcher') && card.id ? playerHref(sport, card.id) : appHref(sport)
  const dest = board.replace('/app', '/app?welcome=1')
  const line = RECORD_LINE[sport] ? await RECORD_LINE[sport]() : null
  const alt = `${brand.name} ${brand.league} card from DASH Network`
  return (
    <main className={styles.page}>
      <AuthPageHeader />
      <section style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px 48px', lineHeight: 1.55, fontSize: 15 }}>
        {card ? <CardLandingImage src={`/api/card/share?${card.qs}&w=720`} alt={alt} /> : null}
        <p style={{ margin: '14px 2px 4px', fontSize: 17, fontWeight: 700 }}>
          {brand.icon} {brand.name}: {card ? 'the call, locked before it happens.' : 'every call graded in public.'}
        </p>
        <p className={styles.muted} style={{ margin: '0 2px 14px' }}>Hits and misses both count. Free to join, nothing to pay to read the board.</p>
        <div className={styles.heroActions} style={{ marginTop: 0 }}>
          <Link href={`/login?next=${encodeURIComponent(dest)}`} style={{ minHeight: 48, display: 'inline-flex', alignItems: 'center' }}>Sign up free <b>&nbsp;→</b></Link>
          <Link href={`/called?sport=${sport}`} style={{ minHeight: 48, display: 'inline-flex', alignItems: 'center' }}>See the public record</Link>
        </div>
        {line ? <p className={styles.muted} style={{ margin: '14px 2px 0' }}>{line}.</p> : null}
        <div className={styles.card} style={{ margin: '18px 0 0' }}>
          <p style={{ margin: 0 }}>{MEMBERS_LINE}</p>
          <p style={{ margin: '8px 0 0' }}>
            <Link href="/members" style={{ display: 'inline-block', minHeight: 44, lineHeight: '44px' }}>How membership works →</Link>
          </p>
        </div>
      </section>
    </main>
  )
}
