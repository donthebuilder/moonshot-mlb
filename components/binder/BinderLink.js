'use client'
// THE WATCHLIST'S WAY INTO THE BINDER (2026-10-12): one 44px link at the top of the Watchlist page on every sport, with the NEW badge when a player I follow has earned a
// card I have not seen. It is a link (appHref), so it opens the same thing on a phone and on a desktop and Back returns to the watchlist.
import { useSportTheme } from '../SportTheme'
import { appHref } from '../../lib/routes'
import useBinderNew from './useBinderNew'

export default function BinderLink({ sport, style = null }) {
  const { C, accent, NUM_FONT } = useSportTheme()
  const n = useBinderNew(true)
  return (
    <a href={appHref(sport, 'binder')} data-binder-link
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg2, color: accent, textDecoration: 'none', font: `800 12px/1 ${NUM_FONT}`, letterSpacing: '.06em', ...style }}>
      <span aria-hidden="true">{'\u{1F0CF}'}</span>
      <span>BINDER: cards your players earned</span>
      {n > 0 ? <b style={{ padding: '3px 6px', borderRadius: 6, background: accent, color: C.bg, font: `900 10px/1 ${NUM_FONT}`, letterSpacing: '.08em' }}>{`${n} NEW`}</b> : null}
      <span aria-hidden="true">{'›'}</span>
    </a>
  )
}
