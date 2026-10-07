// /ledger IS /called (2026-10-07): The Ledger's public page keeps its address (every shared link still
// works) and answers to its own name too. A redirect that carries the query along (?sport=nhl).
import { redirect } from 'next/navigation'

export const metadata = { robots: { index: false }, alternates: { canonical: '/called' } }

export default async function LedgerAlias({ searchParams }) {
  const params = (await searchParams) || {}
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) for (const x of [].concat(v)) if (typeof x === 'string') q.append(k, x)
  redirect(`/called${q.toString() ? `?${q}` : ''}`)
}
