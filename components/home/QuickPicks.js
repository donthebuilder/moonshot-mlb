// QUICK PICKS on the front door (2026-10-16, Donovan: "this should have everything anyone needs to sign up, get quick picks, see how the bot is doing,
// see their players"; then: keep the site open and free, show a taste of the called picks, hide the rest unless you are a member).
// Server component. Tonight's called players (MLB, from the lock ledger), the week's TD board (NFL) and LAMP's called skaters (NHL), each a link to his page.
// WHAT A VIEWER SEES IS DECIDED HERE, ON THE SERVER (lib/members/access.js previewOf): a free visitor gets the first FREE_CALLS_PER_SPORT of each list and a
// "+N more" row; the hidden names are never in the page. A member gets the longer list. Nothing is typed or invented: an empty list leaves its block off.
import Link from 'next/link'
import { playerHref } from '../../lib/routes'
import { DISCORD_URL, membersUrl } from '../../lib/members'
import { previewOf } from '../../lib/members/access'

const ROLE_WORD = { TOP: 'TOP', HR: 'HR', HIT: 'HIT', HRR: 'H+R+RBI', CONTACT: 'CONTACT' }
const matchup = (p) => [p.team && p.opp ? `${p.team} vs ${p.opp}` : p.team, p.position].filter(Boolean).join(' · ')

function Rows({ styles, sport, view, label, tone, detail, member }) {
  if (!view.shown.length) return null
  const join = membersUrl()
  return (
    <>
      <p className={styles.quickNote} style={{ marginTop: 16 }}><b>{label}</b></p>
      <ul className={styles.quickList}>
        {view.shown.map((p) => (
          <li key={p.id}>
            <Link href={playerHref(sport, p.id)} className={styles.quickRow}
              style={tone ? { borderColor: `color-mix(in srgb, var(${tone}) 35%, transparent)`, background: `color-mix(in srgb, var(${tone}) 8%, transparent)` } : undefined}>
              <b>{p.name}</b>
              <span style={tone ? { color: `var(${tone})` } : undefined}>{detail(p)}</span>
            </Link>
          </li>
        ))}
        {view.hidden > 0 ? (
          <li>
            <a href={join || '/members'} className={`${styles.quickRow} ${styles.quickLocked}`}>
              <b>+{view.hidden} more {member ? '' : 'for members'}</b>
              <span>{'JOIN →'}</span>
            </a>
          </li>
        ) : null}
      </ul>
    </>
  )
}

export default function QuickPicks({ styles, calls, sport = 'mlb', recordLine = null, signedIn = false, nfl = null, nhl = null, member = false }) {
  const mlbV = previewOf(calls?.items, member), nflV = previewOf(nfl?.items, member), nhlV = previewOf(nhl?.items, member)
  if (!mlbV.shown.length && !nflV.shown.length && !nhlV.shown.length && !recordLine) return null
  const anyHidden = mlbV.hidden + nflV.hidden + nhlV.hidden > 0
  return (
    <section className={styles.quick} id="picks" aria-label="Quick picks">
      <div className={styles.slateHead}>
        <p className={styles.kicker}>QUICK PICKS</p>
        <h2>{mlbV.shown.length || nflV.shown.length || nhlV.shown.length ? 'Tonight’s called players.' : 'How the bot is doing.'}</h2>
      </div>
      <Rows styles={styles} sport={sport} view={mlbV} member={member} label="MOONSHOT: locked before first pitch"
        detail={(p) => p.roles.map((r) => ROLE_WORD[r] || r).join(' · ')} />
      <Rows styles={styles} sport="nfl" view={nflV} member={member} tone="--nfl" label={`TUDDY · ${nfl?.label || 'this week'}: the anytime-touchdown board`} detail={matchup} />
      <Rows styles={styles} sport="nhl" view={nhlV} member={member} tone="--nhl" label="LAMP: tonight’s called skaters, locked before puck drop" detail={matchup} />
      {recordLine ? <p className={styles.quickNote}>Record so far: {recordLine} <a href="#record">See how it{'’'}s graded {'↓'}</a></p> : null}
      <div className={styles.quickActions}>
        {signedIn ? null : <a href="#create-account" className={styles.quickCta}>Sign up free <b>{'→'}</b></a>}
        <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">Join the free Discord <b>{'→'}</b></a>
      </div>
      {anyHidden && !member ? <p className={styles.quickNote}>Free shows a few from each sport. Founding members see every called player, delivered at lock.</p> : null}
    </section>
  )
}
