'use client'
import NflFace from './nfl/NflFace'
import { nflHeadshot } from '../lib/nfl/nflAssets'

// ONE FACE, ALL THREE PRODUCTS (2026-09-27, BATCH-FACES step 8).
//
// MOONSHOT had no player photo anywhere; TUDDY had them on the Board cards
// and the card head (NflFace); LAMP on its player page (the feed's mug). This
// is the one component the three share, and it computes nothing but a URL:
//   mlb  img.mlbstatic.com's own headshot path, with its generic-silhouette
//        default built in (d_people:generic...), so it never 404s
//   nfl  NflFace -- ESPN's combiner off the published espn_id, the club
//        monogram tile underneath (a 404 shows the tile, no JS)
//   nhl  the mug URL the NHL feed hands us (lib/nhl/reduce headshot/mugshot)
// Lazy, width/height set (no layout shift), fetched at 2x for retina, alt =
// his name.
//
// variant 'card' (cards, lists, heads): a round photo, with a monogram when
//   there is nothing to show.
// variant 'table' (dense rows, desktop only -- the caller decides): photo or
//   nothing at all; never a monogram, never a badge, never a border.
// Pass `photo` to use a URL you already have (NHL), `id` otherwise.

// FACE CROP (2026-09-27): MLB's headshot is a 2:3 portrait, and cropping it
// square in CSS (cover + 'top center') showed cap and forehead and cut the
// chin. mlbstatic crops it for us instead: square, centred on the face
// (h + c_thumb + g_face); the generic-silhouette default still applies.
const mlbUrl = (id, px) => `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_${px},h_${px},c_thumb,g_face,q_auto:best/v1/people/${encodeURIComponent(id)}/headshot/67/current`
// STRICT (face in the dial, 2026-09-27): the same square face crop WITHOUT the
// generic-silhouette default, so a player with no photo 404s and the caller
// falls back to its own no-face look (the number in the ring) instead of
// drawing a silhouette.
export const mlbFaceStrict = (id, px) => (id ? `https://img.mlbstatic.com/mlb-photos/image/upload/w_${px},h_${px},c_thumb,g_face,q_auto:best/v1/people/${encodeURIComponent(id)}/headshot/67/current` : null)
const initials = (name) => String(name || '').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

// Per product, looked up -- never a sport ternary (CLAUDE.md).
const URL_OF = {
  mlb: ({ id, size }) => (id ? mlbUrl(id, size * 2) : null),
  nfl: ({ espnId, size }) => (espnId ? nflHeadshot(String(espnId), size, size) : null),
  nhl: () => null, // LAMP always passes the feed's own mug as `photo`
}
// A product whose card face already exists keeps it (TUDDY's club tile).
const CARD_OF = {
  nfl: ({ espnId, team, name, size }) => <NflFace player={{ espn_id: espnId, team, name }} size={size} />,
}

export function faceUrl({ sport, id, espnId, photo, size = 40 }) {
  return photo || URL_OF[sport]?.({ id, espnId, size }) || null
}

export default function PlayerFace({ sport, id = null, espnId = null, photo = null, team = null, name = '', size = 40, variant = 'card', theme = null, className = '', style = null }) {
  if (variant === 'card' && CARD_OF[sport]) return CARD_OF[sport]({ espnId, team, name, size })
  const src = faceUrl({ sport, id, espnId, photo, size })
  if (variant === 'table') {
    if (!src) return null
    return (
      // A table face that 404s disappears -- no monogram, no broken-image box.
      <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" className={className || undefined}
        onError={(e) => { e.currentTarget.style.display = 'none' }}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', objectPosition: 'center', flex: 'none', verticalAlign: 'middle', ...style }} />
    )
  }
  const bg = theme?.bg3 || 'rgba(255,255,255,.06)'
  const ink = theme?.text2 || 'rgba(255,255,255,.7)'
  return (
    <span aria-hidden="true" title={name || undefined} style={{
      position: 'relative', display: 'inline-grid', placeItems: 'center', flex: '0 0 auto',
      width: size, height: size, borderRadius: '50%', overflow: 'hidden', background: bg,
      color: ink, font: `900 ${Math.max(8, Math.round(size * 0.34))}px/1 monospace`,
    }}>
      {initials(name)}
      {src && (
        <img src={src} alt={name || ''} width={size} height={size} loading="lazy" decoding="async"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
      )}
    </span>
  )
}
