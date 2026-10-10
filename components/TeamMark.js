'use client'
import { useState } from 'react'
import { teamColor, teamName, isKnownTeam, mlbTeamLogo } from '../lib/mlbTeams'
import { nflTeamLogo } from '../lib/nfl/nflAssets'
import { nhlLogo } from '../lib/nhl/teams'
import { nbaLogo, nbaTeam } from '../lib/nba/teams'
import { nflTones, NFL_TEAM_TONES } from '../lib/nfl/teamColors'
import { readableInk } from '../lib/teamInk'
import { TeamMark as LampTeamMark } from './lamp/ui'
import { sportKey } from '../lib/routes'
import { NUM_FONT } from '../lib/theme'

// ONE TEAM MARK, EVERY SPORT (2026-09-29, queue batch 5). The club-code chip
// MOONSHOT and TUDDY each drew from their own copy (MlbTeamMark, NflTeamMark --
// same shape, same numbers) is one component, with the club table looked up
// per sport; LAMP keeps the league's own logo + code (components/lamp/ui
// TeamMark), which already reads on the dark page. The chip's tint and border
// are the club's colour (identity); its TEXT is readableInk() -- the first of
// the club's two colours that clears AA on the page, else the primary lifted
// toward white -- so NE / PIT / BAL / CLE / IND / TEN / HOU / LV stop
// vanishing. That applies to both tables (MOONSHOT's since 2026-09-29: 13 of its reds sat
// under AA). The old MlbTeamMark / NflTeamMark are wrappers of this.
const CLUBS = {
  // MOONSHOT's table is hand-curated (lib/mlbTeams.js picks readable club
  // colours itself), so its ink is its own colour -- MOONSHOT's chips unchanged.
  // 2026-09-29 (Donovan: "do all the other stuff"): 13 of MOONSHOT's reds sat
  // under AA as text, so its ink goes through readableInk too -- the club
  // colour stays as the chip's tint and border; only a colour that fails AA on
  // the page is lifted toward white for the letters.
  mlb: (code) => { const col = teamColor(code); return { col, ink: readableInk(col), known: isKnownTeam(code), name: teamName(code) } },
  nfl: (code) => {
    const [col, alt] = nflTones(code)
    const known = Object.prototype.hasOwnProperty.call(NFL_TEAM_TONES, code) && code !== 'FA'
    return { col, ink: known ? readableInk(col, alt) : col, known, name: null }
  },
}

// THE LOGO (2026-10-01, BATCH-TABLE-SKIN-V2 decision A): variant="logo" draws
// the club's own logo (the league's / ESPN's CDN, lazy) with the code as its
// title and accessible name, no bordered chip. A logo that fails to load (an
// unknown code, the CDN down) falls back to the chip below -- never a blank.
// the chip for a sport without CLUBS colours (LAMP's mark, logo then code)
const CHIP_OF = { nhl: (code, size) => <LampTeamMark abbrev={code} size={size === 'md' ? 20 : 16} /> }
const LOGO_OF = {
  mlb: (code, px) => mlbTeamLogo(code, px * 2),
  nfl: (code, px) => nflTeamLogo(code, px),
  nhl: (code) => nhlLogo(code, true),
  nba: (code) => nbaLogo(code, true),
}

export default function TeamMark({ sport = 'mlb', abbr, size = 'sm', dim = false, style, variant = 'chip', px = 18 }) {
  const key = sportKey(sport)
  const code = String(abbr || '').trim().toUpperCase()
  const [broken, setBroken] = useState(false)
  if (!code) return null
  const src = variant === 'logo' && !broken ? LOGO_OF[key]?.(code, px) : null
  if (src) {
    return (
      <img src={src} alt={code} title={code} width={px} height={px} loading="lazy" decoding="async"
        onError={() => setBroken(true)}
        style={{ width: px, height: px, objectFit: 'contain', verticalAlign: 'middle', flexShrink: 0, opacity: dim ? 0.55 : 1, ...style }} />
    )
  }
  // a broken NHL logo: the code in a quiet box, never lamp/ui's logo-plus-code (a second broken image)
  if (!CLUBS[key] && variant === 'logo') {
    return (
      <span title={code} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: px, height: px, padding: '0 3px', borderRadius: 4, border: '1px solid rgba(255,255,255,.14)', fontFamily: NUM_FONT, fontSize: Math.max(8, px * 0.5), fontWeight: 900, flexShrink: 0, opacity: dim ? 0.55 : 1, ...style }}>{code}</span>
    )
  }
  // a sport with no club-colour chip: LAMP's own logo-plus-code, else (BUCKETS) its logo
  if (!CLUBS[key]) return CHIP_OF[key] ? CHIP_OF[key](code, size) : <TeamMark sport={key} abbr={code} variant="logo" px={size === 'md' ? 20 : 16} dim={dim} style={style} />
  const { col, ink, known, name } = CLUBS[key](code)
  const big = size === 'md'
  return (
    <span
      title={name ? `${name} (${code})` : code}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: big ? 34 : 28, height: big ? 20 : 17, padding: '0 5px',
        borderRadius: 5, flexShrink: 0,
        border: `1px solid ${known ? `${ink}66` : 'rgba(255,255,255,.14)'}`,
        background: known ? `${col}1f` : 'rgba(255,255,255,.05)',
        color: ink,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: big ? 10.5 : 9.5, fontWeight: 900, letterSpacing: '.02em',
        opacity: dim ? 0.55 : 1,
        ...style,
      }}
    >{code}</span>
  )
}

