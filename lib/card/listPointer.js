// THE ONE LINE THAT POINTS A PUBLIC DISCORD ROOM AT THE SITE'S CALLED LIST (batch member-requests 2B, 2026-10-25: "public sport channels: live alerts as
// they are, plus one line pointing to the site list"). It rides ONLY the free pregame Card post's DISCORD copy (kind card_<sport>); X is untouched
// (no links, and the X text is a different thing), and no other public post carries it. In words, never a URL, like the Ledger pointer. It says where
// the list is; it names nobody and holds nothing a free viewer may not read (the site applies the Card's own who-sees-what rule). Pure.
import { BRAND, POST_POINTER } from '../routes'

const CARD_KIND = /^card_(mlb|nfl|nhl|nba)$/
export const listPointerFor = (kind) => {
  const m = CARD_KIND.exec(String(kind || ''))
  return m ? `Every called play ${POST_POINTER.arrow} ${POST_POINTER.home} · ${BRAND[m[1]].name} · Called list` : null
}

/** The text with the pointer as its last block, when the kind takes one, it is not there yet and it fits `limit`. Never trims the post to make room. */
export function withListPointer(text, kind, { limit = Infinity } = {}) {
  const t = String(text || '')
  const line = listPointerFor(kind)
  if (!t || !line || t.includes(line)) return t
  const out = `${t.replace(/\s+$/, '')}\n\n${line}`
  return Array.from(out).length <= limit ? out : t
}
