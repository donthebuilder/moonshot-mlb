'use client'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { useBucketsBlowout } from '../../lib/nba/useBuckets'
import BucketsTable from './BucketsTable'
import { Kicker } from './ui'
import { FAVOURITES_SEASON, favouriteBand, fmtMl } from '../../lib/nba/favourites'

// 💨 WHO GAINS IN A BLOWOUT (2026-10-22, Donovan: "who gains minutes in a blowout (bench scorers)"). On a blowout-watch game
// (lib/blowout.js: the book has a club favoured by 10+), both rosters, each man's minutes and points in his club's lopsided finals
// against the rest, this season and last (lib/nba/blowoutRead.js). Most minutes gained first; the starters who sit sink to the
// bottom. Nothing on a game that is not a watch. Plain counts, no %.
export default function BlowoutGains({ date, gameId, onOpenPlayer, onOpenTeam }) {
  const { data } = useBucketsBlowout(date || null)
  const g = (data?.games || []).find((x) => x.id === String(gameId))
  if (!g) return null
  const band = favouriteBand(g.spread)
  const ml = fmtMl(g.favMl)
  const f1 = (v) => (v == null ? '—' : Number(v).toFixed(1))
  const sign = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}`)
  const rows = g.players.map((p) => ({ _id: p.id, ...p }))
  const cols = [
    { key: 'name', label: 'Player', group: 'Player', w: 132, heat: false, sticky: true, bold: true, link: (r) => (onOpenPlayer ? () => onOpenPlayer(r.id) : null) },
    { key: 'team', label: 'Tm', group: 'Player', w: 48, heat: false, mono: true, teamMark: 'nba', link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
    { key: 'minGain', label: '+/- MIN', group: 'Minutes', w: 62, mono: true, bold: true, fmt: sign, title: `Minutes a game in his club's ${data.margin}+ margin finals, minus the rest` },
    { key: 'blowMin', label: 'BLOWOUT', group: 'Minutes', w: 66, mono: true, fmt: f1 },
    { key: 'restMin', label: 'OTHER', group: 'Minutes', w: 56, mono: true, fmt: f1 },
    { key: 'ptsGain', label: '+/- PTS', group: 'Points', w: 62, mono: true, fmt: sign },
    { key: 'blowPts', label: 'BLOWOUT', group: 'Points', w: 66, mono: true, fmt: f1 },
    { key: 'restPts', label: 'OTHER', group: 'Points', w: 56, mono: true, fmt: f1 },
    { key: 'blowGp', label: 'GP', group: 'Games', w: 40, heat: false, mono: true, dim: true, title: `His games with a ${data.margin}+ final margin` },
  ]
  return (
    <section aria-label="Who gains in a blowout">
      <Kicker>WHO GAINS IN A BLOWOUT · {g.fav} BY {g.spread}</Kicker>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: C.text2, lineHeight: 1.45 }}>
        The book has {g.fav} by {g.spread} ({g.at}+ = blowout watch). Each man in his club’s {data.margin}+ margin finals vs the rest, <span style={{ fontFamily: NUM_FONT }}>{data.seasons.join(' + ')}</span>.
      </p>
      {band || ml ? (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: C.text2, lineHeight: 1.45 }}>
          💰 {ml ? <>Moneyline <b style={{ fontFamily: NUM_FONT, color: C.text }}>{g.fav} {ml}</b>. </> : null}
          {band ? <>Favourites this size, {FAVOURITES_SEASON}: won <b style={{ fontFamily: NUM_FONT, color: C.text }}>{band.won} of {band.games}</b>, <span style={{ fontFamily: NUM_FONT }}>{band.big}</span> by {data.margin}+.</> : null}
        </p>
      ) : null}
      {g.players.length ? <BucketsTable rows={rows} columns={cols} initialSort={{ key: 'minGain', dir: 'desc' }} heatMode="standouts" maxHeight={9999} maxRows={6}
        caption={`Most minutes gained first. ${data.minGp}+ games on each side to be listed.`} /> : null}
    </section>
  )
}
