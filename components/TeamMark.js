'use client'
import { useState } from 'react'
import { teamColor, teamName, isKnownTeam, mlbTeamLogo } from '../lib/mlbTeams'
import { nflTeamLogo } from '../lib/nfl/nflAssets'
import { nhlLogo } from '../lib/nhl/teams'
import { nflTones, NFL_TEAM_TONES } from '../lib/nfl/teamColors'
import { readableInk } from '../lib/teamInk'
import { TeamMark as LampTeamMark } from './lamp/ui'
import { sportKey } from '../lib/routes'

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
const LOGO_OF = {
  mlb: (code, px) => mlbTeamLogo(code, px * 2),
  nfl: (code, px) => nflTeamLogo(code, px),
  nhl: (code) => nhlLogo(code, true),
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
  if (!CLUBS[key]) return <LampTeamMark abbrev={code} size={size === 'md' ? 20 : 16} />
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
