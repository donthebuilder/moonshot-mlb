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
        style={{ paddingRight: 58 }}
        type={shown ? 'text' : 'password'}
      />
      <button
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        onClick={() => setShown((value) => !value)}
        style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          width: 'auto', margin: 0, padding: '4px 8px', border: '1px solid #3a3732',
          borderRadius: 7, background: 'transparent', color: '#8a8580',
          font: '800 8.5px/1 monospace', letterSpacing: '.08em', cursor: 'pointer',
        }}
        type="button"
      >{shown ? 'HIDE' : 'SHOW'}</button>
    </span>
  )
}
