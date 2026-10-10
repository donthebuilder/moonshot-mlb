// THE DASH DISCORD CARD (2026-10-10, Donovan: "all Discord posts should be built on this [the THE CALL write-up
// embed style] but we need to make our own card too"). ONE module, pure, no I/O: a branded, text-only Discord
// embed that any post can adopt by passing structured parts.
//
//   🚨 KYLE CONNOR SCORES · WPG vs ANA                       <- title: emoji + HEADLINE in caps
//   CALLED · goal scorer                                     <- description: the status word, the market (+ unit)
//   THE CALL    / THE GOAL / WHY / THE RECORD  ...           <- up to MAX_SECTIONS named sections (embed fields)
//   LAMP · DASH Network                       10/10 8:41 PM  <- footer from the registry BRAND; timestamp = the event time
//   (left bar = the product's accent, from its own theme)
//
// RULES (CLAUDE.md): Discord only (X keeps no links), and exactly TWO link slots, both on the site host and both built from the routes registry:
// the title url (the player's page: playerUrl) and ONE ledger line per card (a section's `link`: ledgerLink). Every other string is stripped of links; the status word only via
// lib/callStatus STATUS_WORD and it is never clamped away; the colour is the product's accent read from
// lib/sportAccent SPORT_ACCENT (never typed here); the product word is BRAND[sport].name (lib/routes.js), never a ternary;
// no model probability is printed (this module prints only what it is handed). The picture, when there is one, is
// attached by lib/dash/xPost.js postToDiscord (image: attachment://card.png) exactly as before.
//
// DISCORD'S LIMITS, enforced by clampText / fitEmbed: title 256, description 4096, 25 fields, field name 256,
// field value 1024, footer 2048, and 6000 characters across title + description + footer + every field name and value.
import { SPORT_ACCENT } from '../sportAccent'
import { BRAND, DEFAULT_SPORT, MLB_NAV, POST_POINTER, appHref, playerHref } from '../routes'
import { STATUS_WORD } from '../callStatus'

export const LIMITS = Object.freeze({ title: 256, description: 4096, fields: 25, name: 256, value: 1024, footer: 2048, total: 6000 })
/** The most sections a card carries by default (the brief: "up to ~5"). */
export const MAX_SECTIONS = 5
/** The product word on cross-sport posts (a receipt spans every product). */
export const HOUSE = 'DASH Network'

const ELLIPSIS = '…'
const glyphs = (s) => Array.from(String(s == null ? '' : s))
/** Length as Discord counts it (code points). */
export const len = (s) => glyphs(s).length

// ── text safety ─────────────────────────────────────────────────────────────
/** A string with no link in it: markdown links keep their words, a bare URL goes. Bare text such as `dashnetwork.vercel.app/called` is left (it is only text). */
export function noLinks(raw) {
  return String(raw == null ? '' : raw)
    .replace(/\[([^\]]*)\]\((?:[^)]*)\)/g, '$1')
    .replace(/<https?:\/\/[^>\s]*>/gi, '')
    .replace(/\bhttps?:\/\/\S+/gi, '')
    .replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ')
    .trim()
}

/**
 * `s` cut to `max` code points on a boundary: a whole line first, then a whole word, ending in an ellipsis. A single
 * word longer than `max` is the only raw cut (taken by code point, so an emoji is never split). Never mid-word otherwise.
 */
export function clampText(raw, max) {
  const s = String(raw == null ? '' : raw)
  if (len(s) <= max) return s
  if (max <= 1) return glyphs(s).slice(0, Math.max(0, max)).join('')
  const room = max - 1                        // the ellipsis takes one
  const lines = s.split('\n')
  while (lines.length > 1) {
    lines.pop()
    const j = lines.join('\n').trimEnd()
    if (j && len(j) <= room) return j + ELLIPSIS
  }
  const words = lines[0].split(' ')
  while (words.length > 1) {
    words.pop()
    const j = words.join(' ').trimEnd()
    if (j && len(j) <= room) return j + ELLIPSIS
  }
  return glyphs(s).slice(0, room).join('').trimEnd() + ELLIPSIS
}

