'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, teamOf, playerId } from '../lib/player'

export default function Slip({ slip, setSlip }) {
  const [open, setOpen] = useState(false)
  if (!slip.length) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 80,
        background: C.bg2,
        border: `1px solid ${C.border2}`,
        borderRadius: 14,
        boxShadow: '0 8px 28px rgba(0,0,0,.6)',
        width: open ? 320 : 'auto',
        maxWidth: 'calc(100vw - 32px)',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          color: C.text,
          padding: '12px 14px',
          fontSize: 12,
          fontWeight: 800,
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <span>Slip · {slip.length}</span>
        <span style={{ color: C.text3, fontSize: 10 }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 12px 12px', maxHeight: 320, overflowY: 'auto' }}>
          {slip.map((x, i) => (
            <div
              key={`${playerId(x.p)}-${x.bet}-${i}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                padding: '8px 0',
                borderTop: i ? `1px solid ${C.border}` : 'none',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {nameOf(x.p)}
                </div>
                <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
                  {teamOf(x.p)} · {x.bet}
                </div>
              </div>
              <button
                onClick={() => setSlip((s) => s.filter((_, j) => j !== i))}
                style={{ background: 'transparent', border: 'none', color: C.text3, cursor: 'pointer', fontSize: 14 }}
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={() => setSlip([])}
            style={{
              marginTop: 8,
              width: '100%',
              background: 'transparent',
              border: `1px solid ${C.border2}`,
              color: C.text3,
              borderRadius: 8,
              padding: '7px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Clear slip
          </button>
        </div>
      )}
    </div>
  )
}
