// THE SERVER-SAFE PLAYER NAME CELL (2026-10-15). components/table/PlayerNameCell.js is a client component that measures text
// in a canvas; /nhl/goalies is server-rendered markup (hand-built tables, no DenseTable), so it gets the same LOOK without the
// measuring: the round headshot with a thin accent ring (monogram under it), the name (two lines at most), the second line
// (club code, number), and a row that is ONE height: 58px on a phone, 52px on a desktop, the DenseTable player-row heights.
// The name and the club are plain links wearing the site's .tap-link class (app/globals.css: a 44px invisible hit box on touch). No hooks, no handlers: a face that
// 404s keeps its monogram (the picture paints its own circle only once it has loaded).
import { C, NUM_FONT } from '../../lib/nhl/theme'

const SPC_CSS = `
  .spc-row > td { height: 52px; vertical-align: middle; }
  .spc { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .spc-face { position: relative; flex: none; display: inline-grid; place-items: center; margin: 2px; width: 40px; height: 40px; border-radius: 50%; overflow: hidden; background: ${C.bg3}; box-shadow: 0 0 0 1.5px ${C.ice}8c; color: ${C.text2}; font: 900 13px/1 ${NUM_FONT}; }
  .spc-face img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background: ${C.bg3}; }
  .spc-body { display: flex; flex-direction: column; justify-content: center; gap: 3px; min-width: 0; flex: 1 1 auto; }
  .spc-name { display: block; color: ${C.text}; text-decoration: none; font-weight: 600; font-size: 13px; line-height: 1.12; min-height: 0; padding: 0; }
  .spc-nm { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; }
  .spc-sub { display: flex; align-items: center; gap: 6px; font: 800 10px/1.3 ${NUM_FONT}; letter-spacing: .04em; color: ${C.text3}; white-space: nowrap; }
  .spc-sub a { color: ${C.text3}; text-decoration: none; }
  @media (max-width: 640px) {
    .spc-row > td { height: 58px; }
    .spc { gap: 7px; }
    .spc-face { width: 36px; height: 36px; font-size: 12px; }
    .spc-name { font-size: 12px; }
  }
`
const initials = (name) => String(name || '').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

/** @param {{ name:string, href:string, photo?:string|null, team?:string, teamHref?:string|null, number?:string|number|null }} p */
export default function StaticPlayerCell({ name, href, photo = null, team = '', teamHref = null, number = null, extra = '' }) {
  return (
    <span className="spc">
      {/* React 19 hoists a style with href + precedence into the head once, however many cells there are */}
      <style href="spc-cell" precedence="default">{SPC_CSS}</style>
      <span className="spc-face" aria-hidden="true">
        {initials(name)}
        {photo ? <img src={photo} alt="" width={40} height={40} loading="lazy" decoding="async" /> : null}
      </span>
      <span className="spc-body">
        <a className="tap-link spc-name" href={href}><span className="spc-nm">{name}</span></a>
        {team || extra || (number != null && number !== '') ? (
          <span className="spc-sub">
            {team ? (teamHref ? <a className="tap-link" href={teamHref}>{team}</a> : <span>{team}</span>) : null}
            {extra ? <span>{extra}</span> : null}
            {number != null && number !== '' ? <span>#{number}</span> : null}
          </span>
        ) : null}
      </span>
    </span>
  )
}
