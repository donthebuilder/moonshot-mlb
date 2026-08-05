'use client'
import { useState, useMemo } from 'react'
import {
  playerId, nameOf, teamOf, oppOf, hrScore, hitScore, prodScore, tbScore,
  nn, n, clean, arr, obj, barrelRate, avgEV, pitchMixScore,
} from '../../lib/player'
import { tierRole, isAligned } from '../../lib/scoring'
import { C, NUM_FONT } from '../../lib/theme'
import { PanelTitle, Grid, Empty } from '../ui'
import HitterHeat from '../HitterHeat'
import DenseTable from '../DenseTable'
import PlayerCard from '../PlayerCard'
import { downloadShareCard } from '../shareCard'

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
      .replace(/\[[^\]]*\]/g, '')                      // [bot: TOP] \u2014 our own export!
      .replace(/\([^)]*\)/g, '')                       // (PHI), (BAL vs LAA)
      .replace(/^\s*(?:\d+[.)]|[-*\u2022])\s*/, '')   // 1.  1)  -  *  bullets
      .replace(/[+-]\d{3,}/g, '')                      // +410, -125
      .trim()).filter(Boolean)

    const byName = new Map(players.map((p) => [norm(nameOf(p)), p]))
    // Pre-normalised names, longest first, so "Will Smith" can't steal a line
    // that actually contains a longer name around it.
    const nameIndex = players
      .map((p) => ({ p, nk: norm(nameOf(p)) }))
      .filter((x) => x.nk.length > 4)
      .sort((a, b) => b.nk.length - a.nk.length)

    return lines.map((line) => {
      const k = norm(line)
      // Three passes, strict to loose:
      //   1. the line IS a name ("Pete Alonso")
      //   2. the line CONTAINS a name \u2014 this is the one that makes the
      //      site's own .txt export round-trip ("Power Watch Pete Alonso
      //      BAL vs LAA HR 58 bot TOP" after stripping still carries junk,
      //      but the name is in there) and survives any other format that
      //      wraps a name in labels
      //   3. the line is PART of a name (someone typed "alonso")
      const hit = byName.get(k)
        || nameIndex.find((x) => k.includes(x.nk))?.p
        || nameIndex.find((x) => x.nk.includes(k))?.p
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
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            margin: '8px 0 6px',
          }}>
            <span style={{ fontSize: 10.5, color: C.text3 }}>
              {found.length} of {parsed.length} matched to tonight&apos;s slate
              {found.length > 0 && (
                <> · <b style={{ color: C.orange }}>{found.filter((r) => botPickOf(r.hit)).length}</b> also a bot pick</>
              )}
            </span>
            {/* THE BULK SAVE. Pasting a list and having the site do nothing
                with it felt like the box swallowed your work — the matches
                existed on screen but never became yours. One click stars
                every matched hitter, exactly as if you'd found each on a
                board and starred him: same watchlist, same pair-builder
                anchors, same everything downstream. */}
            {onWatch && found.length > 0 && (() => {
              const unsaved = found.filter((r) => !watchedIds?.has(playerId(r.hit)))
              return unsaved.length > 0 ? (
                <button
                  onClick={() => unsaved.forEach((r) => onWatch(r.hit, true))}
                  style={{
                    fontSize: 10.5, fontWeight: 800, padding: '4px 12px', borderRadius: 7,
                    border: `1px solid ${C.orange}`, background: 'rgba(249,115,22,.12)',
                    color: C.orange, cursor: 'pointer', fontFamily: NUM_FONT,
                  }}
                >★ Save all {unsaved.length} to watchlist</button>
              ) : (
                <span style={{ fontSize: 10, color: C.green, fontFamily: NUM_FONT }}>
                  ✓ all matched are on your watchlist
                </span>
              )
            })()}
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
              onClick={() => downloadShareCard(items)}
              title="Render the list as a PNG image for posting — top 12 by HR score, with bot-pick tags"
              style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                border: `1px solid ${C.border2}`,
                background: 'rgba(249,115,22,.10)',
                color: C.orange,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              📸 Share Card
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

      {/* PAIRS WITHIN THE LIST. The first version here pre-anchored the full
          pair builder to the watchlist — which, by the builder's own rules,
          could NEVER pair two watched players together: anchors are excluded
          from being partners, so a list full of anchors produced pairs of
          list-vs-slate, not list-vs-list. Exactly backwards for a watchlist.
          This is the right shape: every two-man combination FROM the saved
          names, scored on tonight plus whatever co-HR history the pair has.
          For a hitter's partners beyond the list, the full builder lives on
          Pools. */}
      {items.length >= 2 && (
        <WatchlistPairs items={items} pairSummary={pairSummary} onPlayerClick={onPlayerClick} />
      )}
    </div>
  )
}

