'use client'
import { SPORT_ACCENT } from '../../lib/sportAccent'

// THE LINK TILES, EVERY PRODUCT'S HOME (2026-10-22, Donovan: "this needs to be a home page"; "give them a little bit of swag").
// What used to stack on a Home is one tap away, three across, each tile in the product's accent with a ›. The page's own names come
// from its nav registry (`nav[tab].label / icon`); a tab the registry does not have is left out. links: [{ tab, sub }].
export default function HomeLinks({ sport, theme: C, nav = {}, links = [], setTab, label = 'More' }) {
  const accent = SPORT_ACCENT[sport] || C.text
  const shown = links.filter((l) => nav[l.tab])
  if (!shown.length) return null
  return (
    <section aria-label={label} className="home-links" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
      {shown.map((l) => (
        <button type="button" key={l.tab} data-tile="link" onClick={() => setTab?.(l.tab)}
          style={{ position: 'relative', overflow: 'hidden', display: 'grid', gap: 3, alignContent: 'center', minHeight: 60, padding: '9px 8px', minWidth: 0, cursor: 'pointer', textAlign: 'center', color: 'inherit', font: 'inherit',
            border: `1px solid color-mix(in srgb, ${accent} 22%, ${C.border})`, borderRadius: 12, background: `linear-gradient(160deg, color-mix(in srgb, ${accent} 9%, transparent), ${C.bg2} 65%)` }}>
          <span aria-hidden="true" style={{ position: 'absolute', right: 8, top: 6, color: accent, fontWeight: 900, fontSize: 12 }}>›</span>
          <b style={{ fontSize: 12, fontWeight: 900, color: C.text }}>{nav[l.tab].icon ? `${nav[l.tab].icon} ` : ''}{nav[l.tab].label}</b>
          <span style={{ fontSize: 11, color: C.text3 }}>{l.sub}</span>
        </button>
      ))}
      <style>{'.home-links>button{transition:border-color .15s,transform .15s}.home-links>button:hover{transform:translateY(-1px)}'}</style>
    </section>
  )
}
