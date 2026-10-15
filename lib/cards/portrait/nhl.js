// NHL PORTRAIT: the league's player landing (api-web.nhle.com/v1/player/<id>/landing) names the player's id, current club and his mug URL; the mug is on
// assets.nhle.com/mugs/nhl/<season>/<TEAM>/<id>.png (336x336 transparent PNG, probed 2026-10-14).
//   LESSON (probed): the CDN answers 200 for ANY club folder an id was ever in, so the OTT file of a man now on FLA is a real but STALE photo (different jersey).
//   So the URL is never guessed from the card's club: it is the one the league's own landing names, and its club folder must equal the card's club.
//   An id the CDN does not know answers 302 to default-skater.png: resolvePortrait refuses redirects, so that can never be drawn as him.
//   NOT USED: the landing's heroImage (assets.nhle.com/mugs/actionshots/...jpg) carries a Getty Images copyright in its EXIF: a licence blocker.
export default {
  profile: 'nhl_mug',
  provider: 'nhl-assets-mugs',
  face: { x0: 0.36, y0: 0.24, x1: 0.64, y1: 0.52 },   // the face inside the 336 px mug, as a fraction of the picture
  rights: {
    productionReady: false, status: 'not cleared for commercial display',
    terms: ['https://www.nhl.com/info/terms-of-service (read 2026-10-14: content is for "non-commercial, informational, personal use"; automated scraping barred; NHL marks need written consent)'],
    note: 'The site already hotlinks these mugs on LAMP pages. A collectible card is a product shown with the DASH brand: get written permission from NHL Enterprises (or a licensed image provider) before cards go public.',
  },
  plan: ({ playerId }) => (/^\d{7}$/.test(String(playerId)) ? { identityUrl: `https://api-web.nhle.com/v1/player/${playerId}/landing` } : null),
  identify: async (ref, json) => {
    const l = await json(`https://api-web.nhle.com/v1/player/${ref.playerId}/landing`)
    if (!l?.playerId) return null
    return { id: l.playerId, name: `${l.firstName?.default || ''} ${l.lastName?.default || ''}`.trim(), team: l.currentTeamAbbrev, imageUrl: l.headshot || null }
  },
  urlOk: (url, ref) => {
    const m = /^https:\/\/assets\.nhle\.com\/mugs\/nhl\/(\d{8})\/([A-Z]{2,3})\/(\d{7})\.png$/.exec(url)
    return Boolean(m) && m[3] === String(ref.playerId) && m[2] === String(ref.team).toUpperCase()
  },
}