// Every 2-combination of the saved hitters, ranked. History lookup goes
// through pair_history_summary by player_id pair, so a combo with real
// same-game history rises even if tonight's scores are middling.
function WatchlistPairs({ items, pairSummary, onPlayerClick }) {
  const rows = useMemo(() => {
    // History index: "idA|idB" (sorted) -> pair record.
    const hist = new Map()
    arr(obj(pairSummary).top_pairs).forEach((pr) => {
      const ids = arr(pr?.players).map((p) => String(p?.player_id ?? '')).filter(Boolean).sort()
      if (ids.length === 2) hist.set(ids.join('|'), pr)
    })

    const out = []
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j]
        const key = [String(a?.player_id ?? ''), String(b?.player_id ?? '')].sort().join('|')
        const h = hist.get(key)
        const hrA = hrScore(a), hrB = hrScore(b)
        const sameGame = a?.game_pk && a.game_pk === b.game_pk
        const sg = h ? Number(h.same_game_hr_count) || 0 : 0
        const sd = h ? Number(h.same_day_hr_count_season ?? h.repeat_count) || 0 : 0
        const since = h && h.days_since_last_hit != null ? Number(h.days_since_last_hit) : null
        out.push({
          _key: key || `${i}-${j}`,
          _raw: hrA >= hrB ? a : b,
          pair: `${nameOf(a)} + ${nameOf(b)}`,
          teams: `${teamOf(a)} / ${teamOf(b)}`,
          sameGm: sameGame ? 1 : 0,
          stronger: Math.max(hrA, hrB),
          weaker: Math.min(hrA, hrB),
          histSg: sg,
          histSd: sd,
          since,
          hasHist: h ? 1 : 0,
          // Rank: the weaker side leads (both must land), same-game history
          // is worth real points, same-day less, recency a nudge.
          fit: Math.min(hrA, hrB)
            + Math.min(30, sg * 12)
            + Math.min(12, sd * 2)
            + (since != null ? Math.max(0, 10 - Math.min(10, since / 3)) : 0),
        })
      }
    }
    return out.sort((a, b) => b.fit - a.fit)
  }, [items, pairSummary])

  const withHist = rows.filter((r) => r.hasHist).length

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800 }}>🔗 Pairs within your list</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          {rows.length} combos from {items.length} saved · {withHist} with co-HR history
        </span>
      </div>
      <div style={{ fontSize: 10, color: C.text3, marginBottom: 8, lineHeight: 1.5 }}>
        Every two-man combination of your saved hitters, best first. For one hitter&apos;s partners
        beyond this list, use the builder on Pools.
      </div>
      <DenseTable
        rows={rows}
        columns={[
          { key: 'pair',    label: 'Pair', heat: false, w: 230, bold: true, sticky: true },
          { key: 'teams',   label: 'Teams', heat: false, w: 76, mono: true, dim: true },
          { key: 'sameGm',  label: 'Same gm', flag: true, mark: '⚡', w: 52,
            title: 'Both hitters are in the SAME GAME tonight — correlated, higher variance' },
          { key: 'fit',     label: 'Fit', w: 46, dp: 0,
            title: 'Weaker side + same-game history (12/ea, cap 30) + same-day (2/ea, cap 12) + recency nudge' },
          { key: 'weaker',  label: 'Weaker', w: 52, dp: 1,
            title: 'The lower HR score of the two — both have to land, so this side decides' },
          { key: 'stronger', label: 'Stronger', w: 56, dp: 1 },
          { key: 'histSg',  label: 'Hist same-gm', w: 66,
            title: 'Times these two homered in the same game this season' },
          { key: 'histSd',  label: 'Hist same-day', w: 68,
            title: 'Times they homered on the same date — different parks count' },
          { key: 'since',   label: 'Last together', w: 72, invert: true,
            fmt: (v) => (v == null ? 'never' : v === 0 ? 'today' : `${v}d ago`),
            title: 'Days since they last homered on the same day. Inverted — recent reads bright.' },
        ]}
        onRowClick={onPlayerClick}
        initialSort={null}
        maxHeight={400}
        caption="Ranked by Fit, which leads with the WEAKER side — a pair is never better than its worse half — then adds history. 'never' in Last together isn't a strike against a pair: most good pairs have no history yet, it just means the history columns contribute nothing. ⚡ marks both hitters in one game tonight: they rise and fall together."
      />
    </div>
  )
}
