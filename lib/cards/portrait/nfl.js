// NFL PORTRAIT: ESPN's headshot CDN, keyed on ESPN's own athlete id. The site stores the nflverse GSIS id, so the id is bridged through lib/nfl/headshotIds.js (a
// generated table: it can be stale for rookies). Identity is therefore checked at ESPN: site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/<espnId>
// must name the same man (last name) on the same club. Probed 2026-10-14: Mahomes 3139477 -> KC, headshot 200 image/png 230 KB.
//   LESSON (probed): ESPN athlete id 1 is a real, retired athlete (Dan Marino) with NO club and a 404 picture: a wrong bridge entry would not fail loudly, so the
//   club and name checks are what stop a bridge error from drawing the wrong man.
import { headshotIdFor } from '../../nfl/headshotIds'
import { cdnTeamCode } from '../../nfl/nflAssets'
export default {
  profile: 'espn_nfl',
  provider: 'espn-cdn-headshots',
  face: { x0: 0.4, y0: 0.14, x1: 0.62, y1: 0.46 },   // the face inside the 600 x 436 headshot, as a fraction of the picture
  rights: {
    productionReady: false, status: 'not cleared (terms bar commercial use and automated access)',
    terms: ['https://disneytermsofuse.com/english/ (read 2026-10-14: Disney Products are "for your personal, noncommercial use only"; no commercial use; no robot / script / scraping; no derivative works)'],
    note: 'The site hotlinks ESPN images for TUDDY and Franchise. Putting an ESPN photo in a distributed collectible is commercial reproduction: not cleared. Needs a licence (a licensed provider, or the league / club).',
  },
  plan: ({ playerId }) => {
    const espn = headshotIdFor(String(playerId))
    return espn ? { espnId: espn, identityUrl: `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${espn}`, imageUrl: `https://a.espncdn.com/i/headshots/nfl/players/full/${espn}.png` } : null
  },
  identify: async (ref, json) => {
    const espn = headshotIdFor(String(ref.playerId))
    const a = (await json(`https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${espn}`))?.athlete
    if (!a?.id || String(a.id) !== String(espn)) return null
    // ESPN agrees the athlete is `espn`; its club is spelled in ESPN's codes (WSH for WAS): keep the card's spelling when it is the same club
    const sameClub = a.team?.abbreviation && cdnTeamCode(a.team.abbreviation) === cdnTeamCode(ref.team)
    return { id: ref.playerId, name: a.fullName, team: sameClub ? ref.team : a.team?.abbreviation || '', imageUrl: a.headshot?.href || null }
  },
  urlOk: (url, ref) => { const espn = headshotIdFor(String(ref.playerId)); return Boolean(espn) && url === `https://a.espncdn.com/i/headshots/nfl/players/full/${espn}.png` },
}
