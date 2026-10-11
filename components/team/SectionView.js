'use client'
import { bindColumns } from './kinds'

// ONE SECTION, DRAWN (2026-10-10). A section is { window, state, blocks } (lib/team/contract.js); this draws it with
// the sport's own table, empty state and kicker, passed in as `ui`. Blocks are tables first; a note is one quiet line.
// Nothing here knows a sport. A table block previews `maxRows` rows ("+N more" is the table's own).
export default function SectionView({ section, ui, nav, theme }) {
  const { C, NUM_FONT } = theme
  const { Table, EmptyState, Kicker, Weak, Slots } = ui
  if (section.state !== 'ok') return <EmptyState title={section.empty?.title || 'NO DATA'} note={section.empty?.note || null} />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        {section.window && <span style={{ color: C.text3, font: `800 9px/1.4 ${NUM_FONT}`, letterSpacing: '.08em', textTransform: 'uppercase' }}>{section.window}</span>}
        {section.status && <span style={{ color: C.text2, font: `800 9px/1.4 ${NUM_FONT}`, letterSpacing: '.08em', textTransform: 'uppercase' }}>{section.status}</span>}
      </div>
      {section.blocks.map((b, i) => {
        if (b.type === 'note') return <p key={i} style={{ margin: 0, color: C.text3, fontSize: 12, lineHeight: 1.5, maxWidth: 720 }}>{b.text}</p>
        if (b.type === 'weak') return Weak ? <Weak key={b.game?.id || i} game={b.game} sides={b.sides} label={b.label} onOpenPlayer={nav.onOpenPlayer} /> : null
        if (b.type === 'slot') { const Slot = Slots?.[b.slot]; return Slot ? <Slot key={b.slot} {...(b.props || {})} /> : null }
        if (b.type !== 'table') return null
        const open = b.rowOpen === 'game' ? (r) => nav.onOpenGame?.(r.gameId) : b.rowOpen === 'player' ? (r) => nav.onOpenPlayer?.(r[b.playerKey || 'id']) : null
        const handler = open && ((b.rowOpen === 'game' && nav.onOpenGame) || (b.rowOpen === 'player' && nav.onOpenPlayer)) ? open : undefined
        return (
          <div key={b.id || i}>
            {b.title && <Kicker>{String(b.title).toUpperCase()}</Kicker>}
            <Table rows={b.rows} columns={bindColumns(b.columns, nav)} maxHeight={9999} maxRows={b.maxRows ?? 10} heatMode={b.heat || 'sorted'}
              {...(b.initialSort ? { initialSort: b.initialSort } : {})}
              {...(b.bareTable ? { bare: true, noGroups: true, tight: true } : {})}
              {...(b.statusKey ? { statusOf: (r) => r[b.statusKey] || null } : {})}
              onRowClick={handler ? (r) => { if (!r.noOpen) handler(r) } : undefined} caption={b.caption} />
          </div>
        )
      })}
    </div>
  )
}
