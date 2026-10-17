// WHOP WEBHOOK (2026-10-17): a purchase / cancel on Whop flips site access within seconds. POST = Whop's delivery (Standard Webhooks signature, env
// WHOP_WEBHOOK_SECRET). GET = the daily reconcile, for Vercel cron (Bearer CRON_SECRET) or a signed-in admin; nothing here is a debug route.
// Logs a hash of the email, never the address or the secret. Bad signature -> 400; a database failure -> 500 so Whop retries; anything else -> 200.
import { after } from 'next/server'
import { adminClient, cronAuthorized } from '../../../../lib/supabase/admin'
import { verifyWhopSignature, decideFromEvent, applyDecision, reconcileWhop, emailTag } from '../../../../lib/members/whop'
import { hasSupabaseConfig } from '../../../../lib/supabase/config'
import { createSupabaseServerClient } from '../../../../lib/supabase/server'
import { isAdminUser } from '../../../../lib/admin'

export const dynamic = 'force-dynamic'
const H = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
const DAY = 20 * 3600 * 1000
let lastReconcile = 0 // per server instance; a cheap "about once a day" without a new cron

const runReconcile = (db) => reconcileWhop(db, { apiKey: process.env.WHOP_API_KEY, companyId: process.env.WHOP_COMPANY_ID })

export async function POST(request) {
  const secret = process.env.WHOP_WEBHOOK_SECRET
  const raw = await request.text()
  if (!secret || !verifyWhopSignature(raw, request.headers, secret)) return new Response('bad signature', { status: 400, headers: H })
  let body
  try { body = JSON.parse(raw) } catch { return new Response('ok', { status: 200, headers: H }) }
  const decision = decideFromEvent(body)
  if (!decision) return new Response('ignored', { status: 200, headers: H })
  const db = adminClient()
  if (!db) return new Response('no database', { status: 500, headers: H })
  try {
    const r = await applyDecision(db, decision)
    console.log(`[whop] ${decision.event} ${decision.mapped.status} ${emailTag(decision.mapped.email)} -> ${r.action}`)
  } catch (e) {
    console.error(`[whop] ${decision.event} ${emailTag(decision.mapped.email)} failed: ${String(e.message).slice(0, 120)}`)
    return new Response('retry', { status: 500, headers: H })
  }
  if (Date.now() - lastReconcile > DAY && process.env.WHOP_API_KEY && process.env.WHOP_COMPANY_ID) {
    lastReconcile = Date.now()
    try { after(async () => { const out = await runReconcile(db); console.log(`[whop] reconcile ${JSON.stringify(out)}`) }) } catch {}
  }
  return new Response('ok', { status: 200, headers: H })
}

export async function GET(request) {
  let allowed = cronAuthorized(request)
  if (!allowed && hasSupabaseConfig()) {
    try { const sb = await createSupabaseServerClient(); const { data: { user } } = await sb.auth.getUser(); allowed = isAdminUser(user) } catch {}
  }
  if (!allowed) return new Response('not found', { status: 404, headers: H })
  const out = await runReconcile(adminClient())
  lastReconcile = Date.now()
  return Response.json(out, { status: out.ok ? 200 : 502, headers: H })
}