/** A GAME AS LOGOS (2026-10-02, Donovan: logos site-wide): away · @ · home, the
 *  codes in the title -- the one way a matchup is drawn on a game surface. */
export function MatchLogos({ sport = 'mlb', away, home, px = 16, sep = '@', gap = 4, dim = false, style }) {
  return (
    <span title={`${away || '—'} ${sep} ${home || '—'}`} style={{ display: 'inline-flex', alignItems: 'center', gap, verticalAlign: 'middle', ...style }}>
      <TeamMark sport={sport} abbr={away} variant="logo" px={px} dim={dim} />
      <span aria-hidden="true" style={{ opacity: 0.5, fontWeight: 400 }}>{sep}</span>
      <TeamMark sport={sport} abbr={home} variant="logo" px={px} dim={dim} />
    </span>
  )
}

/** A value that is exactly a game ("3.  PHI @ ATL", "DET @ CAR") or a club ("NYY") drawn as
 *  logos, its text riding the title; anything else comes back unchanged. One rule for the
 *  ticker pills, the projected rows and the rest (Donovan 10-02, logos site-wide). */
// A 4-letter code is a club only where the sport has one (BUCKETS' UTAH) --
// never a word like LIVE or PUSH on the other products.
const KNOWN4 = { nba: (c) => Boolean(nbaTeam(c)) }
const isCode = (sport, c) => c.length <= 3 || Boolean(KNOWN4[sportKey(sport)]?.(c))
/** A value that is exactly a game, as its parts, or null: "IND 21 – 17 CHI" -> { away, home, score: ['21','17'] },
 *  "DET @ CAR" -> { away, home, score: null }. The ticker's game chip (components/TickerPill game mode) reads this. */
export function gameParts(sport, value) {
  if (!sport || typeof value !== 'string') return null
  const g = value.match(/^([A-Z]{2,4})\s?@\s?([A-Z]{2,4})$/)
  if (g && isCode(sport, g[1]) && isCode(sport, g[2])) return { away: g[1], home: g[2], score: null }
  const sc = value.match(/^([A-Z]{2,4}) (\d+) [–-] (\d+) ([A-Z]{2,4})$/)
  if (sc && isCode(sport, sc[1]) && isCode(sport, sc[4])) return { away: sc[1], home: sc[4], score: [sc[2], sc[3]] }
  return null
}

export function asLogos(sport, value, { px = 14, rank = true } = {}) {
  if (!sport || typeof value !== 'string') return value
  const g = value.match(/^(\d+\.\s+)?([A-Z]{2,4})\s?@\s?([A-Z]{2,4})$/)
  if (g && isCode(sport, g[2]) && isCode(sport, g[3])) {
    return (
      <span title={value} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
        {rank && g[1] ? <span>{g[1].trim()}</span> : null}
        <MatchLogos sport={sport} away={g[2]} home={g[3]} px={px} gap={3} />
      </span>
    )
  }
  // a score line, "IND 21 – 17 CHI": logo, score, logo
  const sc = value.match(/^([A-Z]{2,4}) (\d+) [–-] (\d+) ([A-Z]{2,4})$/)
  if (sc && isCode(sport, sc[1]) && isCode(sport, sc[4])) {
    return (
      <span title={value} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
        <TeamMark sport={sport} abbr={sc[1]} variant="logo" px={px} /><span>{sc[2]}–{sc[3]}</span><TeamMark sport={sport} abbr={sc[4]} variant="logo" px={px} />
      </span>
    )
  }
  if (/^[A-Z]{2,4}$/.test(value) && isCode(sport, value)) return <TeamMark sport={sport} abbr={value} variant="logo" px={px} />
  return rank ? value : value.replace(/^\d+\.\s+/, '')
}
