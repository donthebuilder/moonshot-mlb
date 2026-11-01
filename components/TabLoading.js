import { C } from '../lib/theme'

// What a lazy tab shows while its code loads (2026-10-04, the JS split): the
// same placeholder MOONSHOT's Dashboard has used since its split -- holds the
// page's height so the bar and footer don't jump, says "Loading…".
// VISIBLE since 2026-10-31 (simplicity audit): the word sat off-screen, so a
// slow phone saw an empty black page for seconds and read it as broken.
export function LoadingLine() {
  return <div role="status" style={{ padding: '28px 16px', textAlign: 'center', color: C.text3, fontSize: 13 }}>Loading…</div>
}

export default function TabLoading() {
  return <div aria-busy="true" style={{ minHeight: '60vh' }}><LoadingLine /></div>
}
