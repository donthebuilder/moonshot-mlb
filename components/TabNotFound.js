'use client'
import { C as MLB_C, NUM_FONT } from '../lib/theme'

// THE IN-APP 404 (2026-09-02, findings 2/3/15/16).
//
// app/not-found.js already says "That page isn't on the board" properly, with
// four real doors out -- but it only fires for a bad PATH. A bad `#tab=` never
// reaches the server, so until now MOONSHOT rendered an empty div for one and
// TUDDY silently rewrote the address to Home. This is that same answer, in the
// shell, for the address bar the app actually routes on.
//
// It names what was typed. Somebody who shared #tab=results on TUDDY needs to
// see that the word exists on the other product, not just that they are lost.
export default function TabNotFound({ asked, sport = 'mlb', onNavigate, doors = [], palette = null }) {
  // TUDDY has its own palette (lib/nfl/theme); it passes it in so this panel
  // never renders MOONSHOT's orange inside the NFL shell.
  const C = palette || MLB_C
  const other = sport === 'nfl' ? 'mlb' : 'nfl'
  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 16, background: C.bg2,
      padding: '28px 22px', textAlign: 'center', margin: '10px 0 18px',
    }}>
      <p style={{ margin: 0, color: C.orange, font: `900 9px/1 ${NUM_FONT}`, letterSpacing: '.18em' }}>
        {sport === 'nfl' ? 'TUDDY' : 'MOONSHOT'} · NO SUCH TAB
      </p>
      <h2 style={{ margin: '12px 0 8px', fontSize: 22, letterSpacing: '-.02em', color: C.text }}>
        That page isn&apos;t on the board.
      </h2>
      <p style={{ margin: '0 auto', maxWidth: 420, color: C.text3, fontSize: 12.5, lineHeight: 1.6 }}>
        {asked
          ? <>Nothing here is called <b style={{ color: C.text2, fontFamily: NUM_FONT }}>{asked}</b>. It may be a
            page on the other side of the network, or the address may have changed.</>
          : <>That address doesn&apos;t match a page here.</>}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 20 }}>
        {doors.map(([key, label]) => (
          <button key={key} type="button" onClick={() => onNavigate?.(key)} style={doorStyle(C)}>{label}</button>
        ))}
        <a href={`#sport=${other}&tab=home`} style={{ ...doorStyle(C), textDecoration: 'none' }}>
          {other === 'nfl' ? '🏈 TUDDY · NFL' : '⚾ MOONSHOT · MLB'}
        </a>
      </div>
    </div>
  )
}

// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const doorStyle = (C = MLB_C) => ({
  display: 'inline-block', padding: '9px 14px', cursor: 'pointer',
  border: `1px solid ${C.border2}`, borderRadius: 10, background: C.bg3,
  color: C.text, font: `800 10.5px/1 ${NUM_FONT}`, letterSpacing: '.06em',
})
