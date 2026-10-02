'use client'

import { useFormStatus } from 'react-dom'

// Every Franchise mutation is a server action in a plain <form>. Without this
// the button gives no feedback at all and a double-click submits twice.
export default function SubmitButton({ children, pendingLabel, className, disabled, ...rest }) {
  const { pending } = useFormStatus()
  return (
    <button
      {...rest}
      aria-busy={pending || undefined}
      className={className}
      disabled={pending || disabled}
      type="submit"
    >
      {pending ? (pendingLabel || 'Working…') : children}
    </button>
  )
}