/** A field's lines clamped to `max`: whole lines are dropped from the bottom first (never half a line), then the last line is word-clamped. */
export function clampLines(lines, max) {
  const ls = (lines || []).map((l) => noLinks(l)).filter(Boolean)
  while (ls.length > 1 && len(ls.join('\n')) > max) ls.pop()
  return clampText(ls.join('\n'), max)
}

// ── the product ─────────────────────────────────────────────────────────────
/** An accent from the product's own theme (a '#rrggbb' string) as the integer Discord wants. undefined when it is not a hex colour. */
export function colorInt(hex) {
  const h = String(hex == null ? '' : hex).replace('#', '')
  return /^[0-9a-f]{6}$/i.test(h) ? parseInt(h, 16) : undefined
}
/** The product's accent as Discord's integer; an unknown sport (or none: a cross-sport post) wears the house colour, MOONSHOT's. */
export const accentOf = (sport) => colorInt(SPORT_ACCENT[sport] || SPORT_ACCENT.mlb)
/** "LAMP · DASH Network" (the product word from the registry, not a ternary); "DASH Network" with no sport. */
export const footerOf = (sport) => (BRAND[sport]?.name ? `${BRAND[sport].name} · ${HOUSE}` : HOUSE)
/** The status word of a call status ('called' | 'board' | 'off'), only from lib/callStatus. '' for anything else (a game that never locked has none). */
export const statusWordOf = (status) => STATUS_WORD[status] || ''

const isoOf = (at) => {
  if (at == null || at === '') return undefined
  const ms = at instanceof Date ? at.getTime() : typeof at === 'number' ? at : Date.parse(String(at))
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined
}


// ── the two link slots (Discord only; Donovan 2026-10-10) ────────────────────
/** The site's own origin: NEXT_PUBLIC_SITE_URL, else the production host (the same default xPost's momentEmbed used). Never a third party. */
export function siteBase() {
  const raw = String(process.env.NEXT_PUBLIC_SITE_URL || 'dashnetwork.vercel.app').trim().replace(/\/+$/, '')
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}
/** A site path as an absolute URL on the site host. '' for anything that is not a site path. */
export const siteUrl = (path) => (typeof path === 'string' && path.startsWith('/') ? `${siteBase()}${path}` : '')
/** The player's page on the site (lib/routes.js playerHref), or undefined without an id. */
export const playerUrl = (sport, id) => (id == null || String(id).trim() === '' ? undefined : siteUrl(playerHref(sport, id)) || undefined)
/** The one ledger line: the existing pointer words (receipt.js ledgerPointer) as a markdown link to the sport's Ledger tab (appHref). */
export const ledgerLink = (sport = DEFAULT_SPORT) => ({ text: `Every call, graded ${POST_POINTER.arrow} ${POST_POINTER.home} \u00B7 ${MLB_NAV.ledger.label}`, url: siteUrl(appHref(sport, 'ledger')) })
const mdLink = (l) => (l && l.text && l.url ? `[${l.text}](${l.url})` : '')
/** Every URL an embed carries (title url + markdown links in its strings). */
export function embedUrls(e) {
  const strings = [e?.title, e?.description, e?.footer?.text, ...(e?.fields || []).flatMap((f) => [f.name, f.value])].map((x) => String(x == null ? '' : x))
  return [...(e?.url ? [String(e.url)] : []), ...strings.flatMap((s) => s.match(/https?:\/\/[^\s)>\]]+/gi) || [])]
}

// ── the card ────────────────────────────────────────────────────────────────
const sectionOf = (s) => {
  if (!s) return null
  const name = noLinks(s.name).toUpperCase()
  const link = mdLink(s.link)
  const room = LIMITS.value - (link ? len(link) + 1 : 0)
  const body = Array.isArray(s.lines) ? clampLines(s.lines, room) : clampLines(String(s.text == null ? '' : s.text).split('\n'), room)
  const value = [body, link].filter(Boolean).join('\n')
  if (!name || !value) return null
  return { name: clampText(name, LIMITS.name), value, inline: false }
}

/** Characters Discord counts across the whole embed. */
export function embedSize(e) {
  return len(e?.title) + len(e?.description) + len(e?.footer?.text) + len(e?.author?.name)
    + (e?.fields || []).reduce((n, f) => n + len(f.name) + len(f.value), 0)
}

