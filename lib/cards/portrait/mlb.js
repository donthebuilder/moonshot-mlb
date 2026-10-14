// MLB PORTRAIT: img.mlbstatic.com's SILO headshot by MLBAM person id (lib/mlbTeams.js mlbHeadshot, strict form: no generic-silhouette default, so a man with no
// photo is a 404, never a silhouette). Identity: statsapi.mlb.com/api/v1/people/<id>?hydrate=currentTeam names the person and his club.
// Probed 2026-10-14 (Ohtani 660271: 200 image/png, CORS *; id 1: 404). The silo is the MLB.com cut-out, an MLB Advanced Media asset.
import { mlbHeadshot, teamCodeFromName, teamKey } from '../../mlbTeams'
const CDN = 'https://img.mlbstatic.com/mlb-photos/image/upload'
export default {
  profile: 'mlb_silo',
  provider: 'mlbstatic-silo',
  rights: {
    productionReady: false, status: 'not cleared for commercial display',
    terms: ['https://www.mlb.com/official-information/terms-of-use (read 2026-10-14, first 100k of 118k chars: "private, non-commercial use"; automated scripts barred; no reproduction or derivative works without written permission)'],
    note: 'Used today as an <img> on MOONSHOT pages. Baking it into a card the site distributes is reproduction: needs written permission from MLB / MLBAM or a licensed provider.',
  },
  // The silo (the headshot kind) is a transparent 480 px cut-out. Where the face sits in it, as a fraction of the picture (the face box the brightness check measures).
  face: { x0: 0.36, y0: 0.2, x1: 0.64, y1: 0.5 },
  // THE OTHER CLEAN PHOTOGRAPHS (Donovan 2026-10-14): every kind is fetched by the same MLBAM id, after the same id + club check, and goes through the same metadata gate.
  // Probed for Ohtani 660271, Judge 592450, Spence 828599, Rice 700250 and Pena 665161: 200 image/jpeg, the only metadata segment is JFIF (no EXIF / IPTC / XMP). They are MLB
  // photographs: TAG-FREE DOES NOT MEAN LICENSED, and MLB's terms say non-commercial.
  //   action  vertical 900 x 1350, drawn full-bleed
  //   hero    the 3:1 action hero, cropped SERVER-SIDE toward the subject (Cloudinary c_fill,g_auto) to 930 x 760 (the card's portrait zone)
  //   studio  the studio headshot "67" (opaque grey backdrop), 600 px wide
  kinds: {
    action: {
      layout: 'bleed', profile: 'mlb_action', face: { x0: 0.3, y0: 0.02, x1: 0.78, y1: 0.3 },
      plan: ({ playerId }) => (/^\d{5,7}$/.test(String(playerId)) ? { imageUrl: `${CDN}/w_900,q_auto:best/v1/people/${playerId}/action/vertical/current` } : null),
      urlOk: (url, ref) => url === `${CDN}/w_900,q_auto:best/v1/people/${encodeURIComponent(ref.playerId)}/action/vertical/current`,
    },
    hero: {
      layout: 'bleed', profile: 'mlb_hero', face: { x0: 0.3, y0: 0.0, x1: 0.8, y1: 0.45 },
      plan: ({ playerId }) => (/^\d{5,7}$/.test(String(playerId)) ? { imageUrl: `${CDN}/c_fill,g_auto,w_930,h_760,q_auto:best/v1/people/${playerId}/action/hero/current` } : null),
      urlOk: (url, ref) => url === `${CDN}/c_fill,g_auto,w_930,h_760,q_auto:best/v1/people/${encodeURIComponent(ref.playerId)}/action/hero/current`,
    },
    studio: {
      layout: 'studio', profile: 'mlb_studio', face: { x0: 0.3, y0: 0.3, x1: 0.7, y1: 0.7 },
      plan: ({ playerId }) => (/^\d{5,7}$/.test(String(playerId)) ? { imageUrl: `${CDN}/w_600,q_auto:best/v1/people/${playerId}/headshot/67/current` } : null),
      urlOk: (url, ref) => url === `${CDN}/w_600,q_auto:best/v1/people/${encodeURIComponent(ref.playerId)}/headshot/67/current`,
    },
  },
  plan: ({ playerId }) => (/^\d{5,7}$/.test(String(playerId)) ? { identityUrl: `https://statsapi.mlb.com/api/v1/people/${playerId}?hydrate=currentTeam`, imageUrl: mlbHeadshot(String(playerId), 480, { strict: true }) } : null),
  identify: async (ref, json) => {
    const p = (await json(`https://statsapi.mlb.com/api/v1/people/${ref.playerId}?hydrate=currentTeam`))?.people?.[0]
    if (!p?.id) return null
    // the club code in OUR table from the club's full name; the card's own spelling (ATH / OAK, CWS / CHW) is kept when it is the same club
    const code = teamCodeFromName(p.currentTeam?.name || '')
    return { id: p.id, name: p.fullName, team: code && teamKey(ref.team) === teamKey(code) ? ref.team : code, imageUrl: null }
  },
  urlOk: (url, ref) => url.startsWith('https://img.mlbstatic.com/mlb-photos/image/upload/') && url.endsWith(`/v1/people/${encodeURIComponent(ref.playerId)}/headshot/silo/current`) && !url.includes('d_people:generic'),
}
