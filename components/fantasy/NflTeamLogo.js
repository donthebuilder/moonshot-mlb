import { nflTones } from '../../lib/nfl/teamColors'
import { nflTeamLogo } from '../../lib/nfl/nflAssets'

// The real club logo, on the club's own colours.
//
// This is NflTeamMark's successor for Franchise, with the same props (`team`,
// `size`) so a call site swaps one import and nothing else. NflTeamMark stays
// exactly as it is: TUDDY and the NFL tabs still use it, and moving those is a
// separate decision from this one (Donovan's scope: fantasy only, for now).
//
// THE TILE UNDER THE LOGO IS NOT DECORATION. It is the fallback. `alt=""` on a
// failed <img> collapses to nothing in every current browser, so if ESPN 404s a
// code we do not know about, what is left on screen is the coloured tile with
// the abbreviation in it -- which is precisely what this component replaced.
// No client JS, no onError handler, no flash of a broken-image glyph.
export default function NflTeamLogo({ team, size = 30 }) {
  const code = String(team || 'FA').toUpperCase()
  const [primary, secondary] = nflTones(code)
  const src = nflTeamLogo(code, size)
  return (
    <span
      title={code === 'FA' ? 'Free agent' : code}
      aria-label={code}
      style={{
        position: 'relative', display: 'inline-grid', placeItems: 'center', flex: '0 0 auto',
        width: size, height: size,
        border: `1px solid ${secondary}66`,
        borderRadius: Math.max(7, Math.round(size * 0.28)),
        background: `linear-gradient(145deg,${primary}cc 0 68%,${secondary}cc 69% 100%)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,.14),0 5px 14px ${primary}33`,
        color: '#fff', textShadow: '0 1px 3px #000',
        font: `900 ${Math.max(7, Math.round(size * 0.27))}px/1 monospace`,
        letterSpacing: '-.04em', overflow: 'hidden',
      }}
    >
      {code.slice(0, 3)}
      {src && <img
        alt="" src={src} loading="lazy" decoding="async"
        width={Math.round(size * 0.74)} height={Math.round(size * 0.74)}
        style={{ position: 'absolute', inset: 0, margin: 'auto', objectFit: 'contain',
                 filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.55))' }}
      />}
    </span>
  )
}
