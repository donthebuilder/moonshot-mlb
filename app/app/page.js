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

export default function Page() {
  return <SportRoot />
}
