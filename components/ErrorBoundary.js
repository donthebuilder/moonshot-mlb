'use client'
import { Component } from 'react'
import { C, NUM_FONT } from '../lib/theme'

// 🧯 ERROR BOUNDARY — the thing this app did not have (2026-09-07).
//
// Donovan: "the tuddy side of the site is crashing."
//
// Nothing in components/ or app/ implemented componentDidCatch, anywhere, on
// either sport. React's default for an uncaught render error is to unmount the
// whole tree, so ONE bad field on ONE tab took the entire page to white — no
// header, no tab bar, no message, no way back. That is what "crashing" looks
// like from the outside, and it is also why it could not be reported: the
// screen that would have told us which tab and which error is the screen that
// got thrown away. Fourteen NFL tabs were walked on production without
// reproducing it, which is the point — it is data-dependent, and it needs to
// survive long enough to name itself.
//
// Scoped per tab rather than around the app: the header, the tab bar and the
// player modal keep working, so a broken board is a broken panel you can click
// away from instead of a dead site. `resetKey` (the tab name) clears the error
// on navigation, so leaving and coming back retries instead of latching.
//
// The message is shown, not swallowed. He is the only one debugging this and
// a stack he can screenshot is worth more than a tidy apology.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { err: null }
  }

  static getDerivedStateFromError(err) {
    return { err }
  }

  componentDidCatch(err, info) {
    // Left in the console on purpose — read_console_messages and the browser
    // devtools are how this gets diagnosed next time.
    // eslint-disable-next-line no-console
    console.error('[MOONSHOT] panel crashed:', this.props.label || '?', err, info?.componentStack)
  }

  componentDidUpdate(prev) {
    if (this.state.err && prev.resetKey !== this.props.resetKey) this.setState({ err: null })
  }

  render() {
    const { err } = this.state
    if (!err) return this.props.children
    return (
      <div style={{
        border: `1px solid ${C.border2}`, borderRadius: 12, padding: 18,
        background: C.bg2, color: C.text2, fontSize: 12.5, lineHeight: 1.55,
      }}>
        <div style={{ fontWeight: 900, fontSize: 13.5, color: C.orange, marginBottom: 6 }}>
          This panel hit an error{this.props.label ? ` — ${this.props.label}` : ''}
        </div>
        <div style={{ marginBottom: 10 }}>
          The rest of the site is fine — the tabs and your card still work. Switch tabs and
          come back to retry it.
        </div>
        <pre style={{
          margin: 0, padding: '8px 10px', borderRadius: 8, overflowX: 'auto',
          background: 'rgba(255,255,255,.04)', border: `1px solid ${C.border}`,
          fontFamily: NUM_FONT, fontSize: 10.5, color: C.text3, whiteSpace: 'pre-wrap',
        }}>
          {String(err?.message || err)}
        </pre>
      </div>
    )
  }
}
