'use client'
import { useEffect, useRef, useState } from 'react'
import NflFace from './nfl/NflFace'
import { nflHeadshot } from '../lib/nfl/nflAssets'
import { teamColor, isKnownTeam, mlbHeadshot } from '../lib/mlbTeams'
import { CHASSIS } from '../lib/design/tokens'

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

// SILO, LIKE LAMP (2026-09-27, MLB-FACES-LIKE-NHL): Donovan likes LAMP's faces --
// the NHL feed's mug is a transparent cut-out, head and shoulders with the
// jersey, on the page's dark circle. mlbstatic has the same kind of image, the
// 'silo' headshot: square, transparent, cap + face + jersey. Already square, so
// no crop parameters; the dark circle / club tile shows through behind it.
// (Before that, same day:) FACE CROP: MLB's studio headshot is a 2:3 portrait, and cropping it
// square in CSS (cover + 'top center') showed cap and forehead and cut the
// chin. mlbstatic crops it for us instead: square, centred on the face
// (h + c_thumb + g_face); the generic-silhouette default still applies.
const mlbUrl = (id, px) => mlbHeadshot(id, px)   // lib/mlbTeams.js (fix14: one URL for the face, here and on the share cards)
// STRICT (face in the dial, 2026-09-27): the same square face crop WITHOUT the
// generic-silhouette default, so a player with no photo 404s and the caller
// falls back to its own no-face look (the number in the ring) instead of
// drawing a silhouette.
export const mlbFaceStrict = (id, px) => mlbHeadshot(id, px, { strict: true })
const initials = (name) => String(name || '').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

// Per product, looked up -- never a sport ternary (CLAUDE.md).
const URL_OF = {
  mlb: ({ id, size }) => (id ? mlbUrl(id, size * 2) : null),
  nfl: ({ espnId, size }) => (espnId ? nflHeadshot(String(espnId), size, size) : null),
  nhl: () => null, // LAMP always passes the feed's own mug as `photo`
  // BUCKETS: ESPN's headshot CDN by athlete id (the same file the athlete card names)
  nba: ({ id }) => (id ? `https://a.espncdn.com/i/headshots/nba/players/full/${encodeURIComponent(id)}.png` : null),
}
// Which products ask their CDN for the pixel size as given (NFL's combiner), so the row face asks for 2x; mlb's URL doubles it itself
const RETINA_OF = { nfl: 2 }
// A product whose card face already exists keeps it (TUDDY's club tile).
const CARD_OF = {
  nfl: ({ espnId, team, name, size }) => <NflFace player={{ espn_id: espnId, team, name }} size={size} />,
}

// The tile's club colour, per product (hex from the club table).
const TINT_OF = {
  mlb: (team) => (isKnownTeam(team) ? teamColor(team) : null),
}

// THE CROP, per product (2026-10-25, Donovan: "the faces ... need to be centered more ... this can be pushed throughout the whole
// site"). ESPN's NBA headshot is a wide cut-out (600 x 436), so a round frame showed a small head with dead space around it.
// Zoomed 1.5x about a point 18% down, the whole head sits centred in the circle; picked from four crops tried side by side on
// live faces (components/openings/OpeningViz.js draws the same crop as a background). A product without a crop is unchanged.
const CROP_OF = {
  nba: { scale: 1.5, y: 18 },
}
/** The crop as img styles (transform about the pinned point), or {} for a product without one. */
export function faceCropStyle(sport) {
  const c = CROP_OF[sport]
  return c ? { transform: `scale(${c.scale})`, transformOrigin: `50% ${c.y}%` } : {}
}
/** The crop as a CSS background (size / position) for a box drawn with the face as its background. */
export function faceCropBackground(sport) {
  const c = CROP_OF[sport]
  return c ? `50% ${c.y}% / auto ${c.scale * 100}%` : 'center / cover'
}

export function faceUrl({ sport, id, espnId, photo, size = 40 }) {
  return photo || URL_OF[sport]?.({ id, espnId, size }) || null
}

