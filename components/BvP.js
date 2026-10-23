'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { bvpSplits } from '../lib/situational'
import { ContactStrip, toLogRow } from './tabs/EVLog'

// BATTER vs PITCHER — the head-to-head, live from the API.
//
// This was deliberately left off the site during the PropFinder teardown,
// because BvP is the most over-quoted number in baseball: 3-for-7 lifetime is
// a coin flip wearing a batting average. It's here now because the user asked
// and because hidden data is worse than caveated data — but the panel grades
// its own sample size and says so out loud. Under 10 PA the verdict line
// literally calls it noise.
//
// Career block from vsPlayerTotal (or summed client-side when they first met
// this year), season chips underneath when there's more than one.

const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0)

function Stat({ label, value, strong }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 40 }}>
      <div style={{ fontSize: 7.5, color: C.text3, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>{label}</div>
      <div style={{ fontFamily: NUM_FONT, fontSize: 14, fontWeight: 900, color: strong ? C.orange : C.text }}>{value}</div>
    </div>
  )
}

// Loose name matching for spray rows: statcast writes "Last, First", the
// slate writes "First Last" — token sets, lowercased, accents stripped.
const nameTokens = (s) => new Set(
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((t) => t.length > 1),
)
const sameName = (a, b) => {
  const ta = nameTokens(a), tb = nameTokens(b)
  if (!ta.size || !tb.size) return false
  let hit = 0
  ta.forEach((t) => { if (tb.has(t)) hit++ })
  return hit >= Math.min(ta.size, tb.size)
}

// One ball off him, in a line: when, the pitch, how hard, what it became.
function BallLine({ r }) {
  const hot = r.hr || r.barrel
  // Two lines so nothing is cut off on a phone: when + what it became, then
  // the pitch and the contact.
  return (
    <div style={{ fontSize: 11, fontFamily: NUM_FONT, padding: '6px 0', borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: C.text3 }}>{r.date}</span>
        <span style={{ color: hot ? C.orange : r.k ? C.text3 : C.text2, fontWeight: hot ? 900 : 700, textTransform: 'capitalize' }}>
          {r.k ? 'strikeout' : r.result || r.traj}
        </span>
      </div>
      <div style={{ color: C.text2, marginTop: 2 }}>
        {r.pitch}{r.velo ? ` ${r.velo.toFixed(0)} mph` : ''}
        {r.k ? '' : <> · <b style={{ color: r.hard ? C.orange : C.text }}>{r.ev ? `${r.ev.toFixed(1)} EV` : 'no EV'}</b>{r.la != null ? ` · ${Math.round(r.la)}°` : ''}{r.dist ? ` · ${Math.round(r.dist)} ft` : ''}</>}
      </div>
    </div>
  )
}

