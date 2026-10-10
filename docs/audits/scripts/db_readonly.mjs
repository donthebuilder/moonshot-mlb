import { createRequire } from 'module'
const require = createRequire('/Volumes/DONX/USERS/Kingdondondon/Desktop/moonshot-push/')
const { loadEnvConfig } = require('@next/env')
loadEnvConfig('/Volumes/DONX/USERS/Kingdondondon/Desktop/moonshot-push/')
const { createClient } = require('@supabase/supabase-js')
export const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)
export const sid = (id) => Number((BigInt(id) >> 22n) + 1288834974657n)
export async function all(table, sel, f = (q) => q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await f(db.from(table).select(sel)).range(from, from + 999)
    if (error) throw new Error(table + ': ' + error.message)
    out.push(...data); if (data.length < 1000) break
  }
  return out
}
