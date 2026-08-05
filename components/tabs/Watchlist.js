'use client'
import { useState, useMemo } from 'react'
import {
  playerId, nameOf, teamOf, oppOf, hrScore, hitScore, prodScore, tbScore,
  nn, n, clean, barrelRate, avgEV, pitchMixScore,
} from '../../lib/player'
import { tierRole, isAligned } from '../../lib/scoring'
import { C, NUM_FONT } from '../../lib/theme'
import { PanelTitle, Grid, Empty } from '../ui'
import HitterHeat from '../HitterHeat'
import DenseTable from '../DenseTable'
import PlayerCard from '../PlayerCard'
import PairBuilder from '../PairBuilder'

// The bot's designated category for tonight, straight off the slate row —
// "HR", "HIT", "TOP/HR", or '' when he isn't one of the ~105 designated
// hitters. Shown wherever a watchlist name meets the slate, because "is my
// guy also the bot's guy" is the first cross-reference question there is.
const botPickOf = (p) => String(p?.game_pick_role || '').trim().toUpperCase()

const EXPORT_COLUMNS = [
  { key: 'name',     label: 'Player',          get: (p) => nameOf(p) },
  { key: 'team',     label: 'Team',            get: (p) => teamOf(p) },
  { key: 'opp',      label: 'Opponent',        get: (p) => oppOf(p) },
  { key: 'role',     label: 'Role',            get: (p) => tierRole(p) },
  { key: 'botpick',  label: 'Bot Pick',        get: (p) => botPickOf(p) || 'No' },
  { key: 'hr',       label: 'HR Score',        get: (p) => hrScore(p).toFixed(1) },
  { key: 'hrr',      label: 'HRR Score',       get: (p) => prodScore(p).toFixed(1) },
  { key: 'hit',      label: 'Hit Score',       get: (p) => hitScore(p).toFixed(1) },
  { key: 'tb',       label: 'TB Score',        get: (p) => tbScore(p).toFixed(1) },
  { key: 'hrw',      label: 'HRW',             get: (p) => (p?.hrw_score ?? '').toString() },
  { key: 'dmg',      label: 'Damage Conv.',    get: (p) => (p?.damage_conversion_score ?? '').toString() },
  { key: 'pmatch',   label: 'Pitch Match',     get: (p) => (p?.pitch_type_match_score ?? '').toString() },
  { key: 'weakspot', label: 'Weak Spot',       get: (p) => (p?.weak_spot_flag ? 'Yes' : 'No') },
  { key: 'aligned',  label: 'Aligned Signals', get: (p) => (isAligned(p) ? 'Yes' : 'No') },
  { key: 'lineup',   label: 'Lineup Spot',     get: (p) => (p?.lineup_spot ?? '').toString() },
  { key: 'pitcher',  label: 'Pitcher',         get: (p) => (p?.pitcher_name ?? '') },
]

