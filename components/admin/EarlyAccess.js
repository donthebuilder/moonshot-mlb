'use client'
// THE "EARLY ACCESS" CARD IN THE ADMIN HUB (2026-10-12, Donovan: "give me something to give early access to people I want for BUCKETS or any feature").
// Drawn only inside the admin hub (which is itself behind the admin gate); its data comes from /api/admin/early-access, which answers 404 to anyone else.
// Phone first: one column, every control 44px or taller, link shown ONCE with Copy and Share. Colours are the page's tokens (var(--panel) etc).
import { useCallback, useEffect, useState } from 'react'

const USES = [1, 5, 25]
const EXPIRES = [['24h', '24 hours'], ['7d', '7 days'], ['30d', '30 days'], ['never', 'Never']]
const API = '/api/admin/early-access'

const box = { border: '1px solid var(--line)', borderRadius: 12, background: 'var(--panel)', padding: 14, marginTop: 10 }
const small = { color: 'var(--dim)', fontSize: 12, lineHeight: 1.4 }
const btn = { minHeight: 48, padding: '0 16px', border: '1px solid var(--line)', borderRadius: 12, background: 'transparent', color: 'inherit', font: 'inherit', fontWeight: 800, fontSize: 15, cursor: 'pointer' }
const field = { width: '100%', minHeight: 48, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 12, background: 'transparent', color: 'inherit', font: 'inherit', fontSize: 16, boxSizing: 'border-box' }
const label = { display: 'block', margin: '12px 0 6px', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--dim)' }
const seg = (on) => ({ ...btn, flex: '1 1 0', minWidth: 0, padding: '0 6px', background: on ? 'var(--ink)' : 'transparent', color: on ? 'var(--bg)' : 'inherit' })
const dateWords = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '' }
const expWords = (iso) => (iso ? `expires ${dateWords(iso)}` : 'never expires')

