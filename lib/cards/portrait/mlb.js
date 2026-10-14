// MLB PORTRAIT: img.mlbstatic.com's SILO headshot by MLBAM person id (lib/mlbTeams.js mlbHeadshot, strict form: no generic-silhouette default, so a man with no
// photo is a 404, never a silhouette). Identity: statsapi.mlb.com/api/v1/people/<id>?hydrate=currentTeam names the person and his club.
// Probed 2026-10-14 (Ohtani 660271: 200 image/png, CORS *; id 1: 404). The silo is the MLB.com cut-out, an MLB Advanced Media asset.
import { mlbHeadshot, teamCodeFromName, teamKey } from '../../mlbTeams'
export default {
  profile: 'mlb_silo',
  provider: 'mlbstatic-silo',
  rights: {
    productionReady: false, status: 'not cleared for commercial display',
    terms: ['https://www.mlb.com/official-information/terms-of-use (read 2026-10-14, first 100k of 118k chars: "private, non-commercial use"; automated scripts barred; no reproduction or derivative works without written permission)'],
    note: 'Used today as an <img> on MOONSHOT pages. Baking it into a card the site distributes is reproduction: needs written permission from MLB / MLBAM or a licensed provider.',
  },
  // THE ACTION PICTURE (Donovan 2026-10-14): a vertical 900 x 1350 photograph, drawn full-bleed by the MLB collect card. Probed for Ohtani 660271 and three more players: 200 image/jpeg,
  // the only metadata segment is JFIF (no EXIF / IPTC / XMP: auditMetadata is clean). It is an MLB photograph: TAG-FREE DOES NOT MEAN LICENSED, and MLB's terms say non-commercial.
  action: {
    profile: 'mlb_action',
    plan: ({ playerId }) => (/^\d{5,7}$/.test(String(playerId)) ? { imageUrl: `https://img.mlbstatic.com/mlb-photos/image/upload/w_900,q_auto:best/v1/people/${playerId}/action/vertical/current` } : null),
    urlOk: (url, ref) => url === `https://img.mlbstatic.com/mlb-photos/image/upload/w_900,q_auto:best/v1/people/${encodeURIComponent(ref.playerId)}/action/vertical/current`,
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
