'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { arr, obj, n, clean, nameOf, teamOf, oppOf, hrScore, hitScore, prodScore, tbScore } from '../lib/player'
import Heatmap from './Heatmap'
import DenseTable from './DenseTable'

// Pair Builder — pick one or more hitters, get the partners they share tonight.
//
// Two things have to be combined and they are not the same kind of evidence:
//
//   HISTORY  — how often these two have actually gone deep together. Backward
//              looking, and mostly coincidence unless it happened in the SAME
//              GAME. Two hitters homering on the same date in different parks
//              is two independent events.
//   TONIGHT  — what the slate says about each of them right now: HR score,
//              weak spot, the arm they're facing.
//
// A partner needs both. History alone is survivorship; tonight alone ignores
// everything the season showed. The fit score below is deliberately weighted
// toward tonight, because the history sample per pair is tiny — most of these
// pairs have single-digit co-HR days across a whole season.
//
// MULTI-ANCHOR. Selecting several hitters answers a different question than
// selecting one: not "who goes with him" but "who goes with all of them". A
// partner who shares history with three of your anchors is worth more than one
// who shares a longer history with a single anchor, so matched-anchor count
// sorts above fit. Partners matching only some of the selection are still
// listed — they're just labelled as such rather than silently mixed in.
//
// MATCHING IS BY player_id. The history file publishes player_id on every
// entry (350 of 350 pairs), and joining on a normalised name string is how you
// end up with two Will Smiths and a missing Peña.

// MARKETS — carried over from the retired ticket builder, because it was the
// one part of that page worth keeping: build a pair for the outcome you're
// actually betting, not always home runs. The market changes the TONIGHT half
// of the fit (which score ranks anchors and partners); the HISTORY half is
// co-HR days in every market, because that's the only pair history the bot
// publishes. The caption says so when it matters.
const MARKETS = [
  { key: 'hr',  label: 'Home run', short: 'HR',  score: hrScore,   needs: '1+ HR' },
  { key: 'hit', label: '1+ hit',   short: 'Hit', score: hitScore,  needs: '1+ hit' },
  { key: 'hrr', label: 'HRR',      short: 'HRR', score: prodScore, needs: '2+ H+R+RBI' },
  { key: 'tb',  label: '2+ bases', short: 'TB',  score: tbScore,   needs: '2+ TB' },
]

const nameKey = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

// id when we have one, normalised name only as a fallback.
function refKey(o) {
  const id = o?.player_id ?? o?.id
  if (id !== undefined && id !== null && String(id) !== '') return `id:${id}`
  const k = nameKey(o?.name || o?.player_name)
  return k ? `nm:${k}` : ''
}

