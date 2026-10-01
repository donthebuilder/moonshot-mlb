// /playbook/<market> (2026-09-30, BATCH-PLAYBOOK P1): one market's walk-
// through -- six stops, each: what to open, what to look at, what it tells
// you, what it does NOT. Words and links live in lib/playbook.js; the worked
// example (tonight's #1) comes from lib/playbookExample.js.
import { notFound } from 'next/navigation'
import start from '../../start/start.module.css'
import styles from '../playbook.module.css'
import { PLAYBOOKS, MARKETS, CORE_LINE, STEPS } from '../../../lib/playbook'
import { playbookExample } from '../../../lib/playbookExample'
import { appHref, playerHref } from '../../../lib/routes'

export const revalidate = 600

export function generateStaticParams() {
  return MARKETS.map((market) => ({ market }))
}

export async function generateMetadata({ params }) {
  const { market } = await params
  const pb = PLAYBOOKS[market]
  if (!pb) return { title: 'Playbook · DASH Network' }
  return { title: `${pb.title} · DASH Playbook`, description: `${pb.lede} ${CORE_LINE}` }
}

export default async function PlaybookPage({ params }) {
  const { market } = await params
  const pb = PLAYBOOKS[market]
  if (!pb) notFound()
  const ex = await playbookExample(pb.sport)
  const stops = pb.stops(ex)
  const signup = `/login?next=${encodeURIComponent(appHref(pb.sport))}#create-account`
  return (
    <main className={start.page}>
      <header className={start.bar}>
        <a className={start.brand} href="/" aria-label="DASH Network home">
          <img src="/icon-192.png" alt="" width="30" height="30" />
          <div><small>DASH PLAYBOOK</small><strong>{pb.product}</strong></div>
        </a>
        <nav className={start.nav}>
          <a className={start.navOff} href="/playbook">All playbooks</a>
        </nav>
      </header>
      <section className={start.hero}>
        <p className={start.kicker}>How to use DASH · {pb.market}</p>
        <h1 className={start.headline}>{pb.title}</h1>
        <p className={start.sub}>{pb.lede}</p>
        <ol className={styles.steps} aria-label="The five steps">{STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
        {ex ? <p className={start.sub} style={{ fontSize: 13 }}>The links below use tonight&apos;s #1, <a href={playerHref(pb.sport, ex.id)} style={{ color: 'var(--ink)', fontWeight: 700 }}>{ex.name}</a>, as the worked example.</p> : null}
      </section>
      <ol className={styles.list}>
        {stops.map((s, i) => (
          <li key={i} className={styles.stop}>
            <div className={styles.stopHead}>
              <span className={styles.num}>{String(i + 1).padStart(2, '0')}</span>
              <span className={styles.step}>{s.step}</span>
            </div>
            <h2 className={styles.stopTitle}>{s.title}</h2>
            <a className={styles.open} href={s.open.href}>{s.open.label} →</a>
            <dl className={styles.rows}>
              <dt>Look at</dt><dd>{s.look}</dd>
              <dt>Tells you</dt><dd>{s.tells}</dd>
              <dt>Doesn&apos;t</dt><dd>{s.not}</dd>
            </dl>
          </li>
        ))}
      </ol>
      <p className={styles.core}>{CORE_LINE}</p>
      <p className={start.alt}>
        <a href={appHref(pb.sport)}>Open {pb.product} →</a> Want your players saved and alerts when they hit?{' '}
        <a href={signup}>A free account</a> does that. Nothing on DASH is behind a paywall.
      </p>
      <footer className={start.foot}>
        <span>Information, not advice. 21+. Every call is graded in public, hits and misses.</span>
        <span><a href="/playbook">All playbooks</a>{' · '}<a href={`/called?sport=${pb.sport}`}>The public record</a></span>
      </footer>
    </main>
  )
}