export default function BvP({ batterId, pitcherId, pitcherName, player }) {
  const [data, setData] = useState(undefined)
  // THE MATCHUP'S OWN EV LOG (2026-10-01, Donovan: "it can tell me more
  // stats just like the ev log about the pitcher batter matchup"): every
  // Statcast pitch this batter has seen from this pitcher since 2015, live
  // from Savant (lib/savant.js matchup mode), in the EV Log's row shape and
  // stat strip. undefined = loading, [] = none / unreachable.
  const [career, setCareer] = useState(undefined)
  const [allBalls, setAllBalls] = useState(false)
  useEffect(() => {
    let alive = true
    setCareer(undefined); setAllBalls(false)
    if (!batterId || !pitcherId) { setCareer([]); return undefined }
    import('../lib/savant').then(({ savantBattedBalls }) => savantBattedBalls(batterId, { pitcherId, career: true }))
      .then((rows) => { if (alive) setCareer(rows || []) })
      .catch(() => { if (alive) setCareer([]) })
    return () => { alive = false }
  }, [batterId, pitcherId])

  useEffect(() => {
    let alive = true
    setData(undefined)
    bvpSplits(batterId, pitcherId).then((d) => { if (alive) setData(d) })
    return () => { alive = false }
  }, [batterId, pitcherId])

  if (!pitcherId) return null
  // No data, show nothing (Donovan 2026-10-07): while it loads, and when they have never met,
  // there is no box at all -- a header and an apology are scroll for no information.
  if (data === undefined || !data?.total) return null

  const t = data.total
  const pa = num(t.plateAppearances)
  const hr = num(t.homeRuns)

  // CONTACT QUALITY vs him — the results above say what happened; this says
  // how the contact LOOKED. From the player's own tracked-ball log (season-
  // long once the bot's spray window ships), filtered to balls hit off THIS
  // pitcher by name. BBE / hard-hit / barrels / EV — the stuff a 3-for-7
  // can't tell you.
  const log = player?.batted_ball_log || player?.spray_chart || []
  const vsHim = pitcherName ? log.filter((h) => sameName(h.pitcher || h.pitcher_name, pitcherName)) : []
  // #61: does the per-season row add up to the head-to-head total it sits
  // under? If not, the chips are not a breakdown of it and must not be
  // presented as one.
  const seasonAb = (data.seasons || []).reduce((acc, s2) => acc + num(s2?.stat?.atBats), 0)
  // Newest first: the career pull when it came back with anything, else his
  // recent log's balls off this pitcher (the old source).
  const fromCareer = Array.isArray(career) && career.length > 0
  const contactRows = (fromCareer ? career : vsHim).map(toLogRow)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
  const small = pa < 10
  const verdict = small
    ? `${pa} PA is noise, not a scouting report — color only.`
    : pa < 25
      ? `${pa} PA — enough to notice, not enough to bet on by itself.`
      : `${pa} PA — a real sample by BvP standards, and BvP standards are low.`

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.03))`,
      border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 13px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>⚔ vs {pitcherName || 'tonight’s starter'}</span>
        <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>career vs this pitcher</span>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Stat label="PA" value={pa} />
        <Stat label="H/AB" value={`${num(t.hits)}/${num(t.atBats)}`} />
        <Stat label="AVG" value={t.avg ?? '—'} />
        {t.ops != null && <Stat label="OPS" value={t.ops} />}
        <Stat label="HR" value={hr} strong={hr > 0} />
        <Stat label="TB" value={num(t.totalBases)} />
        <Stat label="BB" value={num(t.baseOnBalls)} />
        {pa > 0 && <Stat label="BB%" value={`${((100 * num(t.baseOnBalls)) / pa).toFixed(1)}%`} />}
        <Stat label="K" value={num(t.strikeOuts)} />
      </div>

      {/* CONTACT VS HIM: the EV Log's strip over every ball he's hit off
          this pitcher (Statcast, 2015 on). Falls back to the balls on his own
          recent log when Savant can't be reached. */}
      {contactRows.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px dashed ${C.border2}` }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: C.text, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 900 }}>
              Contact vs him
            </span>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
              {fromCareer ? 'every Statcast game since 2015, postseason included' : 'from his recent tracked balls'} · how the contact looked, not just what it counted for
            </span>
          </div>
          <ContactStrip rows={contactRows} suffix={fromCareer ? 'off him since 2015' : 'off him, recent log'} />
          <div>
            {(allBalls ? contactRows : contactRows.slice(0, 5)).map((r) => <BallLine key={r._key} r={r} />)}
          </div>
          {contactRows.length > 5 && (
            <button type="button" onClick={() => setAllBalls((v) => !v)}
              style={{ marginTop: 6, minHeight: 44, padding: '0 14px', borderRadius: 3, cursor: 'pointer', font: 'inherit',
                fontSize: 12, fontWeight: 800, color: C.orange, background: 'transparent', border: `1px solid ${C.border2}` }}>
              {allBalls ? 'Show the last 5' : `+${contactRows.length - 5} more off him`}
            </button>
          )}
        </div>
      )}
      {career === undefined && (
        <div style={{ fontSize: 10, color: C.text3, marginTop: 8, fontFamily: NUM_FONT }}>Pulling every ball he&apos;s hit off him…</div>
      )}

      {/* ── #61: THE CHIPS HAD NO HEADING AND DID NOT ALWAYS RECONCILE ─────
          The card's headline is "career head-to-head" with a line reading
          PA 9 · 5/8 · .625, and directly under it ran a row of unlabelled
          year chips -- 2023 through 2026, entries like "2024: 2/10 · 3K" --
          adding to far more at-bats than the head-to-head has. A reader takes
          a row of chips under a head-to-head total as that total broken down
          by year, and if the numbers don't add up, one of the two is wrong.
          They are now headed, so it is clear what they are; and the card
          checks its own arithmetic and says so when the two disagree, rather
          than letting the reader do the subtraction and lose trust in both. */}
      {data.seasons.length > 1 && (
        <div style={{ marginTop: 9, paddingTop: 8, borderTop: `1px dashed ${C.border2}` }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 8, color: C.text3, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>
              By season
            </span>
            {seasonAb > num(t.atBats) ? (
              <span style={{ fontSize: 8.5, color: C.orange, lineHeight: 1.4 }}>
                {seasonAb} at-bats across these years against {num(t.atBats)} in the head-to-head above — so these
                are the seasons themselves, not this matchup broken down. Read them as when, not as against whom.
              </span>
            ) : (
              <span style={{ fontSize: 8.5, color: C.text3 }}>the head-to-head above, year by year</span>
            )}
          </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {data.seasons.map((s) => (
            <span key={s.season} style={{
              fontSize: 9, fontFamily: NUM_FONT, color: C.text3,
              border: `1px solid ${C.border}`, borderRadius: 3, padding: '2px 8px',
            }}>
              {s.season}: {num(s.stat.hits)}/{num(s.stat.atBats)}
              {num(s.stat.homeRuns) > 0 && <b style={{ color: C.orange }}> · {num(s.stat.homeRuns)} HR</b>}
              {num(s.stat.strikeOuts) > 0 && ` · ${num(s.stat.strikeOuts)}K`}
            </span>
          ))}
        </div>
        </div>
      )}

      <div style={{ fontSize: 8.5, color: small ? C.orange : C.text3, marginTop: 7, lineHeight: 1.5 }}>
        {verdict} The splits below (arm side, zones, pitch mix) are built on hundreds of pitches —
        when they disagree with this box, trust them.
      </div>
    </div>
  )
}

