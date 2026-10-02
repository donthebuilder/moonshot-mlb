// /playbook (2026-09-30, BATCH-PLAYBOOK P1): the index. One page per market,
// each the same five-step walk-through in the site's own words. Public,
// server-rendered, indexable.
import start from '../start/start.module.css'
import styles from './playbook.module.css'
import { PLAYBOOKS, SPORT_MARKETS, CORE_LINE, STEPS } from '../../lib/playbook'
import { appHref, BRAND } from '../../lib/routes'

export const metadata = {
  title: 'How to research a pick · DASH Playbook',
  description: 'How to use DASH to research a home run, a hit, a touchdown or a goal: find the player on the board, check the record, read the card, the matchup, then make your own read.',
}

// from the one sport registry (0g D6), so a new sport is labelled here too
const SPORT_LABEL = Object.fromEntries(Object.entries(BRAND).map(([k, b]) => [k, `${b.icon} ${b.name} · ${b.league}`]))

export default function PlaybookIndex() {
  return (
    <main className={start.page}>
      <header className={start.bar}>
        <a className={start.brand} href="/" aria-label="DASH Network home">
          <img src="/icon-192.png" alt="" width="30" height="30" />
          <div><small>DASH NETWORK</small><strong>PLAYBOOK</strong></div>
        </a>
        <nav className={start.nav}>
          <a className={start.navOff} href={appHref('mlb')}>Open the board</a>
        </nav>
      </header>
      <section className={start.hero}>
        <p className={start.kicker}>How to use DASH</p>
        <h1 className={start.headline}>Research the pick. Don&apos;t just take it.</h1>
        <p className={start.sub}>Every page below walks one market the same way, in the order a researcher reads it, with links straight to the real pages.</p>
        <ol className={styles.steps} aria-label="The five steps">{STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
        <p className={styles.core}>{CORE_LINE}</p>
      </section>
      {Object.entries(SPORT_MARKETS).map(([sport, keys]) => (
        <section key={sport} aria-label={SPORT_LABEL[sport]}>
          <h2 className={start.kicker} style={{ marginTop: 28 }}>{SPORT_LABEL[sport]}</h2>
          <ul className={styles.cards}>
            {keys.map((k) => (
              <li key={k}><a className={styles.card} href={`/playbook/${k}`}><small>{PLAYBOOKS[k].market.toUpperCase()}</small><strong>{PLAYBOOKS[k].title} →</strong></a></li>
            ))}
          </ul>
        </section>
      ))}
      <footer className={start.foot}>
        <span>DASH shows the data and the model&apos;s reads. It is information, not advice; the decision is yours.</span>
        <span><a href="/called">The public record</a>{' · '}<a href={appHref('mlb')}>MOONSHOT</a>{' · '}<a href={appHref('nfl')}>TUDDY</a>{' · '}<a href={appHref('nhl')}>LAMP</a></span>
      </footer>
    </main>
  )
}
