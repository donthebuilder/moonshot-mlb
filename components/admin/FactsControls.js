'use client'
// /admin: the fact engine's kill switch and DELETE (BATCH-FACT-ENGINE).
// POSTs to /api/admin/facts; the page reloads to show the new state.
import { useState } from 'react'
import { C } from '../../lib/theme'

const btn = (tone) => ({ minHeight: 44, padding: '0 14px', borderRadius: 10, border: `1px solid ${tone}`, background: 'transparent', color: tone, fontWeight: 800, fontSize: 13, cursor: 'pointer' })
async function send(body) {
  const r = await fetch('/api/admin/facts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  return r.ok ? null : (j.error || `HTTP ${r.status}`)
}

export function AutopostSwitch({ on, missing }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  if (missing) return <span style={{ color: C.text3, fontSize: 13 }}>off until the SQL runs</span>
  const flip = async () => {
    setBusy(true); setErr(null)
    const e = await send({ action: 'autopost', value: on ? 'off' : 'on' })
    if (e) { setErr(e); setBusy(false) } else window.location.reload()
  }
  return (
    <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <b style={{ color: on ? C.green : C.red }}>{on ? 'ON' : 'OFF'}</b>
      <button type="button" disabled={busy} onClick={flip} style={btn(on ? C.red : C.green)}>{on ? 'Turn auto-post OFF' : 'Turn auto-post ON'}</button>
      {err ? <span style={{ color: C.red, fontSize: 12 }}>{err}</span> : null}
    </span>
  )
}

export function DeleteFactPost({ id }) {
  const [state, setState] = useState(null)
  const go = async () => {
    setState('…')
    const e = await send({ action: 'delete', id })
    setState(e ? `failed: ${e}` : 'deleted')
  }
  if (state === 'deleted') return <span style={{ color: C.text3, fontSize: 12 }}>deleted from X</span>
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <button type="button" onClick={go} disabled={state === '…'} style={btn(C.red)}>Delete from X</button>
      {state && state !== '…' ? <span style={{ color: C.red, fontSize: 12 }}>{state}</span> : null}
    </span>
  )
}
