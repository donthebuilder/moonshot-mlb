// What a lazy tab shows while its code loads (2026-10-04, the JS split): the
// same placeholder MOONSHOT's Dashboard has used since its split -- holds the
// page's height so the bar and footer don't jump, says "Loading…" to readers.
export default function TabLoading() {
  return <div aria-busy="true" style={{ minHeight: '60vh' }}><span style={{ position: 'absolute', left: -9999 }}>Loading…</span></div>
}