function csvCell(value) {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function buildCsv(items) {
  const header = EXPORT_COLUMNS.map((c) => csvCell(c.label)).join(',')
  const rows = items.map((p) => EXPORT_COLUMNS.map((c) => csvCell(c.get(p))).join(','))
  return [header, ...rows].join('\n')
}

function downloadCsv(items) {
  const csv = buildCsv(items)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `watchlist_${stamp}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Plain-text list, formatted to echo the card/bot-board look: emoji + name +
// score, one player per line. final_hr_role already starts with the role
// emoji (🏆/🔥/🏁/🔭/💠/⛔), so this just reuses it directly rather than
// re-deriving the symbol.
function buildTextList(items) {
  const lines = items.map((p) => {
    const role = tierRole(p)
    const score = Math.round(hrScore(p))
    const align = isAligned(p) ? ' 🧩' : ''
    const bp = botPickOf(p)
    return `${role}  ${nameOf(p)} (${teamOf(p)} vs ${oppOf(p)})  HR ${score}${align}${bp ? `  [bot: ${bp}]` : ''}`
  })
  const stamp = new Date().toLocaleDateString()
  return [`Watchlist — ${stamp} — ${items.length} players`, '', ...lines].join('\n')
}

function downloadTxt(items) {
  const text = buildTextList(items)
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `watchlist_${stamp}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function copyTextList(items, onDone) {
  const text = buildTextList(items)
  try {
    await navigator.clipboard.writeText(text)
    onDone?.(true)
  } catch {
    onDone?.(false)
  }
}

// Cross-reference — paste a list from anywhere and see it against the slate.
//
// The formats people actually paste are messy: ranking numbers, bullets, odds,
// team codes in brackets. Stripping those is the whole feature; a box that only
// accepts clean names is a box nobody uses twice.
function CrossReference({ players, onPlayerClick, onWatch, watchedIds }) {
  const [text, setText] = useState('')

  const norm = (v) => String(v || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim()

  const parsed = useMemo(() => {
    const lines = text.split(/[\n,]/).map((l) => l
      .replace(/^\s*(?:\d+[.)]|[-*\u2022])\s*/, '')   // 1.  1)  -  *  bullets
      .replace(/[+-]\d{3,}/g, '')                      // +410, -125
      .replace(/\((?:[A-Z]{2,3})\)/g, '')              // (PHI)
      .trim()).filter(Boolean)

    const byName = new Map(players.map((p) => [norm(nameOf(p)), p]))
    return lines.map((line) => {
      const k = norm(line)
      const hit = byName.get(k)
        || players.find((p) => norm(nameOf(p)).includes(k) && k.length > 4)
      return { line, hit: hit || null }
    })
  }, [text, players])

  const found = parsed.filter((r) => r.hit)

  return (
    <details style={{
      background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: '10px 14px', marginBottom: 14,
    }}>
      <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: C.text2 }}>
        📋 Cross-reference a list of players
      </summary>
      <div style={{ fontSize: 10.5, color: C.text3, margin: '8px 0 6px', lineHeight: 1.55 }}>
        Paste names one per line or comma-separated. Ranking numbers, bullets, odds and team codes
        are stripped automatically.
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={'Aaron Judge\nShohei Ohtani +410\n3. Kyle Schwarber (PHI)'}
        style={{
          width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '8px 10px', fontSize: 12, color: C.text, fontFamily: NUM_FONT,
          outline: 'none', resize: 'vertical',
        }}
      />
      {parsed.length > 0 && (
        <>
          <div style={{ fontSize: 10.5, color: C.text3, margin: '8px 0 6px' }}>
            {found.length} of {parsed.length} matched to tonight&apos;s slate
            {found.length > 0 && (
              <> · <b style={{ color: C.orange }}>{found.filter((r) => botPickOf(r.hit)).length}</b> also a bot pick</>
            )}
          </div>
          <DenseTable
            rows={parsed.map((r, i) => {
              const p = r.hit
              return {
                _key: `${r.line}-${i}`,
                _raw: p,
                watched: p && watchedIds?.has(playerId(p)) ? 1 : 0,
                input: r.line,
                name: p ? nameOf(p) : '— not on slate —',
                team: p ? teamOf(p) : '',
                opp: p ? oppOf(p) : '',
                facing: p ? clean(p?.pitcher_name, 'TBD') : '',
                botpick: p ? (botPickOf(p) || '—') : '',
                isPick: p && botPickOf(p) ? 1 : 0,
                weak: p?.weak_spot_flag ? 1 : 0,
                l5: p ? `${n(p?.last5_hits, 0)}H/${n(p?.last5_hr, 0)}HR/${n(p?.last5_xbh, 0)}X` : '',
                hr: p ? hrScore(p) : null,
                hrw: p ? nn(p?.hrw_score) : null,
                dc: p ? nn(p?.damage_conversion_score) : null,
                iso: p ? nn(p?.season_iso) * 100 : null,
                brl: p ? barrelRate(p) * 100 : null,
                ev: p ? avgEV(p) : null,
                pmix: p ? pitchMixScore(p) : null,
                hrr: p ? prodScore(p) : null,
                hitS: p ? hitScore(p) : null,
                hr9: p ? n(p?.pitcher_hr9, null) : null,
              }
            })}
            columns={[
              // Star first: paste a list, star the keepers, done — the whole
              // reason this box lives on the Watchlist tab.
              ...(onWatch ? [{
                key: 'watched', label: '☆', action: true, w: 30, mark: '★', markOff: '☆',
                titleOn: 'Remove from watchlist', titleOff: 'Add to watchlist',
                onAction: (row) => row?._raw && onWatch(row._raw, !watchedIds?.has(playerId(row._raw))),
              }] : []),
              { key: 'input', label: 'Pasted', heat: false, w: 118, dim: true },
              { key: 'name',  label: 'Matched', heat: false, w: 148, bold: true, sticky: true },
              { key: 'team',  label: 'Tm',   heat: false, w: 34, mono: true, dim: true },
              { key: 'opp',   label: 'Opp',  heat: false, w: 34, mono: true, dim: true },
              { key: 'facing', label: 'Facing', heat: false, w: 118, dim: true },
              { key: 'isPick', label: '🤖',  flag: true, mark: '●', w: 32,
                title: 'The bot designated this hitter as one of tonight’s picks' },
              { key: 'botpick', label: 'Pick', heat: false, w: 58, mono: true,
                title: 'Which category the bot picked him for — HR, TOP, HIT, HRR, CONTACT. Dash = on the slate but not designated.' },
              { key: 'weak',  label: '★',    flag: true, mark: '★', w: 30,
                title: 'Weak lineup spot against tonight’s starter' },
              { key: 'l5',    label: 'L5',   heat: false, w: 76, mono: true, dim: true,
                title: 'Last five games — hits / homers / extra-base hits' },
              { key: 'hr',    label: 'HR',   w: 44, dp: 1,
                title: 'HR score' },
              { key: 'hrw',   label: 'HRW',  w: 46, dp: 0,
                title: 'HR Watch — the bot’s heat/recency read, 0–100' },
              { key: 'dc',    label: 'DC',   w: 42, dp: 0,
                title: 'Damage conversion — how often his hard contact becomes damage' },
              { key: 'iso',   label: 'ISO',  w: 44, dp: 0,
                title: 'Season ISO ×100. The strongest HR predictor in the graded archive: sub-13 homered 8.2%, 23+ homered 22.2%.' },
              { key: 'brl',   label: 'Brl%', w: 46, dp: 1,
                title: 'Recent barrel rate' },
              { key: 'ev',    label: 'EV',   w: 46, dp: 1,
                title: 'Average exit velocity' },
              { key: 'pmix',  label: 'PMix', w: 46, dp: 0,
                title: 'Pitch-mix fit vs tonight’s starter' },
              { key: 'hrr',   label: 'HRR',  w: 44, dp: 1 },
              { key: 'hitS',  label: 'Hit',  w: 44, dp: 1 },
              { key: 'hr9',   label: 'P HR/9', w: 50, dp: 2,
                title: 'The starter he faces — homers allowed per nine' },
            ]}
            onRowClick={(r) => r && onPlayerClick?.(r)}
            maxHeight={340}
            caption="Star a row to save him to the watchlist without leaving the box. 🤖 + Pick = the bot designated him tonight and for what. Every numeric column heats against this pasted list only, so bright means best of YOUR names, not best of the slate. Rows with no match either aren't playing tonight or came through with a spelling the slate doesn't use."
          />
        </>
      )}
    </details>
  )
}

