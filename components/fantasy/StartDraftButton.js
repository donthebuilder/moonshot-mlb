'use client'

import { useFormStatus } from 'react-dom'
import { useState } from 'react'

// Starting the draft flips the league out of 'setup', which makes the invite
// code stop working — permanently, with no way to add a team afterwards. That
// is a one-way door and it used to be a single unlabelled click.
export default function StartDraftButton({ joined, expected, disabled }) {
  const { pending } = useFormStatus()
  const [confirming, setConfirming] = useState(false)
  const short = joined < expected
  const locked = Math.max(0, expected - joined)

  if (pending) return <button disabled type="submit">Starting…</button>

  if (confirming) {
    return (
      <span className="startConfirm">
        <b>{short ? `Lock out the other ${locked}?` : 'Start for real?'}</b>
        <small>
          {short
            ? `Only ${joined} of ${expected} teams have joined. Starting now closes the invite code for good — the missing ${locked} cannot join later.`
            : 'The invite code stops working and the draft cannot be restarted.'}
        </small>
        <span>
          <button disabled={disabled} type="submit">Yes, start the draft</button>
          <button onClick={() => setConfirming(false)} type="button">Cancel</button>
        </span>
      </span>
    )
  }

  return (
    <button
      data-short={short ? 'true' : undefined}
      disabled={disabled}
      onClick={(event) => { event.preventDefault(); setConfirming(true) }}
      type="button"
    >
      Start draft{short ? ` (${joined}/${expected})` : ''}
    </button>
  )
}