export default function PlayerFace({ sport, id = null, espnId = null, photo = null, team = null, name = '', size = 40, variant = 'card', theme = null, ring = null, className = '', style = null }) {
  if ((variant === 'card' || variant === 'tile') && CARD_OF[sport]) return CARD_OF[sport]({ espnId, team, name, size })
  const src = faceUrl({ sport, id, espnId, photo, size })
  // variant 'tile' (2026-09-27, The Four like The Six): TUDDY's face look -- a
  // rounded square in the club's colour, the photo over it, the club code
  // underneath when there is no photo.
  if (variant === 'tile') {
    const tint = TINT_OF[sport]?.(team) || theme?.bg3 || 'rgba(255,255,255,.06)'
    return (
      <span aria-hidden="true" title={name || undefined} style={{
        position: 'relative', display: 'inline-grid', placeItems: 'center', flex: '0 0 auto',
        width: size, height: size, borderRadius: Math.max(7, Math.round(size * 0.26)), overflow: 'hidden',
        background: `linear-gradient(160deg, ${tint}, ${tint}66)`, border: `1px solid ${tint}88`,
        color: 'rgba(255,255,255,.85)', font: `900 ${Math.max(7, Math.round(size * 0.26))}px/1 monospace`,
      }}>
        {String(team || initials(name)).slice(0, 3).toUpperCase()}
        {src && <img src={src} alt={name || ''} width={size} height={size} loading="lazy" decoding="async"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', ...faceCropStyle(sport) }} />}
      </span>
    )
  }
  if (variant === 'table') {
    if (!src) return null
    // LAMP'S LOOK IN THE ROWS TOO (2026-09-28, Donovan: LAMP's faces are the
    // target). The silo / mug is a transparent cut-out, and this variant drew
    // it with nothing behind it, so a head and shoulders floated on the row.
    // LAMP's PlayerMark puts the page's dark circle (bg3) behind the same
    // image; every table face does now -- MOONSHOT, LAMP's board, TUDDY's.
    const crop = faceCropStyle(sport)
    // a cropped face needs a round box to zoom inside of (the img alone would grow past its circle)
    if (crop.transform) {
      return (
        <span aria-hidden="true" className={className || undefined} style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', display: 'inline-block', flex: 'none', verticalAlign: 'middle', background: theme?.bg3 || CHASSIS.bg3, ...style }}>
          <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async"
            onError={(e) => { e.currentTarget.parentElement.style.display = 'none' }}
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', ...crop }} />
        </span>
      )
    }
    return (
      // A table face that 404s disappears -- no monogram, no broken-image box.
      <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" className={className || undefined}
        onError={(e) => { e.currentTarget.style.display = 'none' }}
        style={{ width: size, height: size, borderRadius: '50%', background: theme?.bg3 || CHASSIS.bg3, objectFit: 'cover', objectPosition: 'center', flex: 'none', verticalAlign: 'middle', ...style }} />
    )
  }
  // variant 'row' (2026-10-13, PLAYER-ROWS: the name cell of every player table, components/table/PlayerNameCell.js):
  // a round headshot with a thin ring in the product's accent (`ring`), the dark circle behind a transparent cut-out,
  // and the monogram underneath: a man with no picture, or a picture that 404s, keeps his initials. Decorative
  // (alt=""): his name is text beside it. Fixed width/height, lazy, 2x for retina.
  if (variant === 'row') {
    const px = size * (RETINA_OF[sport] || 1)
    return <RowFace url={faceUrl({ sport, id, espnId, photo, size: px })} crop={faceCropStyle(sport)} name={name} size={size} ring={ring} theme={theme} className={className} style={style} />
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
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', ...faceCropStyle(sport) }} />
      )}
    </span>
  )
}

// The 'row' face (see the variant's note in PlayerFace). The monogram shows until the picture has loaded, and again if it never does
// (a cut-out is transparent: the initials must not show through a loaded face).
function RowFace({ url, crop = null, name, size, ring, theme, className, style }) {
  const [state, setState] = useState('wait')   // wait | ok | bad
  const ref = useRef(null)
  useEffect(() => { const el = ref.current; if (el?.complete && el.naturalWidth > 0) setState('ok') }, [url])
  return (
    <span aria-hidden="true" className={className || undefined} style={{
      position: 'relative', display: 'inline-grid', placeItems: 'center', flex: '0 0 auto', width: size, height: size, borderRadius: '50%', overflow: 'hidden',
      background: theme?.bg3 || CHASSIS.bg3, boxShadow: ring ? `0 0 0 1.5px ${ring}` : undefined,
      color: theme?.text2 || 'rgba(255,255,255,.7)', font: `900 ${Math.max(9, Math.round(size * 0.34))}px/1 monospace`, ...style,
    }}>
      {state === 'ok' ? null : initials(name)}
      {url && state !== 'bad' && <img ref={ref} src={url} alt="" width={size} height={size} loading="lazy" decoding="async"
        onLoad={() => setState('ok')} onError={() => setState('bad')}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', ...crop }} />}
    </span>
  )
}
