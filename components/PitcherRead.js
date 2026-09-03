'use client'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean } from '../lib/player'
import { hr9Color, isLeaky, isWall } from '../lib/hr9'

// 🧭 THE READ, for the arm (2026-08-15, Donovan: "upgrade that pitcher modal
// all the way around"). Same treatment the batter modal just got: the story
// in sentences above the evidence, every line synthesized from fields the
// modal already has in hand (src()/rows — zero new fetches). The batter read
// argues about one bat; this one argues about one arm and the nine bats
// pointed at him — so its lines are the line, the leak, the trend, the side
// he's soft against (counted against TONIGHT's actual lineup), the bats to
// worry about, and the K prop, which Donovan plays as the pitcher's own
// market ("Ks are the exception for pitchers").

function Line({ icon, children }) {
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 11,
      lineHeight: 1.55, padding: '3px 0', color: C.text2,
    }}>
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  )
}

const B = ({ col = C.text, children }) => <b style={{ fontFamily: NUM_FONT, color: col }}>{children}</b>
// HOT / COLD used to be module-level constants holding C.orange and a
// hardcoded '#60a5fa'. Both were captured at import, before applyTheme has
// swapped the palette (lib/theme.js), so light mode kept the ember accents
// and the hardcoded blue never followed the theme at all. Read the tokens
// where they are used instead -- C.blue IS that blue in ember.
//   HOT  = C.orange   good for the bats facing him
//   COLD = C.blue     his strength -- same code the tiles use

