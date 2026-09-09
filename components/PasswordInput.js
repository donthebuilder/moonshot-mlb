'use client'

import { useState } from 'react'

// One password field, everywhere passwords are typed — the front door, /login,
// Franchise's forms, /account, /reset-password. Exists because the 2026-08-29
// review found no show-password affordance anywhere on the site: on a phone,
// typing a 12-character password blind into a hidden field is the single most
// common way to bounce off a sign-in form.
//
// Deliberately a bare input in a positioned wrapper, no styling of its own
// beyond the toggle: every host form already styles `input` through its own
// CSS module (`.card input`, `.launchAuthCard input`, …), and those are
// descendant selectors, so the input keeps matching them from inside the
// wrapper. The toggle is a real button (keyboard reachable) and stays out of
// the tab order's way visually, not functionally.
export default function PasswordInput({ name = 'password', autoComplete, minLength, required = true, placeholder }) {
  const [shown, setShown] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'block' }}>
      <input
        autoComplete={autoComplete}
        minLength={minLength}
        name={name}
        placeholder={placeholder}
        required={required}
        style={{ paddingRight: 74 }}
        type={shown ? 'text' : 'password'}
      />
      <button
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        onClick={() => setShown((value) => !value)}
        // ── A TAP TARGET, NOT A DECAL (2026-08-31) ────────────────────────
        // This was 8.5px monospace in a 4x8 box: roughly 28x16 CSS pixels,
        // against Apple's 44x44 minimum, in the site's dimmest grey. The
        // affordance existed and was, for the 45+ user who could not finish
        // sign-up, effectively invisible and effectively unhittable. Now 44
        // tall, 11px type, and readable ink — the button that exists to stop
        // somebody typing a password blind cannot itself be the thing they
        // cannot see.
        style={{
          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
          width: 'auto', minHeight: 44, margin: 0, padding: '0 12px',
          display: 'inline-flex', alignItems: 'center',
          border: '1px solid #4a4742',
          borderRadius: 8, background: '#171615', color: '#c9c4bd',
          font: '800 11px/1 monospace', letterSpacing: '.08em', cursor: 'pointer',
        }}
        type="button"
      >{shown ? 'HIDE' : 'SHOW'}</button>
    </span>
  )
}
