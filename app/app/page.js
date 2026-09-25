// MOONSHOT and TUDDY — the sport app, at /app since 2026-08-28.
//
// IT USED TO BE `/`. The front door took that address (app/(front)/page.js),
// and this moved here rather than gaining a hub section of its own, because
// the two pages answer different questions: one is "what is this and what's
// on", the other is a working board you keep open all night.
//
// NOTHING OLD BREAKS. Every link ever posted — Discord, bookmarks, the share
// cards — points at `/#sport=mlb&tab=home`, and a hash is never sent to the
// server, so a redirect on the server could not have preserved them.
// components/LegacyHashRedirect.js sits on the front door instead and
// forwards any hash carrying `sport=` or `tab=` to this route with the hash
// intact. The board opens on exactly the tab and player the link asked for.
import SportRoot from '../../components/SportRoot'

// 2026-09-24 (SEO-1/2): the board's own canonical. Every #sport=…&tab=… is
// this one document to a crawler; the tab title is set client-side by each
// dashboard (document.title) for people, not bots.
export const metadata = {
  title: 'The board — MOONSHOT & TUDDY · DASH Network',
  description: 'Tonight\u2019s MLB home-run board and this week\u2019s NFL touchdown board, every call graded in public.',
  alternates: { canonical: '/app' },
}

export default function Page() {
  return <SportRoot />
}
