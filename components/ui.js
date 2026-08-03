'use client'
import { C, NUM_FONT } from '../lib/theme'

export function btnStyle(color, active = false) {
  return {
    border: `1px solid ${active ? color + '99' : C.border}`,
    background: active ? `${color}22` : 'rgba(255,255,255,.035)',
    color: active ? color : C.text2,
    borderRadius: 999,
    padding: '7px 11px',
    fontSize: 11,
    fontWeight: 800,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }
}

export function chipStyle(color) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    border: `1px solid ${color}55`,
    background: `${color}16`,
    color,
    borderRadius: 999,
    padding: '3px 8px',
    fontSize: 10,
    fontWeight: 800,
    whiteSpace: 'nowrap',
  }
}

export function Chip({ color = C.text2, children, style }) {
  return <span style={{ ...chipStyle(color), ...style }}>{children}</span>
}

export function selectStyle() {
  return {
    background: C.bg3,
    border: `1px solid ${C.border2}`,
    color: C.text,
    borderRadius: 10,
    padding: '8px 10px',
    fontSize: 12,
    outline: 'none',
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
  }
}

export function inputStyle() {
  return {
    background: C.bg3,
    border: `1px solid ${C.border2}`,
    color: C.text,
    borderRadius: 10,
    padding: '8px 12px',
    fontSize: 12,
    outline: 'none',
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
  }
}

export function PanelTitle({ title, sub, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'end', flexWrap: 'wrap', margin: '4px 0 14px' }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ fontSize: 24, margin: '0 0 3px', fontWeight: 900, letterSpacing: '-.03em' }}>{title}</h2>
        {sub && <div style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT }}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}

export function Grid({ children, min = 260, gap = 10, style }) {
  return (
    <div
      className="dash-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`,
        gap,
        alignItems: 'stretch',
        width: '100%',
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function Stack({ children, gap = 10, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, minWidth: 0, width: '100%', ...style }}>
      {children}
    </div>
  )
}

export function Empty({ text }) {
  return (
    <div style={{ padding: 36, textAlign: 'center', background: C.bg2, border: `1px dashed ${C.border2}`, borderRadius: 18, color: C.text3 }}>
      {text}
    </div>
  )
}

export function Card({ children, color = C.border, onClick, style }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: C.bg2,
        border: `1px solid ${color}`,
        borderRadius: 14,
        padding: 12,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color .15s, transform .15s',
        boxSizing: 'border-box',
        minWidth: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