export default function PairBuilder({ summary, players = [], onPlayerClick }) {
  const [anchorKeys, setAnchorKeys] = useState([])
  const [query, setQuery] = useState('')
  const [requireAll, setRequireAll] = useState(false)
  const [marketKey, setMarketKey] = useState('hr')
  const mkt = MARKETS.find((x) => x.key === marketKey) || MARKETS[0]
  const mScore = mkt.score

  const pairs = arr(obj(summary).top_pairs)

  // Slate rows keyed by id AND by normalised name, so a history entry can find
  // tonight's row either way.
  const slate = useMemo(() => {
    const m = new Map()
    players.forEach((p) => {
      const id = p?.player_id ?? p?.id
      if (id != null && String(id) !== '') m.set(`id:${id}`, p)
      const k = nameKey(nameOf(p))
      if (k && !m.has(`nm:${k}`)) m.set(`nm:${k}`, p)
    })
    return m
  }, [players])

  const lookupToday = (ref) => slate.get(refKey(ref)) || slate.get(`nm:${nameKey(ref?.name || ref?.player_name)}`)

  // EVERY hitter on tonight's slate is selectable — not just the ones with
  // pair history.
  //
  // This list used to be built by walking top_pairs and keeping whoever was
  // also on the slate. On tonight's slate that's 55 of 143 hitters: the history
  // file holds 350 pairs covering 118 distinct players, and 88 of tonight's
  // bats appear in none of them. Those 88 had no chip at all, so there was no
  // way to click them — which reads as the page being broken rather than as
  // "this hitter has no co-HR history", and those are very different things.
  //
  // A hitter with no history is still a legitimate anchor: you may want his
  // partners ranked on tonight's form alone, and in a multi-select he simply
  // contributes nothing. So everyone is offered, and the ones with history are
  // marked rather than being the only ones that exist.
  const historyKeys = useMemo(() => {
    const s = new Set()
    pairs.forEach((pr) => arr(pr?.players).forEach((pl) => {
      const today = lookupToday(pl)
      if (today) s.add(refKey(today))
    }))
    return s
  }, [pairs, slate])

  const anchors = useMemo(() => {
    const seen = new Map()
    players.forEach((p) => {
      const k = refKey(p)
      if (!k || seen.has(k)) return
      seen.set(k, {
        key: k,
        name: nameOf(p),
        team: teamOf(p),
        today: p,
        hasHistory: historyKeys.has(k),
      })
    })
    return [...seen.values()].sort((a, b) => mScore(b.today) - mScore(a.today))
  }, [players, historyKeys, mScore])

  const selected = useMemo(
    () => anchorKeys.map((k) => anchors.find((a) => a.key === k)).filter(Boolean),
    [anchorKeys, anchors],
  )
  // Default to the top hitter so the panel is never empty on arrival, matching
  // how it behaved when it was single-select.
  const active = selected.length ? selected : (anchors[0] ? [anchors[0]] : [])
  const activeKeys = useMemo(() => new Set(active.map((a) => a.key)), [active])

  const toggleAnchor = (k) => setAnchorKeys((prev) => {
    if (prev.includes(k)) return prev.filter((x) => x !== k)
    // If nothing was explicitly chosen yet, the implicit default was anchors[0];
    // clicking a different hitter should select that hitter, not add to a
    // selection the user never made.
    return prev.length ? [...prev, k] : [k]
  })

  // partnerKey -> { today, per: [{ anchorKey, anchorName, fit, sameGame, ... }] }
  const partners = useMemo(() => {
    if (!active.length) return []
    const acc = new Map()

    active.forEach((anchor) => {
      pairs.forEach((pr) => {
        const ps = arr(pr?.players)
        if (ps.length < 2) return
        const mine = ps.filter((x) => refKey(lookupToday(x) || x) === anchor.key
          || nameKey(x?.name || x?.player_name) === nameKey(anchor.name))
        if (!mine.length) return
        const other = ps.find((x) => !mine.includes(x))
        if (!other) return
        const today = lookupToday(other)
        if (!today) return                       // not playing tonight
        const k = refKey(today)
        if (!k || activeKeys.has(k)) return      // don't offer an anchor as its own partner

        // Per-market history, if the bot ever publishes it (checklist #15 in
        // BOT-DATA-REQUESTS.md): on the hit market prefer same_game_hit_count,
        // on HRR prefer same_day_hrr_count, and so on. Until those fields
        // exist this falls back to the co-HR counts, which the caption
        // discloses. The moment the bot writes them, the builder uses them
        // with no site change.
        const mkHist = (base) => {
          const alt = marketKey === 'hit' ? pr?.[`${base}_hit_count`]
            : marketKey === 'hrr' ? pr?.[`${base}_hrr_count`]
            : marketKey === 'tb' ? pr?.[`${base}_tb_count`]
            : null
          return alt != null && Number(alt) > 0 ? n(alt, 0) : null
        }
        const days = mkHist('same_day') ?? n(pr?.repeat_count, 0)
        const sameGame = mkHist('same_game') ?? n(pr?.same_game_hr_count, 0)
        const since = n(pr?.days_since_last_hit, 99)
        // The market picks which score "tonight" means — HR score on the HR
        // market, hit score on 1+ hit, and so on.
        const hr = mScore(today)

        // Weighted toward tonight on purpose. Same-game history counts for five
        // times a shared date, because only the same-game version is correlated.
        const fit =
          hr * 0.55 +
          Math.min(40, sameGame * 12) * 0.25 +
          Math.min(30, days * 2.5) * 0.10 +
          Math.max(0, 30 - Math.min(30, since)) * 0.10

        if (!acc.has(k)) {
          acc.set(k, {
            _key: k,
            _raw: today,
            name: clean(other?.name || other?.player_name, '') || nameOf(today),
            team: teamOf(today) || clean(other?.team, ''),
            opp: oppOf(today),
            pitcher: clean(today?.pitcher_name, 'TBD'),
            hr,
            weak: today?.weak_spot_flag ? 1 : 0,
            hr9: n(today?.pitcher_hr9, 0),
            per: [],
          })
        }
        acc.get(k).per.push({
          anchorKey: anchor.key, anchorName: anchor.name,
          fit, sameGame, days, since: since >= 99 ? null : since,
          boost: n(pr?.history_boost, 0), pairScore: n(pr?.pair_score, 0),
        })
      })
    })

    const total = active.length
    const rows = [...acc.values()].map((r) => {
      const matched = new Set(r.per.map((x) => x.anchorKey)).size
      const sum = (f) => r.per.reduce((a, x) => a + n(f(x), 0), 0)
      const sinces = r.per.map((x) => x.since).filter((v) => v != null)
      return {
        ...r,
        matched,
        all: matched === total,
        with: r.per.map((x) => x.anchorName.split(' ').slice(-1)[0]).join(', '),
        // Mean fit, not sum — a sum would just rank by how many anchors matched,
        // which `matched` already carries as its own column.
        fit: sum((x) => x.fit) / Math.max(1, r.per.length),
        sameGame: sum((x) => x.sameGame),
        days: sum((x) => x.days),
        since: sinces.length ? Math.min(...sinces) : null,
        boost: sum((x) => x.boost),
        pairScore: sum((x) => x.pairScore) / Math.max(1, r.per.length),
      }
    })

    const filtered = requireAll && total > 1 ? rows.filter((r) => r.all) : rows
    return filtered.sort((a, b) => (b.matched - a.matched) || (b.fit - a.fit))
  }, [active, activeKeys, pairs, slate, requireAll, mScore, marketKey])

  const shown = useMemo(() => {
    const q = query.toLowerCase().trim()
    return q ? anchors.filter((a) => a.name.toLowerCase().includes(q)) : anchors
  }, [anchors, query])

  if (!pairs.length) return null
  if (!anchors.length) {
    return (
      <div style={{ fontSize: 11.5, color: C.text3, padding: '10px 0' }}>
        Nobody in the pair history is on tonight&apos;s slate, so there&apos;s nothing to build from.
      </div>
    )
  }

  const multi = active.length > 1
  const sharedByAll = partners.filter((p) => p.all).length

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>Pair Builder</div>
      <div style={{ fontSize: 10.5, color: C.text3, marginBottom: 9, lineHeight: 1.55, maxWidth: 660 }}>
        Click hitters to add them — <b style={{ color: C.text2 }}>you can select several</b>. Partners
        are everyone your selection has homered with who is also playing tonight, ranked on a fit
        that is <b style={{ color: C.text2 }}>weighted toward tonight</b> — history per pair is a
        handful of days across a whole season, which is not enough to lead with. Click a selected
        hitter again to drop him.
      </div>

      {/* The market — which outcome this pair is FOR. Changes the score that
          ranks everything; each leg needs {mkt.needs}. */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 9, alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em' }}>Market</span>
        {MARKETS.map((x) => (
          <button
            key={x.key}
            onClick={() => setMarketKey(x.key)}
            style={{
              padding: '4px 11px', borderRadius: 7, cursor: 'pointer',
              fontSize: 10.5, fontWeight: 700,
              border: `1px solid ${marketKey === x.key ? C.orange : C.border}`,
              background: marketKey === x.key ? 'rgba(249,115,22,.12)' : 'transparent',
              color: marketKey === x.key ? C.orange : C.text3,
            }}
          >{x.label}</button>
        ))}
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          each leg needs {mkt.needs}
        </span>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find any hitter on tonight's slate…"
        style={{
          width: '100%', maxWidth: 300, background: C.bg2, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: '6px 11px', fontSize: 12, color: C.text,
          outline: 'none', fontFamily: NUM_FONT, marginBottom: 8,
        }}
      />

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
        {shown.slice(0, 60).map((a) => {
          const on = activeKeys.has(a.key)
          const implicit = on && !anchorKeys.length
          return (
            <button
              key={a.key}
              onClick={() => toggleAnchor(a.key)}
              title={implicit ? 'Shown by default — click another hitter to choose your own' : (on ? 'Click to remove' : 'Click to add')}
              style={{
                padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
                fontSize: 11, fontWeight: 700,
                border: `1px solid ${on ? C.orange : C.border}`,
                background: on ? 'rgba(249,115,22,.12)' : C.bg2,
                color: on ? C.orange : C.text2,
                opacity: implicit ? 0.8 : 1,
              }}
            >
              {on && !implicit ? '✓ ' : ''}{a.name}
              <span style={{ color: C.text3, fontFamily: NUM_FONT, marginLeft: 5, fontSize: 10 }}>
                {mScore(a.today).toFixed(0)}
              </span>
              {!a.hasHistory && (
                <span title="No co-HR history on file — selectable, but he contributes no partners"
                  style={{ color: C.text3, marginLeft: 4, fontSize: 9 }}>·</span>
              )}
            </button>
          )
        })}
      </div>

      <div style={{ fontSize: 9.5, color: C.text3, marginBottom: 8, lineHeight: 1.5 }}>
        Every hitter on tonight&apos;s slate is selectable. A small <b style={{ color: C.text2 }}>·</b> after
        the score means he has no co-HR history on file — {anchors.filter((a) => !a.hasHistory).length} of{' '}
        {anchors.length} tonight. He can still be an anchor; he just brings no partners of his own,
        so in a multi-select he narrows nothing. Use the search to reach anyone not shown.
      </div>

      {anchorKeys.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
          <button
            onClick={() => setAnchorKeys([])}
            style={{
              padding: '3px 9px', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700,
              border: `1px solid ${C.border}`, background: 'transparent', color: C.text3, fontFamily: NUM_FONT,
            }}
          >Clear selection</button>
          {multi && (
            <button
              onClick={() => setRequireAll((v) => !v)}
              style={{
                padding: '3px 9px', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700,
                fontFamily: NUM_FONT,
                border: `1px solid ${requireAll ? C.orange : C.border}`,
                background: requireAll ? 'rgba(249,115,22,.12)' : 'transparent',
                color: requireAll ? C.orange : C.text3,
              }}
            >Shared by all {active.length} only</button>
          )}
        </div>
      )}

      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.orange}`,
        borderRadius: 12, padding: '11px 15px', marginBottom: 12,
      }}>
        <div style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Building around {active.length > 1 ? `${active.length} hitters` : ''}
        </div>
        <div style={{ fontSize: multi ? 14 : 17, fontWeight: 800, margin: '2px 0 2px' }}>
          {active.map((a) => a.name).join('  +  ')}
        </div>
        <div style={{ fontSize: 11, color: C.text2, fontFamily: NUM_FONT, lineHeight: 1.6 }}>
          {active.map((a) => (
            <div key={a.key}>
              {a.name} — {teamOf(a.today)} vs {oppOf(a.today)} · {clean(a.today?.pitcher_name, 'TBD')} · {mkt.short} {mScore(a.today).toFixed(1)}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.text2, fontFamily: NUM_FONT, marginTop: 4 }}>
          {partners.length} partner{partners.length === 1 ? '' : 's'} playing tonight
          {multi && <> · <b style={{ color: sharedByAll ? C.orange : C.text3 }}>{sharedByAll}</b> shared by all {active.length}</>}
          {' '}· {partners.filter((p) => p.sameGame > 0).length} with same-game history
        </div>
      </div>

      {!partners.length ? (
        <div style={{ fontSize: 11.5, color: C.text3 }}>
          {multi && requireAll
            ? `No single hitter on tonight's slate shares history with all ${active.length} of them. Turn off "shared by all" to see partial matches.`
            : `None of ${active.map((a) => a.name).join(' / ')}'s historical partners are on tonight's slate.`}
        </div>
      ) : (
        <>
          <Heatmap
            rows={partners.slice(0, 15).map((p) => ({
              label: multi ? `${p.name} (${p.matched}/${active.length})` : p.name,
              _raw: p._raw,
              values: {
                Fit: p.fit,
                ...(multi ? { Anchors: p.matched } : {}),
                [`${mkt.short} tonight`]: p.hr,
                'Same game': p.sameGame,
                'Shared days': p.days,
                'Days since': p.since == null ? null : Math.max(0, 30 - Math.min(30, p.since)),
                'Opp HR/9': p.hr9 * 30,
              },
            }))}
            columns={['Fit', ...(multi ? ['Anchors'] : []), `${mkt.short} tonight`, 'Same game', 'Shared days', 'Days since', 'Opp HR/9']}
            title={`Best partners for ${active.map((a) => a.name).join(' + ')} tonight`}
            labelWidth={multi ? 178 : 150}
            onRowClick={onPlayerClick ? (r) => r._raw && onPlayerClick(r._raw) : null}
            caption={`Days since is flipped so a recent pairing reads bright. Opp HR/9 is ×30 to share the scale. Same game is the only column that means the two were actually in the same ballpark.${multi ? ' Anchors is how many of your selected hitters this partner has history with — Fit is the mean across those, so it is not inflated by matching more of them.' : ''}`}
          />

          <DenseTable
            rows={partners}
            columns={[
              { key: 'name',     label: 'Partner', heat: false, w: 148, bold: true, sticky: true },
              ...(multi ? [
                { key: 'matched', label: 'Anchors', w: 52,
                  title: 'How many of your selected hitters this partner shares history with' },
                { key: 'with',    label: 'With',    heat: false, w: 128, dim: true },
              ] : []),
              { key: 'team',     label: 'Tm',      heat: false, w: 34, mono: true, dim: true },
              { key: 'opp',      label: 'Opp',     heat: false, w: 34, mono: true, dim: true },
              { key: 'pitcher',  label: 'Facing',  heat: false, w: 132, dim: true },
              { key: 'weak',     label: '★',       flag: true, mark: '★', w: 30 },
              { key: 'fit',      label: 'Fit',     w: 46, dp: 1 },
              { key: 'hr',       label: mkt.short, w: 44, dp: 1,
                title: `Tonight's ${mkt.label} score — the market you picked above` },
              { key: 'sameGame', label: 'Same gm', w: 50 },
              { key: 'days',     label: 'Shared',  w: 46 },
              { key: 'since',    label: 'Days ago', w: 50,
                invert: true, fmt: (v) => (v == null ? '—' : String(v)) },
              { key: 'boost',    label: 'Boost',   w: 46 },
              { key: 'pairScore', label: 'Pair',   w: 46 },
              { key: 'hr9',      label: 'Opp HR/9', w: 50, dp: 2 },
            ]}
            onRowClick={onPlayerClick}
            initialSort={multi ? 'matched' : 'fit'}
            maxHeight={400}
            caption={`Days ago is inverted — a pairing that hit last week is live, one from March is noise. Fit is 55% tonight's ${mkt.label} score, 25% same-game history, 10% shared days, 10% recency.${mkt.key !== 'hr' ? ` One honest note on the ${mkt.label} market: the history columns still count days these two HOMERED together, because co-HR days are the only pair history the bot publishes — tonight's score is on your market, the history is not.` : ''}${multi ? ' With multiple anchors, Same gm / Shared / Boost are summed across the anchors this partner matched, and Days ago is the most recent of them.' : ''}`}
          />
        </>
      )}
    </div>
  )
}