// ── VS HIM, IN THE EV LOG'S BOX (2026-10-23, Donovan: "add the verse picture with the EV log ... form fitted together, or at
// least like a toggle, so that way you can just see that real quick ... that can be removed from the pitches") ──────────────
// The card's EV log panel toggles to this: tonight's pitcher's face and name, his line against him in one row of tiles, then
// every ball he's hit off him (Statcast since 2015) in the EV log's own table. Few words: the sample size IS the caveat, so
// it's printed as a number (PA) and greyed under 10.
export function VsHimLog({ batterId, pitcherId, pitcherName, pitcherHand = null, face = null }) {
  const [data, setData] = useState(undefined)
  const [career, setCareer] = useState(undefined)
  const [Log, setLog] = useState(null)
  useEffect(() => {
    let alive = true
    setData(undefined); setCareer(undefined)
    if (!batterId || !pitcherId) { setData(null); setCareer([]); return undefined }
    bvpSplits(batterId, pitcherId).then((d) => { if (alive) setData(d || null) })
    import('../lib/savant').then(({ savantBattedBalls }) => savantBattedBalls(batterId, { pitcherId, career: true }))
      .then((rows) => { if (alive) setCareer(rows || []) }).catch(() => { if (alive) setCareer([]) })
    import('./tabs/EVLog').then((m) => { if (alive) setLog(() => m.BlendedLog) })
    return () => { alive = false }
  }, [batterId, pitcherId])
  if (!pitcherId) return <div style={{ fontSize: 11, color: C.text3, padding: '10px 0' }}>No starter named for tonight yet.</div>
  const t = data?.total || null
  const pa = num(t?.plateAppearances)
  const thin = pa < 10
  const tiles = t ? [
    ['PA', pa], ['H/AB', `${num(t.hits)}/${num(t.atBats)}`], ['AVG', t.avg ?? '—'], ['OPS', t.ops ?? '—'],
    ['HR', num(t.homeRuns)], ['K', num(t.strikeOuts)], ['BB', num(t.baseOnBalls)],
  ] : []
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, minWidth: 0 }}>
        {face && <img src={face} alt="" width={40} height={40} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', background: C.bg3 || C.bg2, border: `1px solid ${C.border2}`, flexShrink: 0 }} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>vs {pitcherName || 'tonight’s starter'}{pitcherHand ? <span style={{ color: C.text3, fontWeight: 700, fontFamily: NUM_FONT, fontSize: 11 }}> {pitcherHand}HP</span> : null}</div>
          <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>career · {data === undefined ? 'loading…' : t ? (thin ? `${pa} PA · a small sample` : `${pa} PA`) : 'they haven’t met'}</div>
        </div>
      </div>
      {tiles.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))`, gap: 4, marginBottom: 10 }}>
          {tiles.map(([k, v]) => (
            <div key={k} style={{ textAlign: 'center', padding: '4px 2px', borderRadius: 7, border: `1px solid ${k === 'HR' && Number(v) > 0 ? C.orange : C.border}`, background: 'rgba(255,255,255,.03)', minWidth: 0 }}>
              <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, letterSpacing: '.05em' }}>{k}</div>
              <div style={{ fontSize: 13, fontWeight: 800, fontFamily: NUM_FONT, color: thin ? C.text2 : (k === 'HR' && Number(v) > 0 ? C.orange : C.text) }}>{v}</div>
            </div>
          ))}
        </div>
      )}
      {career === undefined || !Log
        ? <div style={{ fontSize: 11, color: C.text3, padding: '6px 0' }}>Pulling every ball he’s hit off him…</div>
        : <Log balls={career} keepYear title={`${career.length} result${career.length === 1 ? '' : 's'} off him since 2015 · newest first`} empty="No tracked balls off him." />}
    </div>
  )
}
