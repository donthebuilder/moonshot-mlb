'use client'
import CardShell from './CardShell'

// THE PLAYER PEEK (2026-10-03, Donovan: "I don't like that LAMP doesn't have a
// player modal like the other sites"). A player tapped anywhere on LAMP or
// BUCKETS opens his card OVER the page you are on, the way MOONSHOT and TUDDY
// do -- built from what already exists, not a new card: MOONSHOT's modal frame
// (CardShell: focus kept inside, Escape, above the bottom bar, the sport's
// theme) around the product's own player page (`Page`, rendered in place).
// The address carries `pm=<id>` (lib/useShellRoute peekPlayer), so Back closes
// it and a shared link opens it; "Full page" is the player page proper.
export default function PlayerPeek({ id, Page, theme: C, accent, onClose, onFullPage, onOpenTeam, onOpenGame, onStep = null }) {
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
      <Page id={id} onBack={null} onOpenTeam={onOpenTeam} onOpenGame={onOpenGame} onStep={onStep} peek />
    </CardShell>
  )
}