export default function Watchlist({ items, players = [], pairSummary, onWatch, onAdd, onPlayerClick }) {
  const [confirming, setConfirming] = useState(false)
  const [copied, setCopied] = useState(false)

  function handleClearAll() {
    if (!confirming) { setConfirming(true); return }
    items.forEach(p => onWatch?.(p, false))
    setConfirming(false)
  }

  function handleCopy() {
    copyTextList(items, (ok) => {
      setCopied(ok ? 'ok' : 'fail')
      setTimeout(() => setCopied(false), 1800)
    })
  }

  if (!items.length) {
    return (
      <div>
        <PanelTitle title="Watchlist" sub="Tap the ☆ on any player card to save them here. Saved on this device only." />
        <CrossReference players={players} onPlayerClick={onPlayerClick} onWatch={onWatch} watchedIds={new Set(items.map(playerId))} />
        <Empty text="No saved players yet." />
      </div>
    )
  }

  return (
    <div>
      <PanelTitle
        title="Watchlist"
        sub={`${items.length} saved`}
        right={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={handleCopy}
              style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                border: `1px solid ${copied === 'ok' ? C.green : C.border2}`,
                background: copied === 'ok' ? `${C.green}22` : 'rgba(255,255,255,.04)',
                color: copied === 'ok' ? C.green : C.text2,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {copied === 'ok' ? '✓ Copied' : copied === 'fail' ? 'Copy failed' : '📋 Copy List'}
            </button>
            <button
              onClick={() => downloadTxt(items)}
              style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                border: `1px solid ${C.border2}`,
                background: 'rgba(255,255,255,.04)',
                color: C.text2,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              ⬇ Export .txt
            </button>
            <button
              onClick={() => downloadCsv(items)}
              style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                border: `1px solid ${C.border2}`,
                background: 'rgba(255,255,255,.04)',
                color: C.text2,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              ⬇ Export CSV
            </button>
            <button
              onClick={handleClearAll}
              onBlur={() => setConfirming(false)}
              style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                border: `1px solid ${confirming ? C.red : C.border}`,
                background: confirming ? `${C.red}22` : 'rgba(255,255,255,.04)',
                color: confirming ? C.red : C.text3,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {confirming ? 'Confirm Clear' : 'Clear All'}
            </button>
          </div>
        }
      />
      {/* A watchlist is a set you assembled by hand, so the useful question
          isn't the ranking -- it's whether the names you saved actually have
          anything in common, or whether you've collected six different bets. */}
      <CrossReference players={players} onPlayerClick={onPlayerClick} onWatch={onWatch} watchedIds={new Set(items.map(playerId))} />

      {/* BOT AGREEMENT. The first question about a hand-built list: which of
          my saves does the bot also like tonight, and for what. One chip per
          watched player who carries a game_pick_role. */}
      {(() => {
        const agreed = items.filter((p) => botPickOf(p))
        if (!agreed.length) return null
        return (
          <div style={{ margin: '2px 0 12px' }}>
            <div style={{ fontSize: 10.5, color: C.text3, marginBottom: 6 }}>
              <b style={{ color: C.orange }}>{agreed.length}</b> of your {items.length} saved are
              also bot picks tonight:
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {agreed.map((p) => (
                <button
                  key={playerId(p)}
                  onClick={() => onPlayerClick?.(p)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                    background: 'rgba(249,115,22,.10)', border: `1px solid ${C.orange}55`,
                    borderRadius: 8, padding: '4px 10px',
                  }}
                >
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text }}>{nameOf(p)}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 900, fontFamily: NUM_FONT,
                    color: C.orange, letterSpacing: '.05em',
                  }}>🤖 {botPickOf(p)}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      <HitterHeat
        players={items}
        type="hr"
        title="Your watchlist"
        topN={items.length}
        showTable={false}
        onPlayerClick={onPlayerClick}
      />

      <Grid>
        {items.map((p) => (
          <PlayerCard
            key={playerId(p)}
            p={p}
            type="hr"
            onAdd={onAdd}
            onWatch={onWatch}
            watched={true}
            onClick={() => onPlayerClick?.(p)}
          />
        ))}
      </Grid>

      {/* BUILD PAIRS FROM THESE NAMES. The full pair builder, pre-anchored to
          every saved hitter — partners are ranked by who fits with the whole
          watchlist at once, and "Shared by all" narrows to partners who go
          with everyone. Star a new name above and it joins the anchors
          automatically. The Pools tab has the same builder unanchored. */}
      {pairSummary && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10.5, color: C.text3, marginBottom: 8, lineHeight: 1.5 }}>
            Pre-loaded with your {items.length} saved hitter{items.length === 1 ? '' : 's'} as anchors —
            partners below are ranked by fit with your list. Click chips to adjust.
          </div>
          <PairBuilder
            summary={pairSummary}
            players={players}
            initialAnchors={items}
            onPlayerClick={onPlayerClick}
          />
        </div>
      )}
    </div>
  )
}
