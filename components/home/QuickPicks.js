// THE FREE TASTE on the front door (2026-10-16, Donovan: "this should have everything anyone needs to sign up, get quick picks, see how the bot is doing,
// see their players"; then: keep the site open and free, show a taste of the called picks, hide the rest unless you are a member).
// Rebuilt 2026-10-17 as MOONSHOT tables (components/home/FreeTaste.js): one DenseTable per sport, 4 rows for a visitor, up to 8 for a member.
// Server component. WHAT A VIEWER SEES IS DECIDED HERE, ON THE SERVER (lib/members/access.js previewOf): only the rows that pass the gate are handed to
// the table, so a hidden name is never in the page. The count of hidden ones is all that crosses. Nothing is typed or invented: an empty list leaves its
// block off, and with no list at all the section is gone.
import { playerHref, teamHref } from '../../lib/routes'
import { previewOf } from '../../lib/members/access'
import FreeTaste from './FreeTaste'

const firstPitch = (iso) => {
  const t = Date.parse(iso || '')
  return Number.isFinite(t) ? `${new Date(t).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET` : ''
}

function block(sport, view, note, row) {
  return view.shown.length ? { sport, note, hidden: view.hidden, rows: view.shown.map((p) => ({ _key: `${sport}-${p.id}`, id: p.id, name: p.name, href: playerHref(sport, p.id), ...row(p) })) } : null
}

export default function QuickPicks({ styles, calls, nfl = null, nhl = null, member = false }) {
  const blocks = [
    block('mlb', previewOf(calls?.items, member), 'locked before first pitch', (p) => ({ role: p.roles.join(' · '), first: firstPitch(p.firstPitch) })),
    block('nfl', previewOf(nfl?.items, member), `${nfl?.label || 'this week'} · the anytime-touchdown board`, (p) => ({ team: p.team, teamHref: teamHref('nfl', p.team), vs: p.opp, vsHref: teamHref('nfl', String(p.opp || '').replace(/^@\s*/, '')), pos: p.position })),
    block('nhl', previewOf(nhl?.items, member), 'tonight’s skaters, locked before puck drop', (p) => ({ team: p.team, teamHref: teamHref('nhl', p.team), vs: p.opp, vsHref: teamHref('nhl', String(p.opp || '').replace(/^@\s*/, '')), pos: p.position })),
  ].filter(Boolean)
  if (!blocks.length) return null
  return (
    <section id="picks" className={styles.taste} aria-label="Tonight’s called players">
      <div className={styles.slateHead}>
        <p className={styles.kicker}>FREE PICKS</p>
        <h2>Tonight’s called players.</h2>
      </div>
      <FreeTaste blocks={blocks} member={member} />
    </section>
  )
}
