'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { arr, obj, n, clean, nameOf, teamOf, oppOf, hrScore } from '../lib/player'
import Heatmap from './Heatmap'
import DenseTable from './DenseTable'

// Pair Builder — pick one hitter, get his partners for tonight.
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

const key = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

export default function PairBuilder({ summary, players = [], onPlayerClick }) {
  const [anchorKey, setAnchorKey] = useState(null)
  const [query, setQuery] = useState('')

  const pairs = arr(obj(summary).top_pairs)

  // Slate rows keyed by normalised name, so history names match tonight's.
  const slate = useMemo(() => {
    const m = new Map()
    players.forEach((p) => {
      const k = key(nameOf(p))
      if (k && !m.has(k)) m.set(k, p)
    })
    return m
  }, [players])

  // Everyone who appears in the history AND is playing tonight. A partner who
  // isn't on today's slate can't be bet, so he isn't offered.
  const anchors = useMemo(() => {
    const seen = new Map()
    pairs.forEach((pr) => {
      arr(pr?.players).forEach((pl) => {
        const k = key(pl?.name)
        if (!k || seen.has(k)) return
        const today = slate.get(k)
        if (!today) return
        seen.set(k, { key: k, name: clean(pl?.name, ''), team: clean(pl?.team, ''), today })
      })
    })
    return [...seen.values()].sort((a, b) => hrScore(b.today) - hrScore(a.today))
  }, [pairs, slate])

  const anchor = useMemo(
    () => anchors.find((a) => a.key === anchorKey) || anchors[0] || null,
    [anchors, anchorKey],
  )

  const partners = useMemo(() => {
    if (!anchor) return []
    const out = []
    pairs.forEach((pr) => {
      const ps = arr(pr?.players)
      if (!ps.some((x) => key(x?.name) === anchor.key)) return
      const other = ps.find((x) => key(x?.name) !== anchor.key)
      if (!other) return
      const k = key(other?.name)
      const today = slate.get(k)
      if (!today) return // not playing tonight

      const days = n(pr?.repeat_count, 0)
      const sameGame = n(pr?.same_game_hr_count, 0)
      const since = n(pr?.days_since_last_hit, 99)
      const hr = hrScore(today)

      // Weighted toward tonight on purpose. Same-game history counts for five
      // times a shared date, because only the same-game version is correlated.
      const fit =
        hr * 0.55 +
        Math.min(40, sameGame * 12) * 0.25 +
        Math.min(30, days * 2.5) * 0.10 +
        Math.max(0, 30 - Math.min(30, since)) * 0.10

      out.push({
        _key: k,
        _raw: today,
        name: clean(other?.name, ''),
        team: teamOf(today) || clean(other?.team, ''),
        opp: oppOf(today),
        pitcher: clean(today?.pitcher_name, 'TBD'),
        fit,
        hr,
        sameGame,
        days,
        since: since >= 99 ? null : since,
        boost: n(pr?.history_boost, 0),
        pairScore: n(pr?.pair_score, 0),
        weak: today?.weak_spot_flag ? 1 : 0,
        hr9: n(today?.pitcher_hr9, 0),
      })
    })
    return out.sort((a, b) => b.fit - a.fit)
  }, [anchor, pairs, slate])

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

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>Pair Builder</div>
      <div style={{ fontSize: 10.5, color: C.text3, marginBottom: 9, lineHeight: 1.55, maxWidth: 640 }}>
        Pick a hitter. Partners are everyone he has ever homered with who is also playing tonight,
        ranked on a fit that is <b style={{ color: C.text2 }}>weighted toward tonight</b> — history
        per pair is a handful of days across a whole season, which is not enough to lead with.
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find your anchor hitter…"
        style={{
          width: '100%', maxWidth: 300, background: C.bg2, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: '6px 11px', fontSize: 12, color: C.text,
          outline: 'none', fontFamily: NUM_FONT, marginBottom: 8,
        }}
      />

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
        {shown.slice(0, 24).map((a) => {
          const on = anchor?.key === a.key
          return (
            <button
              key={a.key}
              onClick={() => setAnchorKey(a.key)}
              style={{
                padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
                fontSize: 11, fontWeight: 700,
                border: `1px solid ${on ? C.orange : C.border}`,
                background: on ? 'rgba(249,115,22,.12)' : C.bg2,
                color: on ? C.orange : C.text2,
              }}
            >
              {a.name}
              <span style={{ color: C.text3, fontFamily: NUM_FONT, marginLeft: 5, fontSize: 10 }}>
                {hrScore(a.today).toFixed(0)}
              </span>
            </button>
          )
        })}
      </div>

      {anchor && (
        <div style={{
          background: C.bg2, border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.orange}`,
          borderRadius: 12, padding: '11px 15px', marginBottom: 12,
        }}>
          <div style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Building around
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, margin: '2px 0 2px' }}>
            {anchor.name}
            <span style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT, fontWeight: 600, marginLeft: 8 }}>
              {teamOf(anchor.today)} vs {oppOf(anchor.today)} · {clean(anchor.today?.pitcher_name, 'TBD')}
            </span>
          </div>
          <div style={{ fontSize: 11, color: C.text2, fontFamily: NUM_FONT }}>
            HR {hrScore(anchor.today).toFixed(1)} · {partners.length} partner
            {partners.length === 1 ? '' : 's'} playing tonight ·{' '}
            {partners.filter((p) => p.sameGame > 0).length} with same-game history
          </div>
        </div>
      )}

      {!partners.length ? (
        <div style={{ fontSize: 11.5, color: C.text3 }}>
          None of {anchor?.name}&apos;s historical partners are on tonight&apos;s slate.
        </div>
      ) : (
        <>
          <Heatmap
            rows={partners.slice(0, 15).map((p) => ({
              label: p.name,
              _raw: p._raw,
              values: {
                Fit: p.fit,
                'HR tonight': p.hr,
                'Same game': p.sameGame,
                'Shared days': p.days,
                'Days since': p.since == null ? null : Math.max(0, 30 - Math.min(30, p.since)),
                'Opp HR/9': p.hr9 * 30,
              },
            }))}
            columns={['Fit', 'HR tonight', 'Same game', 'Shared days', 'Days since', 'Opp HR/9']}
            title={`Best partners for ${anchor?.name} tonight`}
            labelWidth={150}
            onRowClick={onPlayerClick ? (r) => r._raw && onPlayerClick(r._raw) : null}
            caption="Days since is flipped so a recent pairing reads bright. Opp HR/9 is ×30 to share the scale. Same game is the only column that means the two were actually in the same ballpark."
          />

          <DenseTable
            rows={partners}
            columns={[
              { key: 'name',     label: 'Partner', heat: false, w: 148, bold: true, sticky: true },
              { key: 'team',     label: 'Tm',      heat: false, w: 34, mono: true, dim: true },
              { key: 'opp',      label: 'Opp',     heat: false, w: 34, mono: true, dim: true },
              { key: 'pitcher',  label: 'Facing',  heat: false, w: 132, dim: true },
              { key: 'weak',     label: '★',       flag: true, mark: '★', w: 30 },
              { key: 'fit',      label: 'Fit',     w: 46, dp: 1 },
              { key: 'hr',       label: 'HR',      w: 44, dp: 1 },
              { key: 'sameGame', label: 'Same gm', w: 50 },
              { key: 'days',     label: 'Shared',  w: 46 },
              { key: 'since',    label: 'Days ago', w: 50,
                invert: true, fmt: (v) => (v == null ? '—' : String(v)) },
              { key: 'boost',    label: 'Boost',   w: 46 },
              { key: 'pairScore', label: 'Pair',   w: 46 },
              { key: 'hr9',      label: 'Opp HR/9', w: 50, dp: 2 },
            ]}
            onRowClick={onPlayerClick}
            initialSort="fit"
            maxHeight={400}
            caption="Days ago is inverted — a pairing that hit last week is live, one from March is noise. Fit is 55% tonight's HR score, 25% same-game history, 10% shared days, 10% recency."
          />
        </>
      )}
    </div>
  )
}
