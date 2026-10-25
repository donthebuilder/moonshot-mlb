'use server'

// ONE TEST POST TO ONE DISCORD CHANNEL (2026-10-23, Donovan: "send one short test message to #buckets-nba and #dash-network"). Admin only: the same
// gate as /admin, judged on the server. One channel per click; the result comes back in the address (?sent=<key>&ok=1|0), never a URL or token.
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '../../../lib/supabase/server'
import { isAdminUser } from '../../../lib/admin'
import { isRoomKey, sendTest, sendBotTest } from '../../../lib/dash/discordWire'

export async function sendDiscordTest(formData) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } = {} } = supabase ? await supabase.auth.getUser() : {}
  if (!user || !isAdminUser(user)) redirect('/')
  const key = String(formData.get('key') || '')
  if (!isRoomKey(key)) redirect('/admin/discord')
  const r = await sendTest(key)
  redirect(`/admin/discord?sent=${encodeURIComponent(key)}&ok=${r.ok ? 1 : 0}${r.status ? `&status=${encodeURIComponent(String(r.status))}` : ''}`)
}

// THE BOT TEST (2026-10-25): a test line in #members, then the bot's reply under it. The result comes back as ?bot=<step>&ok=1|0.
export async function sendBotTestAction() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } = {} } = supabase ? await supabase.auth.getUser() : {}
  if (!user || !isAdminUser(user)) redirect('/')
  const r = await sendBotTest()
  redirect(`/admin/discord?bot=${encodeURIComponent(r.step)}&ok=${r.ok ? 1 : 0}${r.status ? `&status=${encodeURIComponent(String(r.status))}` : ''}`)
}
