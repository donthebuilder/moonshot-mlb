'use client'
// SKIP TO THE BOARD, WITHOUT TOUCHING THE ADDRESS (2026-10-04, route audit B1).
// A plain href="#board-main" in a hash-routed app replaced #sport=…&tab=… with
// #board-main: the tab was lost and a refresh landed on Home. The link still
// says where it goes; on a tap it moves focus to <main> and leaves the hash alone.
export default function SkipLink({ target = 'board-main', children = 'Skip to the board' }) {
  const go = (e) => {
    const el = document.getElementById(target)
    if (!el) return
    e.preventDefault()
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
    el.focus()
    el.scrollIntoView({ block: 'start' })
  }
  return <a className="skip-link" href={`#${target}`} onClick={go}>{children}</a>
}
