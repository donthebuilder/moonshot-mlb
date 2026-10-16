// QUICK PICKS on the front door (2026-10-16, Donovan: "this should have everything anyone needs to sign up, get quick picks, see how the bot is doing,
// see their players"). Server component. Tonight's CALLED players straight from the lock ledger (lib/phone/todayCalls.js, the same record the
// locked-record rule reads), each a link to his page; one line on how the bot is doing, from the numbers the record section below already prints;
// and the one button a stranger needs. Nothing is typed or invented: no calls tonight (or the ledger unreadable) leaves the picks off.
import Link from 'next/link'
import { appHref, playerHref } from '../../lib/routes'
import { DISCORD_URL } from '../../lib/members'

const SHOW = 6
const ROLE_WORD = { TOP: 'TOP', HR: 'HR', HIT: 'HIT', HRR: 'H+R+RBI', CONTACT: 'CONTACT' }

export default function QuickPicks({ styles, calls, sport = 'mlb', recordLine = null, signedIn = false, nfl = null, nhl = null }) {
  const items = calls?.items || []
  if (!items.length && !recordLine && !nfl && !nhl) return null
  const shown = items.slice(0, SHOW)
  return (
    <section className={styles.quick} id="picks" aria-label="Quick picks">
      <div className={styles.slateHead}>
        <p className={styles.kicker}>QUICK PICKS</p>
        <h2>{items.length ? 'Tonight’s called players.' : 'How the bot is doing.'}</h2>
      </div>
      {shown.length ? (
        <ul className={styles.quickList}>
          {shown.map((p) => (
            <li key={p.id}>
              <Link href={playerHref(sport, p.id)} className={styles.quickRow}>
                <b>{p.name}</b>
                <span>{p.roles.map((r) => ROLE_WORD[r] || r).join(' · ')}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {items.length ? <p className={styles.quickNote}>MOONSHOT: locked before first pitch.</p> : null}
      {nfl?.items?.length ? (
        <>
          <p className={styles.quickNote} style={{ marginTop: 16 }}><b>TUDDY · {nfl.label || 'This week'}: the anytime-touchdown board, top {nfl.items.length}</b></p>
          <ul className={styles.quickList}>
            {nfl.items.map((p) => (
              <li key={p.id}>
                <Link href={playerHref('nfl', p.id)} className={styles.quickRow} style={{ borderColor: 'color-mix(in srgb, var(--nfl) 35%, transparent)', background: 'color-mix(in srgb, var(--nfl) 8%, transparent)' }}>
                  <b>{p.name}</b>
                  <span style={{ color: 'var(--nfl)' }}>{[p.team && p.opp ? `${p.team} vs ${p.opp}` : p.team, p.position].filter(Boolean).join(' \u00b7 ')}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {nhl?.items?.length ? (
        <>
          <p className={styles.quickNote} style={{ marginTop: 16 }}><b>LAMP: tonight&apos;s called skaters (to score), locked before puck drop</b></p>
          <ul className={styles.quickList}>
            {nhl.items.map((p) => (
              <li key={p.id}>
                <Link href={playerHref('nhl', p.id)} className={styles.quickRow} style={{ borderColor: 'color-mix(in srgb, var(--nhl) 35%, transparent)', background: 'color-mix(in srgb, var(--nhl) 8%, transparent)' }}>
                  <b>{p.name}</b>
                  <span style={{ color: 'var(--nhl)' }}>{[p.team && p.opp ? `${p.team} vs ${p.opp}` : p.team, p.position].filter(Boolean).join(' \u00b7 ')}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className={styles.quickNote}>
        {recordLine ? <>Record so far: {recordLine} <a href="#record">See how it’s graded ↓</a></> : null}
      </p>
      <div className={styles.quickActions}>
        <Link href={appHref(sport)}>{items.length > SHOW ? `All ${items.length} calls and the full board` : 'Open the full board'} <b>{'→'}</b></Link>
        {signedIn ? null : <a href="#create-account" className={styles.quickCta}>Sign up free <b>{'→'}</b></a>}
        <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">Join the free Discord <b>{'→'}</b></a>
      </div>
    </section>
  )
}
