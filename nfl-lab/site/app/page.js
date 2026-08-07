// MOONSHOT · NFL — preseason preview landing (2026-08-08).
//
// This page is the honest state of the build: what's coming, what the rules
// are, and nothing pretending to be live before it is. Boards land as the
// bot's backtest work lands; the skeleton (header, tables, live layer)
// ports from the MLB site once data flows.

const C = {
  bg2: '#111113', border: '#27272a', text: '#fafafa',
  text2: '#d4d4d8', text3: '#71717a', orange: '#f97316', green: '#22c55e',
}

const MARKETS = [
  ['🏈', 'Anytime TD', 'rushing or receiving — the headline lane'],
  ['🙌', 'Receiving yards', 'lines at 25 / 40 / 60+'],
  ['🧤', 'Receptions', 'lines at 3 / 5 / 7+'],
  ['🏃', 'Rushing yards', 'lines at 40 / 60 / 80+'],
  ['🔁', 'Rushing attempts', 'volume is a skill — 10 / 15+'],
  ['🎯', 'Passing yards', 'lines at 200 / 250 / 300+'],
  ['🦵', 'Kicking points', 'FG×3 + PAT — 6 / 9+'],
]

export default function Home() {
  return (
    <main style={{ maxWidth: 780, margin: '0 auto', padding: '48px 20px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 30, fontWeight: 900, letterSpacing: '-0.02em',
          background: 'linear-gradient(90deg, #22c55e, #f97316)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>MOONSHOT</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: C.text3, letterSpacing: '.08em' }}>· NFL</span>
        <span style={{
          fontSize: 10, fontWeight: 900, color: C.green, letterSpacing: '.1em',
          border: `1px solid ${C.green}55`, borderRadius: 999, padding: '2px 10px',
        }}>PRESEASON PREVIEW</span>
      </div>

      <p style={{ fontSize: 14, color: C.text2, lineHeight: 1.7, marginTop: 18, maxWidth: 640 }}>
        The football sibling of <a href="https://moonshot-mlb.vercel.app" style={{ color: C.orange, textDecoration: 'none', fontWeight: 700 }}>moonshot-mlb</a>.
        Same rules, different sport: picks post <b>before kickoff</b>, lock when the game starts,
        and grade in public — misses included. The Report Card ships in v1, calibrated on the full
        2025 season before a single 2026 pick is made.
      </p>

      <div style={{ fontSize: 11, fontWeight: 900, color: C.text3, letterSpacing: '.1em', margin: '28px 0 10px' }}>
        THE SEVEN MARKETS — AND ONLY THESE
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {MARKETS.map(([icon, name, note]) => (
          <div key={name} style={{
            flex: '1 1 220px', background: C.bg2, border: `1px solid ${C.border}`,
            borderTop: `2px solid ${C.green}`, borderRadius: 10, padding: '10px 13px',
          }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>{icon} {name}</div>
            <div style={{ fontSize: 10.5, color: C.text3, marginTop: 3 }}>{note}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: C.text3, marginTop: 10 }}>
        No defensive props. Ever. That lane rewards injuries and we don&apos;t bet on people getting hurt.
      </div>

      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.orange}`,
        borderRadius: 10, padding: '12px 16px', marginTop: 28, fontSize: 12.5, color: C.text2, lineHeight: 1.65,
      }}>
        <b style={{ color: C.text }}>The weekly rhythm:</b> Tuesday the league&apos;s full data lands ·
        Wednesday the slate posts · picks update through Sunday and lock at each kickoff ·
        live Sunday · graded Monday. One receipts cycle per week — every digest carries a whole
        week&apos;s record, not a highlight reel.
      </div>

      <div style={{ fontSize: 10, color: C.text3, marginTop: 36, fontFamily: 'ui-monospace, monospace' }}>
        build status: data pipeline live (nflverse) · 2025 backtest next · boards after that · Week 1 target
      </div>
    </main>
  )
}