/**
 * Bring any embed inside Discord's limits: sections are dropped from the bottom, whole, until the total fits (the last
 * section is never the one lost while another remains), then the description is word-clamped. Pure; returns a new object.
 */
export function fitEmbed(embed) {
  const e = { ...embed }
  if (e.title != null) e.title = clampText(e.title, LIMITS.title)
  if (e.description != null) e.description = clampText(e.description, LIMITS.description)
  if (e.footer?.text != null) e.footer = { ...e.footer, text: clampText(e.footer.text, LIMITS.footer) }
  if (e.fields) e.fields = e.fields.slice(0, LIMITS.fields).map((f) => ({ ...f, name: clampText(f.name, LIMITS.name), value: clampText(f.value, LIMITS.value) }))
  while (e.fields?.length > 1 && embedSize(e) > LIMITS.total) e.fields = e.fields.slice(0, -1)
  if (embedSize(e) > LIMITS.total && e.description) {
    const over = embedSize(e) - LIMITS.total
    e.description = clampText(e.description, Math.max(1, len(e.description) - over))
  }
  return e
}

/**
 * Build the card. Every part is optional except `title`.
 * @param sport       'mlb' | 'nfl' | 'nhl' | 'nba' | null (null = a cross-sport post: house footer and colour)
 * @param title       the headline (caps are the caller's job; an emoji leads it)
 * @param status      'called' | 'board' | 'off' | null: puts the STATUS_WORD at the head of the description, and it survives any clamp
 * @param description the rest of the one line (the market, the unit)
 * @param sections    [{ name, lines: string[] } | { name, text }]: at most `maxSections`, dropped from the bottom if the card is too long
 * @param url         the title link: the player's page (playerUrl); only an absolute URL on the site host is kept
 * @param footer      overrides the default footer (the product word · DASH Network)
 * @param at          the event time (Date | ms | ISO): the embed timestamp; omitted when unknown
 * @param image       OPTIONAL picture slot: an 'attachment://<file>' reference only (the own picture cards plug in here later; a web URL is refused).
 *                    postToDiscord's png / imageUrl, when passed, take this slot as they always have
 * @param accent      a '#rrggbb' string from a theme (default: the product's SPORT_ACCENT)
 * @returns a Discord embed object (no url, no image: postToDiscord attaches the picture)
 */
export function buildCard({ sport = null, title, status = null, description = '', sections = [], footer = null, at = null, accent = null, image = null, url = null, maxSections = MAX_SECTIONS } = {}) {
  const word = statusWordOf(status)
  const rest = noLinks(description)
  const headLen = word ? len(word) + (rest ? 3 : 0) : 0
  const body = word ? [word, clampText(rest, Math.max(0, LIMITS.description - headLen))].filter(Boolean).join(' · ') : clampText(rest, LIMITS.description)
  const fields = (sections || []).map(sectionOf).filter(Boolean).slice(0, Math.max(0, Math.min(maxSections, LIMITS.fields)))
  const card = {
    title: clampText(noLinks(title), LIMITS.title),
    ...(url && String(url).startsWith(`${siteBase()}/`) ? { url: String(url) } : {}),
    ...(body ? { description: body } : {}),
    ...(fields.length ? { fields } : {}),
    color: (accent ? colorInt(accent) : undefined) ?? accentOf(sport),
    footer: { text: clampText(noLinks(footer) || footerOf(sport), LIMITS.footer) },
    ...(isoOf(at) ? { timestamp: isoOf(at) } : {}),
    ...(/^attachment:\/\/[\w.-]+$/.test(String(image || '')) ? { image: { url: String(image) } } : {}),
  }
  return fitEmbed(card)
}

/** STRICT: true when the embed holds any link at all (the two Discord slots included; see embedUrls). True when a string anywhere in the embed holds a link (a url key, a URL, a markdown link). The image is the one allowed reference (attachment://). */
export function embedHasLink(e) {
  if (!e || typeof e !== 'object') return false
  if (e.url || e.footer?.icon_url || e.author?.url || e.thumbnail || e.video) return true
  const strings = [e.title, e.description, e.footer?.text, ...(e.fields || []).flatMap((f) => [f.name, f.value])].map((x) => String(x == null ? '' : x))
  return strings.some((s) => /https?:\/\//i.test(s) || /\]\(/.test(s))
}
