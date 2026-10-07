'use client'
import { C as MLB_C } from '../../lib/theme'

// THE HEADER'S WAY INTO THE ONE SEARCH (2026-10-07). QuickSearch (players, teams, games, every
// product) opened only from Cmd/Ctrl-K or "/" -- no button, so on a phone it did not exist. This is the
// button, on every product's header (components/header/HeaderShell.js). It opens the box through the
// `dash-quicksearch` event, which QuickSearch listens for in every shell.
//
// A PHONE'S KEYBOARD NEEDS THE TAP ITSELF. iOS raises the keyboard only for a focus() made inside the
// tap's own turn; the box mounts a moment later and focuses its input from a timer, which iOS ignores.
// So the tap focuses a throwaway input first (it takes the keyboard up), QuickSearch moves focus to its
// own input, and removes this one (window.__qsProxy).
export default function SearchButton({ theme = MLB_C }) {
  const open = () => {
    try {
      if (!window.__qsProxy) {
        const t = document.createElement('input')
        t.setAttribute('aria-hidden', 'true'); t.tabIndex = -1; t.readOnly = false
        t.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0;pointer-events:none'
        document.body.appendChild(t)
        t.focus({ preventScroll: true })
        window.__qsProxy = t
        setTimeout(() => { try { if (window.__qsProxy === t) { t.remove(); window.__qsProxy = null } } catch { /* gone */ } }, 1500)
      }
    } catch { /* no keyboard bridge: the box still opens */ }
    window.dispatchEvent(new CustomEvent('dash-quicksearch', { detail: { q: '' } }))
  }
  return (
    <button type="button" className="hdr-search" onClick={open} title="Search players, teams and games (Ctrl/⌘ K)" aria-label="Search players, teams and games" aria-haspopup="dialog"
      style={{
        width: 44, height: 44, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 12, border: `1px solid ${theme.border}`, background: 'transparent', color: theme.text2,
        fontSize: 17, lineHeight: 1, cursor: 'pointer', padding: 0,
      }}>{'\u{1F50D}'}</button>
  )
}
