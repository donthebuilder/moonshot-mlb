'use client'
// STYLED-JSX ON THE SERVER (2026-10-05). The App Router renders client components on the
// server, but styled-jsx only reaches that HTML through a style registry (Next's own CSS-in-JS
// guide: node_modules/next/dist/docs/01-app/02-guides/css-in-js.md). Without one, every
// server-rendered page painted its <style jsx> parts unstyled until hydration -- FRANCHISE's
// league rooms showed the More drawer's text at the top of the page, then slid it away.
import { useState } from 'react'
import { useServerInsertedHTML } from 'next/navigation'
import { StyleRegistry, createStyleRegistry } from 'styled-jsx'

export default function StyledJsxRegistry({ children }) {
  // one sheet per request, created once (lazy state)
  const [registry] = useState(() => createStyleRegistry())
  useServerInsertedHTML(() => {
    const styles = registry.styles()
    registry.flush()
    return <>{styles}</>
  })
  return <StyleRegistry registry={registry}>{children}</StyleRegistry>
}