export default function EarlyAccess() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [feature, setFeature] = useState('')
  const [uses, setUses] = useState(1)
  const [expires, setExpires] = useState('7d')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [gEmail, setGEmail] = useState('')
  const [gExpires, setGExpires] = useState('never')
  const [gNote, setGNote] = useState('')
  const [gMsg, setGMsg] = useState('')
  const [made, setMade] = useState(null)       // { link, label, uses, expires } -- shown ONCE
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(API, { cache: 'no-store', credentials: 'same-origin' })
      if (!r.ok) { setErr('Could not load early access.'); return }
      const j = await r.json()
      setData(j); setErr('')
      setFeature((f) => f || j.features?.[0]?.key || '')
    } catch { setErr('Could not load early access.') }
  }, [])
  useEffect(() => { load() }, [load])

  const post = async (body) => {
    setBusy(true)
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(j.needs_sql ? `${j.error || 'Run the early-access update first'} Run ${j.file || 'the early-access SQL file'} in the SQL editor, then reload.` : (j.error || 'That did not work.')); return null }
      setErr('')
      return j
    } catch { setErr('That did not work. Check your connection.'); return null } finally { setBusy(false) }
  }

  const create = async () => {
    const j = await post({ action: 'create_invite', feature, uses, expires, note })
    if (j?.link) { setMade(j); setCopied(false); setNote(''); load() }
  }
  const grantEmail = async () => {
    const j = await post({ action: 'grant_email', email: gEmail, feature, expires: gExpires, note: gNote })
    if (j?.ok) {
      setGMsg(j.status === 'granted' ? `Access granted to ${j.who}. It works within a minute.` : `No confirmed account for ${j.who} yet. It is waiting, and switches on the first time that email signs in with a confirmed address.`)
      setGEmail(''); setGNote(''); load()
    } else setGMsg('')
  }
  const revoke = async (action, id, what) => {
    if (typeof window !== 'undefined' && !window.confirm(what)) return
    if (await post({ action, id })) load()
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(made.link); setCopied(true) } catch {
      const el = document.getElementById('early-link'); if (el) { el.focus(); el.select(); try { document.execCommand('copy'); setCopied(true) } catch { /* the field is selected: press Copy on the keyboard */ } }
    }
  }
  const share = async () => { try { await navigator.share({ title: 'DASH Network early access', text: `Early access to ${made.label}`, url: made.link }) } catch { /* cancelled */ } }
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const feats = data?.features || []
  const activeInvites = (data?.invites || []).filter((i) => i.status === 'active')
  const pastInvites = (data?.invites || []).filter((i) => i.status !== 'active').slice(0, 5)
  const holders = (data?.grants || []).filter((g) => g.status === 'active')
  const c = data?.counts || {}

  return (
    <section id="early" aria-label="Early access" style={{ marginTop: 22 }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--dim)', fontWeight: 400 }}>Early access</h2>
      <p style={{ ...small, margin: '0 0 4px' }}>Early access users see BUCKETS with its tracking labels; nothing is posted publicly. They need a signed-in account; a link opens the feature for one account per use.</p>
      {err ? <p role="alert" style={{ margin: '8px 0', fontSize: 14, lineHeight: 1.4 }}>{err}</p> : null}
      {data && data.installed === false ? (
        <div style={box}><strong>Run the update first.</strong><div style={small}>The private tables are not in the database yet. Run the <code>202610121500_early_access.sql</code> file (migrations folder) in the SQL editor, then reload this page.</div></div>
      ) : null}

      {data && data.installed !== false ? (
        <>
          <div style={box}>
            <strong style={{ fontSize: 16 }}>Make an invite link</strong>
            <label htmlFor="ea-feature" style={label}>Feature</label>
            <select id="ea-feature" value={feature} onChange={(e) => setFeature(e.target.value)} style={field}>
              {feats.map((f) => <option key={f.key} value={f.key}>{f.label}{f.public ? ' (already public)' : ''}</option>)}
            </select>
            <span style={label}>Uses (people who can redeem it)</span>
            <div role="group" aria-label="Uses" style={{ display: 'flex', gap: 8 }}>
              {USES.map((n) => <button key={n} type="button" aria-pressed={uses === n} onClick={() => setUses(n)} style={seg(uses === n)}>{n}</button>)}
            </div>
            <span style={label}>Link lasts</span>
            <div role="group" aria-label="Expiry" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {EXPIRES.map(([k, w]) => <button key={k} type="button" aria-pressed={expires === k} onClick={() => setExpires(k)} style={{ ...seg(expires === k), flex: '1 1 70px' }}>{w}</button>)}
            </div>
            <label htmlFor="ea-note" style={label}>Private note (only you see it)</label>
            <input id="ea-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="for @name" style={field} autoComplete="off" />
            <button type="button" onClick={create} disabled={busy || !feature} style={{ ...btn, width: '100%', marginTop: 14, background: 'var(--ink)', color: 'var(--bg)', opacity: busy ? 0.6 : 1 }}>{busy ? 'Working…' : 'Create link'}</button>
          </div>

          <div style={box} data-grant-email>
            <strong style={{ fontSize: 16 }}>Grant by email</strong>
            <div style={small}>For someone who already has an account, or will. No link needed.</div>
            <label htmlFor="ea-email" style={label}>Their email</label>
            <input id="ea-email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" value={gEmail} onChange={(e) => setGEmail(e.target.value)} placeholder="name@example.com" style={field} />
            <span style={label}>Access lasts</span>
            <div role="group" aria-label="Access lasts" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[...EXPIRES].reverse().map(([k, w]) => <button key={k} type="button" aria-pressed={gExpires === k} onClick={() => setGExpires(k)} style={{ ...seg(gExpires === k), flex: '1 1 70px' }}>{w === 'Never' ? 'Until I revoke' : w}</button>)}
            </div>
            <label htmlFor="ea-gnote" style={label}>Private note (optional)</label>
            <input id="ea-gnote" value={gNote} onChange={(e) => setGNote(e.target.value)} maxLength={120} placeholder="for @name" style={field} autoComplete="off" />
            <button type="button" onClick={grantEmail} disabled={busy || !feature || !gEmail.includes('@')} style={{ ...btn, width: '100%', marginTop: 14, background: 'var(--ink)', color: 'var(--bg)', opacity: busy || !gEmail.includes('@') ? 0.6 : 1 }}>Grant access</button>
            {gMsg ? <p role="status" style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.4 }}>{gMsg}</p> : null}
          </div>

          {made ? (
            <div style={{ ...box, borderColor: 'var(--ink)' }} data-early-link-box>
              <strong style={{ fontSize: 16 }}>Your link</strong>
              <div style={small}>{made.label} · {made.uses} {made.uses === 1 ? 'use' : 'uses'} · {EXPIRES.find((e) => e[0] === made.expires)?.[1] || ''}. It is shown once: copy it now. After this only the last 4 characters are kept.</div>
              <input id="early-link" readOnly value={made.link} onFocus={(e) => e.target.select()} style={{ ...field, marginTop: 10, fontSize: 14 }} aria-label="Invite link" />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" onClick={copy} style={{ ...btn, flex: 1 }}>{copied ? 'Copied' : 'Copy link'}</button>
                {canShare ? <button type="button" onClick={share} style={{ ...btn, flex: 1 }}>Share…</button> : null}
              </div>
              <button type="button" onClick={() => setMade(null)} style={{ ...btn, width: '100%', marginTop: 8, fontWeight: 400, color: 'var(--dim)' }}>Done, hide the link</button>
            </div>
          ) : null}

          <h3 style={{ margin: '18px 0 0', fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--dim)', fontWeight: 400 }}>
            Active invites · {c.active_invites ?? activeInvites.length}
          </h3>
          {activeInvites.length === 0 ? <p style={small}>No active invites.</p> : activeInvites.map((i) => (
            <div key={i.id} style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 15 }}>{i.label} · …{i.tail}</strong>
                  <div style={small}>{i.uses} of {i.max_uses} used · {expWords(i.expires_at)}{i.note ? ` · ${i.note}` : ''}</div>
                  {i.redeemed_by.length ? <div style={small}>Redeemed by {i.redeemed_by.join(', ')}</div> : null}
                </div>
                <button type="button" disabled={busy} onClick={() => revoke('revoke_invite', i.id, `Revoke the invite ending ${i.tail}? Its link stops working. People who already redeemed it keep access.`)} style={{ ...btn, flex: '0 0 auto' }}>Revoke</button>
              </div>
            </div>
          ))}

          <h3 style={{ margin: '18px 0 0', fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--dim)', fontWeight: 400 }}>
            Who has access · {c.active_grants ?? holders.length}
          </h3>
          {holders.length === 0 ? <p style={small}>Nobody yet.</p> : holders.map((g) => (
            <div key={g.id} style={{ padding: '10px 0', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 15, wordBreak: 'break-all' }}>{g.who}</strong>
                <div style={small}>{g.label} · since {dateWords(g.granted_at)}{g.note ? ` · ${g.note}` : ''}</div>
              </div>
              <button type="button" disabled={busy} onClick={() => revoke('revoke_grant', g.id, `Take ${g.label} access away from ${g.who}? It stops within a minute.`)} style={{ ...btn, flex: '0 0 auto' }}>Revoke</button>
            </div>
          ))}

          {(data.pending || []).filter((p) => p.status === 'pending').length ? (
            <>
              <h3 style={{ margin: '18px 0 0', fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--dim)', fontWeight: 400 }}>Waiting for sign-in · {c.pending ?? 0}</h3>
              {data.pending.filter((p) => p.status === 'pending').map((p) => (
                <div key={p.id} style={{ padding: '10px 0', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: 15, wordBreak: 'break-all' }}>{p.who}</strong>
                    <div style={small}>{p.label} · pending · {expWords(p.expires_at)}{p.note ? ` · ${p.note}` : ''}</div>
                  </div>
                  <button type="button" disabled={busy} onClick={() => revoke('revoke_pending', p.id, `Cancel the waiting grant for ${p.who}?`)} style={{ ...btn, flex: '0 0 auto' }}>Revoke</button>
                </div>
              ))}
            </>
          ) : null}

          {pastInvites.length ? (
            <>
              <h3 style={{ margin: '18px 0 0', fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--dim)', fontWeight: 400 }}>Recent, no longer active</h3>
              {pastInvites.map((i) => <div key={i.id} style={{ ...small, padding: '8px 0', borderTop: '1px solid var(--line)' }}>{i.label} · …{i.tail} · {i.status} · {i.uses} of {i.max_uses} used{i.note ? ` · ${i.note}` : ''}</div>)}
            </>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
