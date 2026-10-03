// BUCKETS' route answers (LAMP's lib/nhl/respond.js shape). While BUCKETS is
// gated (lib/nba/gate.js) an answer is PRIVATE -- the shared CDN must never
// hand one admin's response to anyone else; once BUCKETS_PUBLIC=on it caches
// like LAMP's. Every route runs through bucketsRoute(), so the gate can't be
// forgotten on one.
import { lastNbaError } from './api'
import { bucketsGuard, bucketsPublic } from './gate'

export function ok(body, maxAge = 60) {
  return Response.json(body, {
    headers: { 'Cache-Control': bucketsPublic() ? `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}` : `private, max-age=${Math.min(maxAge, 60)}` },
  })
}
export function bad(reason) {
  return Response.json({ error: 'BAD REQUEST', detail: reason }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
}
export function delayed(where, err) {
  console.error(`[buckets] ${where}: ${err?.message || err}`, lastNbaError() || '')
  if (err?.status === 404) return Response.json({ error: 'NOT FOUND', detail: 'The league has nothing under that id.', where }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  return Response.json({ error: 'LIVE DATA DELAYED', detail: 'Waiting on the league feed.', where }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
}
/** A gated GET: the gate first, then the handler; a throw is 'delayed'. */
export const bucketsRoute = (where, handler) => async (request) => {
  const no = await bucketsGuard()
  if (no) return no
  try { return await handler(new URL(request.url).searchParams, request) } catch (e) { return delayed(where, e) }
}
