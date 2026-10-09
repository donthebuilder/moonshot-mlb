'use client'
import HelpTip from '../HelpTip'
import { useSportTheme } from '../SportTheme'

// ONE SHORT LINE, THE REST ONE TAP AWAY (2026-10-08). `text` is the line; `help` is everything that used to
// be printed under it. No help -> the line alone.
export default function Brief({ text, help = null, label = 'About this', style }) {
  const { C, NUM_FONT } = useSportTheme()
  if (!text) return null
  return (
    <span style={{ fontSize: 12, color: C.text3, fontFamily: NUM_FONT, lineHeight: 1.4, ...style }}>
      {text}{help ? <HelpTip label={label} text={help} /> : null}
    </span>
  )
}
