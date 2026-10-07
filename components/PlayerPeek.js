'use client'
import CardShell from './CardShell'

// THE PLAYER PEEK (2026-10-03, Donovan: "I don't like that LAMP doesn't have a
// player modal like the other sites"). A player tapped anywhere on LAMP or
// BUCKETS opens over the page you are on, in MOONSHOT's modal FRAME (CardShell:
// focus kept inside, Escape, above the bottom bar, the sport's theme).
// WHAT IS INSIDE IS NOT A CARD (2026-10-06 audit): `Page` is the product's full
// player PAGE (lamp/tabs/Player.js, buckets/tabs/Player.js -- one scroll, no pill
// tabs, no prev/next) mounted a second time with onBack={null}, so the page and
// the peek can never drift but the peek is only as much of a card as the page is.
// MOONSHOT's PlayerModal and TUDDY's NflPlayerModal are real cards (tabs, the
// navigator, view= in the address) and do not go through here; the parity grid
// (lib/parity.js, player.*) tracks what LAMP and BUCKETS still lack.
// The address carries `pm=<id>` (lib/useShellRoute peekPlayer), so Back closes
// it and a shared link opens it; "Full page" is the player page proper.
export default function PlayerPeek({ id, Page, theme: C, accent, onClose, onFullPage, onOpenTeam, onOpenGame }) {
  if (!id) return null
  // a team / game opened from the card is a move: the router drops the card
  // (openDetail clears pm) and Back returns to the page with the card open
  const btn = { minHeight: 44, padding: '0 14px', borderRadius: 10, border: `1px solid ${C.border2}`, background: C.bg, color: C.text2, font: '800 12px/1 system-ui, -apple-system, sans-serif', cursor: 'pointer' }
  return (
    <CardShell onClose={onClose} width={980} label="Player card" theme={C} accent={accent}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 6 }}>
        <button type="button" onClick={() => onFullPage(id)} style={{ ...btn, color: accent || C.text }}>Full page ›</button>
        <button type="button" onClick={onClose} aria-label="Close" style={{ ...btn, width: 44, padding: 0, fontSize: 20 }}>×</button>
      </div>
      <Page id={id} onBack={null} onOpenTeam={onOpenTeam} onOpenGame={onOpenGame} />
    </CardShell>
  )
}