export default function PitcherRead({ name, throws, stats, lineup }) {
  const { era, whip, hr9, k9, fbAllowed, hhAllowed, brlAllowed, l3hr9, l3n, weakSide, venue, parkHr } = stats || {}

  const bats = (lineup || []).map((b) => ({
    name: clean(b?.name, ''),
    bats: clean(b?.bats ?? b?.raw?.bats, ''),
    hr: n(b?.raw?.hr_score, 0),
    edge: n(b?.raw?.pitch_type_match_score, 0) > 0,
  }))
  const nBats = bats.length
  const top = [...bats].sort((a, b) => b.hr - a.hr).slice(0, 2).filter((b) => b.name)
  const edges = bats.filter((b) => b.edge).length

  // Which of tonight's bats actually stand on his weak side. Switch hitters
  // (S) take the platoon side against his hand, which IS the weak-side stand
  // when his weakness matches it — counted as such, said plainly in the line.
  const sideChar = weakSide === 'LHB' ? 'L' : weakSide === 'RHB' ? 'R' : null
  const onSide = sideChar
    ? bats.filter((b) => b.bats === sideChar || b.bats === 'S').length
    : 0

  const lines = []

  // ── the line ─────────────────────────────────────────────────────────────
  if (era != null || whip != null) {
    const traffic = whip == null ? null
      : whip >= 1.4 ? { t: 'the bases stay crowded — RBI chances ride with every knock', col: C.orange }
      : whip <= 1.1 ? { t: 'he keeps the bases quiet', col: C.blue }
      : null
    lines.push(
      <Line key="line" icon="🥎">
        <b style={{ color: C.text }}>The line:</b> a {throws ? `${throws}HP` : 'starter'} carrying
        {era != null && <> a <B col={era >= 5 ? C.orange : era <= 3.2 ? C.blue : C.text}>{era.toFixed(2)} ERA</B></>}
        {era != null && whip != null && <> on</>}
        {whip != null && <> a <B col={whip >= 1.4 ? C.orange : whip <= 1.1 ? C.blue : C.text}>{whip.toFixed(2)} WHIP</B></>}
        {traffic && <> — <b style={{ color: traffic.col }}>{traffic.t}</b></>}.
      </Line>
    )
  }

  // ── the leak ─────────────────────────────────────────────────────────────
  if (hr9 != null || brlAllowed != null || hhAllowed != null) {
    // The barrel terms stay -- they are what make this read richer than a
    // colour. Only the HR/9 cut moved onto the shared line.
    const leaky = isLeaky(hr9) || (brlAllowed != null && brlAllowed >= 0.09)
    const wall = isWall(hr9) && (brlAllowed == null || brlAllowed <= 0.06)
    lines.push(
      <Line key="leak" icon={leaky ? '💣' : wall ? '🧱' : '⚾'}>
        <b style={{ color: C.text }}>The leak:</b>{' '}
        {hr9 != null && <>gives up <B col={hr9Color(hr9)}>{hr9.toFixed(2)} HR/9</B></>}
        {hr9 != null && (brlAllowed != null || hhAllowed != null || fbAllowed != null) && <>, with </>}
        {brlAllowed != null && <>barrels at <B col={brlAllowed >= 0.09 ? C.orange : brlAllowed <= 0.05 ? C.blue : C.text}>{(100 * brlAllowed).toFixed(1)}%</B></>}
        {brlAllowed != null && hhAllowed != null && <> and </>}
        {hhAllowed != null && <>hard contact at <B col={hhAllowed >= 0.42 ? C.orange : hhAllowed <= 0.33 ? C.blue : C.text}>{(100 * hhAllowed).toFixed(0)}%</B></>}
        {fbAllowed != null && <> on a <B col={fbAllowed >= 0.42 ? C.orange : fbAllowed <= 0.32 ? C.blue : C.text}>{(100 * fbAllowed).toFixed(0)}%</B> fly-ball diet</>}
        {leaky ? <> — <b style={{ color: C.orange }}>a live power window</b></> : wall ? <> — <b style={{ color: C.blue }}>a wall; power picks need another reason</b></> : null}.
      </Line>
    )
  }

  // ── the trend ────────────────────────────────────────────────────────────
  if (l3n > 0 && l3hr9 != null && hr9 != null) {
    const d = l3hr9 - hr9
    lines.push(
      <Line key="trend" icon={d >= 0.4 ? '📈' : d <= -0.4 ? '📉' : '➖'}>
        <b style={{ color: C.text }}>The trend:</b> his last <B>{l3n}</B> start{l3n === 1 ? '' : 's'} run{' '}
        <B col={d >= 0.4 ? C.orange : d <= -0.4 ? C.blue : C.text}>{l3hr9.toFixed(2)} HR/9</B> against his{' '}
        <B>{hr9.toFixed(2)}</B> season —{' '}
        {d >= 0.4 ? <b style={{ color: C.orange }}>getting hit lately</b>
          : d <= -0.4 ? <b style={{ color: C.blue }}>tighter than his season line lately</b>
          : <>about his norm</>}.
        <span style={{ color: C.text3 }}> Three starts is a direction, not a rate.</span>
      </Line>
    )
  }

  // ── the side ─────────────────────────────────────────────────────────────
  if (weakSide && nBats > 0) {
    lines.push(
      <Line key="side" icon="🎯">
        <b style={{ color: C.text }}>The side:</b> he is weakest against <b style={{ color: C.orange }}>{weakSide}</b>
        {sideChar && <> — <B col={onSide >= 4 ? C.orange : C.text}>{onSide}</B> of tonight&apos;s <B>{nBats}</B> tracked
          bats stand there (switch hitters counted — they take his weak side by choice)</>}.
      </Line>
    )
  }

  // ── the threats ──────────────────────────────────────────────────────────
  if (top.length) {
    lines.push(
      <Line key="threat" icon="⚔️">
        <b style={{ color: C.text }}>The threats:</b> {top.map((b, i) => (
          <span key={b.name}>{i > 0 && ' and '}<b style={{ color: C.text }}>{b.name}</b> <B col={b.hr >= 70 ? C.orange : C.text}>{b.hr.toFixed(0)}</B></span>
        ))} lead the board against him
        {edges > 0 && <>, and <B col={edges >= 3 ? C.orange : C.text}>{edges}</B> {edges === 1 ? 'bat carries' : 'bats carry'} the
          pitch-type edge against his mix</>}.
      </Line>
    )
  }

  // ── the K prop — the pitcher's own market ────────────────────────────────
  if (k9 != null) {
    lines.push(
      <Line key="k" icon="🥊">
        <b style={{ color: C.text }}>The K prop:</b> <B col={k9 >= 9.5 ? C.blue : k9 <= 7 ? C.orange : C.text}>{k9.toFixed(1)} K/9</B> —{' '}
        {k9 >= 9.5 ? <><b style={{ color: C.blue }}>swing-and-miss arm; his strikeout over is the market that belongs to him</b></>
          : k9 <= 7 ? <><b style={{ color: C.orange }}>contact arm — more balls in play for the bats, and a thin case for his K over</b></>
          : <>league-ish whiff; no lean either way on his Ks</>}.
      </Line>
    )
  }

  // ── the building ─────────────────────────────────────────────────────────
  if (venue && parkHr != null) {
    lines.push(
      <Line key="park" icon="🏟">
        <b style={{ color: C.text }}>The building:</b> {venue} plays{' '}
        <B col={parkHr >= 1.05 ? C.orange : parkHr <= 0.95 ? C.blue : C.text}>
          {parkHr >= 1.05 ? `+${Math.round(100 * (parkHr - 1))}% for homers` : parkHr <= 0.95 ? `${Math.round(100 * (parkHr - 1))}% for homers` : 'about neutral'}
        </B> tonight.
      </Line>
    )
  }

  if (!lines.length) return null

  return (
    <div style={{ margin: '2px 0 13px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, fontWeight: 900 }}>🧭 The read</span>
        <span style={{ fontSize: 9, color: C.text3 }}>
          {clean(name, 'this arm')} tonight, in sentences — the tiles above and tabs below back every one
        </span>
      </div>
      {lines}
    </div>
  )
}
