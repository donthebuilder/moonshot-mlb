'use client'
import { useEffect, useState, useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import DenseTable from '../DenseTable'
import MixDuel from '../MixDuel'
import { pitcherDetailUrl } from '../../lib/dataSource'

// COLOUR NOTE. This page ran a green/red good-bad scale and a per-pitch rainbow
// until now — its own footer read "Green = favorable for batter, Red =
// unfavorable". Every other board here is the orange ramp, where brightness is
// magnitude and bright always means good for the hitter. Two colour languages
// on one site means neither gets learned, and a green cell here meant the
// opposite of a green cell nowhere else, because nowhere else has one.
//
// REDESIGN 2026-08-09 (owner: "it's wack and unusable — fix it all in
// general"). Three things were wrong and they compounded:
//
//   1. EIGHTEEN COLUMNS AT ONCE. Every cell heat-tinted, so the whole panel
//      lit up and none of it ranked. Split into two views you pick between —
//      Damage (did he hurt it) and Shape (how he hits it) — with Everything
//      still one click away for anyone who wants the wall back.
//   2. NO SAMPLE GATE. A 1.000 BA on five pitches sat next to a .268 on 218
//      wearing the brighter cell, because 1.000 > .268. Rows under 10 batted
//      balls now render dimmed with their rates in parentheses, and the
//      caption says so. Parentheses mean "this is a number, not a finding".
//   3. TWO UNLABELLED "vs" TOGGLES stacked three inches apart, one flipping
//      the pitcher's split and one the batter's, both just saying "vs". They
//      are one labelled control row now.
//
// And the panel leads with a plain-language read, so the answer arrives before
// the table does.

const PITCH_NAMES = {
  FF:'4-Seam',SI:'Sinker',FC:'Cutter',SL:'Slider',CU:'Curveball',
  KC:'K-Curve',CH:'Changeup',FS:'Splitter',KN:'Knuckleball',ST:'Sweeper',
  SV:'Slurve',FA:'Fastball',EP:'Eephus',FO:'Forkball',CS:'Slow curve',
}

// THE GATE. Ten balls in play is not a lot — it is simply the point below
// which a rate is mostly the last swing. Everything under it is shown, kept
// sortable, and marked as thin rather than hidden: a hitter who has seen a
// pitch four times is information, the .500 he ran on it is not.
const MIN_BBE = 10

const pitchLabel = (pt) => PITCH_NAMES[pt] || pt

function SegGroup({children}) {
  return <div style={{display:'flex',borderRadius:6,overflow:'hidden',border:`1px solid ${C.border2}`,flexShrink:0}}>{children}</div>
}
function Seg({active,onClick,children,title}) {
  return (
    <button onClick={onClick} title={title} style={{
      padding:'3px 9px',fontSize:10,fontWeight:700,cursor:'pointer',border:'none',
      background:active?C.orange:'transparent',
      color:active?'#1a0d02':C.text3,
      fontFamily:NUM_FONT,
    }}>{children}</button>
  )
}

// One labelled control, used twice — the fix for the two bare "vs" rows.
function SplitControl({ label, hint, value, options, onChange, flag }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
      <span style={{ fontSize:9, color:C.text3, fontWeight:800, textTransform:'uppercase', letterSpacing:'.05em' }}>
        {label}
      </span>
      <SegGroup>
        {options.map((o) => (
          <Seg key={o.key} active={value === o.key} onClick={() => onChange(o.key)} title={o.title}>{o.label}</Seg>
        ))}
      </SegGroup>
      {flag && <span style={{ fontSize:9.5, color:C.orange, fontWeight:800, fontFamily:NUM_FONT }}>{flag}</span>}
      {hint && <span style={{ fontSize:9, color:C.text3 }}>{hint}</span>}
    </div>
  )
}

// The two column sets. Pitch / ★ / Use% / BBE ride in both because they are
// the row's identity and its denominator, not findings of their own.
const VIEWS = [
  { key:'damage', label:'Damage', blurb:'did he hurt it — outcomes and contact quality' },
  { key:'shape',  label:'Shape & discipline', blurb:'how the contact leaves, and whether he swings at it' },
  { key:'all',    label:'Everything', blurb:'all eighteen columns, the old wall' },
]

// ── THIS TAB WAS READING FIELDS THAT ARE NOT IN THE PAYLOAD (2026-09-03) ────
//
// Found while auditing what the bot publishes against what the site asks for.
// Measured on the live slate (160 rows) the site actually loads:
//
//   batter_pitch_type_profile          0/160
//   pitcher_pitch_mix_vs_lhb / _rhb    0/160
//   pitcher_pitch_arsenal_detail       0/160
//   pitcher_pitch_type_summary_vs_lhb  0/160
//   pitcher_pitch_type_summary_vs_rhb  0/160
//
// Not a bot bug. `bots/make_slim.py` drops the heavy nested logs out of the
// slate JSON -- they were 49 of its 50 MB -- and writes them to per-player
// detail files instead. Every other consumer was updated to fetch those
// (SprayField, MatchupPitcher, PitcherProfile, the EV log). This one was not,
// so it kept reading the row and getting undefined.
//
// The effect: BOTH halves of the tab were dead. `hasBotProfile` could never be
// true, so the batter's own pitch profile always fell through; and the
// vs-LHB / vs-RHB pitcher views had a fallback chain whose every branch was a
// dropped key, so switching hand did nothing. Only the overall pitcher summary
// worked, because `pitcher_pitch_type_summary` (no hand) is the one that stays
// on the row -- 160/160.
//
// `detail` is the batter file PlayerModal has already fetched; passing it in
// costs no request. The pitcher file is fetched here, the same way
// MatchupPitcher and PitcherProfile fetch it -- one file per starter, shared
// across his whole lineup, and the browser caches it.
//
// STILL OWED ON THE BOT SIDE, and it is small: pitcher_pitch_type_summary_vs_
// lhb / _rhb are in make_slim's DROP_KEYS but in NEITHER detail list, so they
// are computed and then thrown away entirely. The fallback below recovers the
// same numbers from pitcher_pitch_mix_vs_*.pitch_type_summary, which the
// detail file does carry, so nothing is missing on screen -- but the first
// branch of that chain can never fire and should either be published or
// deleted from the bot.
export default function PitchBreakdown({ player, detail = null }) {
  const [pdetail, setPdetail] = useState(null)
  const pitcherId = player?.pitcher_id
  useEffect(() => {
    let alive = true
    setPdetail(null)
    if (!pitcherId) return undefined
    fetch(pitcherDetailUrl(pitcherId))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setPdetail(j) })
      .catch(() => { /* the overall summary on the row still renders */ })
    return () => { alive = false }
  }, [pitcherId])

  // One place to ask "row, then batter detail, then pitcher detail", so no
  // reader below has to know which file a field ended up in.
  const src = (k) => player?.[k] ?? detail?.[k] ?? pdetail?.[k] ?? undefined

  // Auto-default each toggle to what's actually relevant for this matchup,
  // instead of always landing on "All" and making the person click twice.
  const initialHand = player?.bats === 'L' ? 'L' : player?.bats === 'R' ? 'R' : 'ALL'
  const initialBatterVs = player?.pitcher_throws === 'L' ? 'L' : player?.pitcher_throws === 'R' ? 'R' : 'ALL'
  const [hand, setHand] = useState(initialHand)          // pitcher's numbers vs this batter side
  const [batterVs, setBatterVs] = useState(initialBatterVs) // batter's numbers vs this arm side
  const [view, setView] = useState('damage')

  // Fetched only when the published profile is empty — the same pull the EV
  // Log makes, and lib/savant.js caches per player id, so opening both tabs
  // on one hitter costs one request, not two.
  const pidKey = player?.player_id || player?.id
  const hasBotProfile = !!Object.keys(src('batter_pitch_type_profile')?.by_pitch || {}).length
  const [liveLog, setLiveLog] = useState(null)
  useEffect(() => {
    if (hasBotProfile || !pidKey) { setLiveLog(null); return undefined }
    let alive = true
    import('../../lib/savant')
      .then(({ savantBattedBalls }) => savantBattedBalls(pidKey))
      .then((rows) => { if (alive) setLiveLog(rows || []) })
      .catch(() => { if (alive) setLiveLog([]) })
    return () => { alive = false }
  }, [pidKey, hasBotProfile])

  // ── 🔴 LIVE STATCAST FALLBACK FOR THE PITCH PROFILE (2026-08-29) ─────────
  // Donovan: a hitter at #146 of tonight's 303 showed "No pitch-type profile
  // published ... nothing to break down here", while the EV Log one tab over
  // pulled 335 batted balls live from Savant for the same man. His words:
  // "all stats and spray chart, ev and pitch log should come up ... still
  // should have a tag as not on the bot, but all the stats need to be shown."
  //
  // WHAT THIS FALLBACK CAN AND CANNOT DO, and why the difference is drawn
  // exactly here: Savant's batted-ball export is BALLS PUT IN PLAY. From it,
  // per pitch type, we can honestly count balls in play, home runs, exit
  // velocity, hard-hit rate and barrel rate — every one of those has batted
  // balls as its true denominator.
  //
  // We CANNOT get BA, xwOBA, whiff%, K%, BB% or usage% from it, because those
  // need plate appearances or every pitch thrown, and this export has neither.
  // So they are not computed, not approximated and not left to render as
  // zeroes: on a live-pull row they are absent, the table says so, and the
  // caption names which columns are unavailable and why. A batted-ball-only
  // BA would be the exact kind of invented number this file's own history
  // section exists to prevent.
  const liveByPitch = useMemo(() => {
    const rows = Array.isArray(liveLog) ? liveLog : []
    if (!rows.length) return null
    const pick = rows.filter((h) => (
      batterVs === 'ALL' || !batterVs ? true : String(h.arm || '').toUpperCase() === batterVs
    ))
    if (!pick.length) return null
    const acc = {}
    pick.forEach((h) => {
      const code = String(h.pitch_type || '').trim()
      if (!code || code === 'nan') return
      const a = acc[code] || (acc[code] = { bbe: 0, hr: 0, evSum: 0, evN: 0, hard: 0, brl: 0 })
      a.bbe += 1
      if (h.is_hr) a.hr += 1
      if (h.is_hard_hit) a.hard += 1
      if (h.is_barrel) a.brl += 1
      const ev = Number(h.ev)
      if (Number.isFinite(ev)) { a.evSum += ev; a.evN += 1 }
    })
    const out = {}
    Object.entries(acc).forEach(([code, a]) => {
      out[code] = {
        bbe: a.bbe,
        hr: a.hr,
        ev: a.evN ? a.evSum / a.evN : null,
        hh: a.bbe ? (100 * a.hard) / a.bbe : null,
        brl: a.bbe ? (100 * a.brl) / a.bbe : null,
        // Deliberately absent, not zero — see the note above.
        ba: null, xwoba: null, whiff: null, k: null, bb: null, use: null,
        _live: true,
      }
    })
    return Object.keys(out).length ? out : null
  }, [liveLog, batterVs])

  // ── Batter vs pitch type, splittable by the HAND OF PITCHER faced ──
  const botByPitch = useMemo(() => {
    if (batterVs === 'L') return src('batter_pitch_type_profile')?.vs_lhp?.by_pitch || src('batter_pitch_type_profile')?.by_pitch || {}
    if (batterVs === 'R') return src('batter_pitch_type_profile')?.vs_rhp?.by_pitch || src('batter_pitch_type_profile')?.by_pitch || {}
    return src('batter_pitch_type_profile')?.by_pitch || {}
  }, [player, batterVs])

  // The published profile always wins; the live pull only fills a hole.
  const usingLive = !Object.keys(botByPitch).length && !!liveByPitch
  const byPitch = usingLive ? liveByPitch : botByPitch

  // ── Pitcher arsenal — switch by batter hand toggle ──
  const pitcherSummary = useMemo(() => {
    if (hand === 'L') return src('pitcher_pitch_type_summary_vs_lhb') || src('pitcher_pitch_mix_vs_lhb')?.pitch_type_summary || []
    if (hand === 'R') return src('pitcher_pitch_type_summary_vs_rhb') || src('pitcher_pitch_mix_vs_rhb')?.pitch_type_summary || []
    return (
      src('pitcher_pitch_mix')?.pitch_type_summary ||
      src('pitcher_pitch_arsenal_detail') ||
      []
    )
  }, [player, hand])

  const primaryMix = useMemo(() => {
    if (hand === 'L') return player?.pitcher_primary_mix_vs_lhb || player?.pitcher_primary_mix || '—'
    if (hand === 'R') return player?.pitcher_primary_mix_vs_rhb || player?.pitcher_primary_mix || '—'
    return player?.pitcher_primary_mix || player?.pitcher_arsenal_summary || '—'
  }, [player, hand])

  const todayPitches = useMemo(() => {
    const summary = pitcherSummary
    if (summary?.length) return summary.map(r => r.pitch_code || r.pitch_type)
    const arsenal = player?.pitcher_arsenal || player?.pitcher_pitch_usage || {}
    return Object.keys(arsenal).sort((a,b)=>(arsenal[b]||0)-(arsenal[a]||0))
  }, [pitcherSummary, player])

  const allPitches = [...new Set([...todayPitches, ...Object.keys(byPitch)])].filter(pt => byPitch[pt] || todayPitches.includes(pt))

  const pitcherMap = {}
  pitcherSummary.forEach(r => { pitcherMap[r.pitch_type||r.pitch_code] = r })

  // ── THE READ ────────────────────────────────────────────────────────────
  // Two or three sentences, built only from fields already on the row: the
  // pitch he damages that this arm actually throws, the one he doesn't, and
  // how much of tonight's mix he has any real history against. Every claim
  // is gated at MIN_BBE — a read is exactly the place a five-ball sample
  // does the most harm, because it arrives in words rather than digits.
  const read = useMemo(() => {
    const rows = allPitches.map((pt) => {
      const d = byPitch[pt] || {}
      const pRow = pitcherMap[pt]
      return {
        pt,
        bbe: Number(d.bbe) || 0,
        seen: Number(d.seen) || 0,
        xwoba: d.xwoba != null ? Number(d.xwoba) : null,
        hr: Number(d.hr) || 0,
        use: Number(pRow?.usage_pct ?? (player?.pitcher_arsenal || {})[pt]) || 0,
      }
    })
    const thick = rows.filter((r) => r.bbe >= MIN_BBE && r.xwoba != null)
    const thrown = thick.filter((r) => r.use >= 4)
    const pool = thrown.length ? thrown : thick
    if (!pool.length) return null
    const best = [...pool].sort((a, b) => b.xwoba - a.xwoba)[0]
    const worst = [...pool].sort((a, b) => a.xwoba - b.xwoba)[0]
    const thrownUse = rows.reduce((s, r) => s + r.use, 0)
    const knownUse = thick.reduce((s, r) => s + r.use, 0)
    const side = hand !== 'ALL' ? ` to ${hand}HB` : ''
    const arm = player?.pitcher_name || "tonight's starter"
    const lines = []
    lines.push(
      `He damages the ${pitchLabel(best.pt).toLowerCase()} — ${best.xwoba.toFixed(3)} xwOBA on ${best.seen || best.bbe} seen` +
      `${best.hr ? `, ${best.hr} of his homers came off it` : ''}` +
      `${best.use > 0 ? `. ${arm} throws it ${best.use.toFixed(0)}%${side}.` : `. ${arm} does not throw it.`}`
    )
    if (worst.pt !== best.pt) {
      lines.push(
        `His hole is the ${pitchLabel(worst.pt).toLowerCase()} — ${worst.xwoba.toFixed(3)} xwOBA on ${worst.bbe} balls in play` +
        `${worst.use > 0 ? `, and it's ${worst.use.toFixed(0)}% of the mix${side}.` : ', which this arm barely throws.'}`
      )
    }
    if (thrownUse > 0) {
      lines.push(
        `He has ${MIN_BBE}+ batted balls against ${Math.round((100 * knownUse) / thrownUse)}% of tonight's arsenal. ` +
        `The rest is unknown, not average.`
      )
    }
    return lines
  }, [allPitches, byPitch, pitcherMap, player, hand])

  // Rate formatters that carry the gate. Under MIN_BBE the number is
  // parenthesised — a typographic "don't quote me", cheaper than a footnote
  // and impossible to miss once you've been told once.
  const gated = (fn) => (v, r) => {
    if (v == null || !Number.isFinite(Number(v))) return '—'
    const s = fn(Number(v))
    return Number(r?.bbe) < MIN_BBE ? `(${s})` : s
  }
  const dec3 = gated((v) => v.toFixed(3).replace(/^0\./, '.'))
  const one = gated((v) => v.toFixed(1))
  const zero = gated((v) => v.toFixed(0))

  const batsLabel = player?.bats && player.bats !== '?' ? `${player.bats}HB` : null
  const thinCount = allPitches.filter((pt) => Number((byPitch[pt] || {}).bbe || 0) < MIN_BBE).length

  const COLS = {
    id: [
      { key:'pitch', label:'Pitch', heat:false, w:92, bold:true, sticky:true,
        fmt:(v, r) => (Number(r?.bbe) < MIN_BBE ? `${v} ·` : v),
        title:`A trailing · means fewer than ${MIN_BBE} batted balls — thin sample, rates in parentheses` },
      { key:'today', label:'★', flag:true, mark:'★', w:30,
        title:"Today's starter throws this pitch" },
      { key:'use',   label:'Use%', w:48, dp:0,
        title:"Share of tonight's mix. No judgement in this column — just how often he throws it." },
      { key:'bbe',   label:'BBE',  w:42,
        title:`Balls in play — the denominator for every rate on this row. Under ${MIN_BBE} and the row dims.` },
    ],
    damage: [
      { key:'seen',  label:'Seen', w:46, title:'Pitches seen — the widest denominator here' },
      { key:'ba',    label:'BA',   w:48, fmt:dec3 },
      { key:'xwoba', label:'xWOBA', w:56, fmt:dec3,
        title:'Expected wOBA on contact — the best single answer to "does he hurt this pitch"' },
      { key:'hr',    label:'HR',   w:38 },
      { key:'ev',    label:'EV',   w:46, fmt:one },
      { key:'la',    label:'LA',   w:44, fmt:one,
        title:'Launch angle. Shaded like the rest, but read it carefully — high is a popup, not a good outcome.' },
    ],
    shape: [
      { key:'gb',    label:'GB%',  w:46, fmt:zero, invert:true,
        title:'Inverted — ground balls are the outcome the hitter wants least' },
      { key:'fb',    label:'FB%',  w:46, fmt:zero },
      { key:'hh',    label:'HH%',  w:46, fmt:zero },
      { key:'brl',   label:'Brl%', w:46, fmt:one },
      { key:'pull',  label:'Pull%', w:50, fmt:zero },
      { key:'whiff', label:'Whiff%', w:54, fmt:zero, invert:true },
      { key:'k',     label:'K%',   w:44, fmt:zero, invert:true },
      { key:'bb',    label:'BB%',  w:44, fmt:zero },
    ],
  }
  const columns = view === 'all'
    ? [...COLS.id, ...COLS.damage, ...COLS.shape]
    : [...COLS.id, ...COLS[view === 'shape' ? 'shape' : 'damage']]

  return (
    <div>
      {/* ── Pitcher context ── */}
      <div style={{fontSize:11,color:C.text2,fontFamily:NUM_FONT,marginBottom:8}}>
        <span style={{color:C.text,fontWeight:800}}>{player.pitcher_name}</span>
        {' '}{player.pitcher_throws}HP · ERA {player.pitcher_era} · {primaryMix}
      </div>

      {/* ── ONE CONTROL ROW. Both splits, both labelled, side by side, so it
             is obvious which end of the matchup each one moves. ── */}
      <div style={{
        display:'flex', gap:16, flexWrap:'wrap', alignItems:'center',
        background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10,
        padding:'8px 13px', marginBottom:12,
      }}>
        <SplitControl
          label="Pitcher's numbers vs"
          value={hand}
          onChange={setHand}
          options={[
            { key:'ALL', label:'All bats' },
            { key:'L',   label:'LHB', title:'What this arm allows to left-handed bats' },
            { key:'R',   label:'RHB', title:'What this arm allows to right-handed bats' },
          ]}
          flag={batsLabel && ((player.bats === 'L' && hand === 'L') || (player.bats === 'R' && hand === 'R'))
            ? `← ${String(player?.name || 'he').split(' ').slice(-1)[0]} bats ${player.bats}` : null}
        />
        <SplitControl
          label="Batter's numbers vs"
          value={batterVs}
          onChange={setBatterVs}
          options={[
            { key:'ALL', label:'All arms' },
            { key:'L',   label:'LHP', title:'His pitch-type numbers against lefties only' },
            { key:'R',   label:'RHP', title:'His pitch-type numbers against righties only' },
          ]}
          flag={player?.pitcher_throws && ((player.pitcher_throws === 'L' && batterVs === 'L') || (player.pitcher_throws === 'R' && batterVs === 'R'))
            ? '← tonight’s arm' : null}
        />
      </div>

      {/* ── THE DUEL (2026-08-29, replaces the Matchup DNA strip) ─────────
          Same join, unstacked: the DNA strip encoded usage as width and this
          batter's damage as colour inside ONE 34px bar — two variables in one
          mark, and Donovan's verdict was "hard to even make out." MixDuel
          gives each pitch a row with usage and damage as two aligned bars,
          keeps the composite number, and tags the biggest usage×damage pitch
          THE DOOR. Data and thresholds are unchanged from the strip. */}
      {pitcherSummary.length > 0 && Object.keys(byPitch).length > 0 && (
        <MixDuel
          rows={pitcherSummary.map((r) => {
            const pt = r.pitch_type || r.pitch_code || ''
            const d = byPitch[pt] || {}
            return {
              pt, use: Number(r.usage_pct) || 0,
              xw: d.xwoba == null ? null : Number(d.xwoba),
              bbe: Number(d.bbe) || 0, hr: Number(d.hr) || 0,
            }
          })}
          pitcherName={String(player?.pitcher_name || 'the arm')}
          batterName={String(player?.name || 'this batter')}
          sideNote={hand !== 'ALL' ? `his mix vs ${hand}HB` : 'overall usage'}
        />
      )}

      {/* ── THE READ. The answer, in sentences, above the evidence. ── */}
      {read && (
        <div style={{
          background: `linear-gradient(155deg, rgba(249,115,22,.09), ${C.bg2} 60%)`,
          border: `1px solid ${C.orange}44`, borderLeft: `4px solid ${C.orange}`,
          borderRadius: 11, padding: '10px 14px', marginBottom: 12,
        }}>
          <div style={{ fontSize: 9, color: C.text3, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', fontFamily: NUM_FONT, marginBottom: 4 }}>
            The read
          </div>
          {read.map((line, i) => (
            <div key={i} style={{ fontSize: 12, color: i === 0 ? C.text : C.text2, fontWeight: i === 0 ? 700 : 500, lineHeight: 1.6 }}>
              {line}
            </div>
          ))}
          <div style={{ fontSize: 9, color: C.text3, marginTop: 5, lineHeight: 1.5 }}>
            Only pitches with {MIN_BBE}+ balls in play are allowed to make a claim here — a sentence is
            where a five-swing sample does the most damage, because it arrives as words.
          </div>
        </div>
      )}

      {/* WHICH PIPE, said before the table rather than after it. */}
      {usingLive && (
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap',
          margin: '0 0 8px', padding: '6px 10px', borderRadius: 8,
          border: '1px solid rgba(248,113,113,.3)', background: 'rgba(248,113,113,.07)',
          fontSize: 9.5, color: C.text3, lineHeight: 1.55,
        }}>
          <span style={{ color: '#f87171', fontWeight: 900 }}>🔴 Live Statcast pull</span>
          <span>
            he isn&apos;t in the bot&apos;s cache for this slate, so this table is built from his
            batted balls straight off Savant. Balls in play, HR, exit velo, hard-hit% and barrel%
            are all real counts over those balls.{' '}
            <b style={{ color: C.text2 }}>BA, xwOBA, whiff%, K% and usage% are blank on purpose</b> —
            they need plate appearances or every pitch thrown, and a batted-ball export has neither.
            They will fill in when the bot publishes this hitter&apos;s profile.
          </span>
        </div>
      )}

      {/* ── Section 1: Batter vs pitch type ── */}
      {Object.keys(byPitch).length > 0 ? (
        <div style={{marginBottom:16}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:7,paddingBottom:5,borderBottom:`1px solid ${C.border}`,flexWrap:'wrap',gap:8}}>
            <div style={{fontSize:12,fontWeight:800}}>
              {player.name} <span style={{color:C.text3,fontWeight:400}}>vs pitch type</span>
              <span style={{fontSize:10,color:C.text3,fontFamily:NUM_FONT,marginLeft:6}}>
                ★ = today&apos;s pitcher throws this
                {batterVs !== 'ALL' ? ` · vs ${batterVs}HP only` : ''}
              </span>
            </div>
            {/* THE VIEW PICKER — the fix for eighteen columns at once. */}
            <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
              <span style={{fontSize:9,color:C.text3,fontWeight:800,textTransform:'uppercase',letterSpacing:'.05em'}}>Columns</span>
              <SegGroup>
                {VIEWS.map((v) => (
                  <Seg key={v.key} active={view === v.key} onClick={() => setView(v.key)} title={v.blurb}>{v.label}</Seg>
                ))}
              </SegGroup>
            </div>
          </div>
          <div style={{fontSize:9.5,color:C.text3,marginBottom:6}}>
            {VIEWS.find((v) => v.key === view)?.blurb}
          </div>
          <DenseTable
            rows={allPitches.map(pt => {
              const d = byPitch[pt] || {}
              const pRow = pitcherMap[pt]
              return {
                _key: pt,
                pitch: pitchLabel(pt),
                today: todayPitches.includes(pt) ? 1 : 0,
                use: pRow?.usage_pct ?? (player?.pitcher_arsenal || {})[pt] ?? null,
                seen: d.seen ?? null,
                bbe: d.bbe ?? null,
                ba: d.ba ?? null,
                xwoba: d.xwoba ?? null,
                hr: d.hr ?? null,
                ev: d.avg_ev ?? null,
                la: d.avg_la ?? null,
                gb: d.gb_rate != null ? d.gb_rate * 100 : null,
                fb: d.fb_rate != null ? d.fb_rate * 100 : null,
                hh: d.hard_hit_rate != null ? d.hard_hit_rate * 100 : null,
                brl: d.barrel_like_rate != null ? d.barrel_like_rate * 100 : null,
                pull: d.air_pull_rate != null ? d.air_pull_rate * 100 : null,
                whiff: d.whiff_rate != null ? d.whiff_rate * 100 : null,
                k: d.k_rate != null ? d.k_rate * 100 : null,
                bb: d.bb_rate != null ? d.bb_rate * 100 : null,
              }
            })}
            columns={columns}
            dimRow={(r) => Number(r.bbe || 0) < MIN_BBE}
            initialSort="use"
            maxHeight={340}
            caption={`SAMPLE GATE: ${thinCount} of ${allPitches.length} pitches here rest on fewer than ${MIN_BBE} balls in play. Those rows are dimmed, their rates are in parentheses, and \u2014 as of 2026-08-29 \u2014 they are excluded from the colour SCALE as well: a row resting on two balls in play used to define the top of every ramp on this table, so the qualifying rows were all squashed into the bottom of the gradient while the unqualified one sat at the ceiling. The scale is now built from qualifying rows only; thin rows keep their real values, stay sortable and stay counted, they simply clamp to the ends of an honest scale instead of setting it. A 1.000 BA on five pitches is one swing, not a strength. GB%, Whiff% and K% are inverted so bright still means good for the hitter. Use% carries no judgement — it's how often tonight's arm throws the pitch. Switch Columns above for shape and discipline, or Everything for all eighteen.`}
          />
        </div>
      ) : (
        <div style={{padding:'10px 0',fontSize:11,color:C.text3,fontFamily:NUM_FONT}}>
          No pitch-type profile published for {player.name}
          {batterVs !== 'ALL' ? ` against ${batterVs}HP` : ''}
          {liveLog === null
            ? ' — checking Statcast directly…'
            : ' — and the live Statcast pull came back empty too. That is every source this tab has.'}
        </div>
      )}

      {/* ── Section 2: Pitcher arsenal (hand-split) ── */}
      {pitcherSummary.length > 0 && (
        <div>
          <div style={{fontSize:12,fontWeight:800,marginBottom:6,paddingBottom:5,borderBottom:`1px solid ${C.border}`}}>
            {player.pitcher_name}{' '}
            <span style={{color:C.text3,fontWeight:400}}>
              pitch performance allowed {hand!=='ALL'?`vs ${hand}HB`:'(all batters)'}
            </span>
          </div>
          <DenseTable
            rows={pitcherSummary.map((r,i) => {
              const pt = r.pitch_type||r.pitch_code||''
              const hrPBBE = r.hr_per_bbe||(r.hr_allowed&&r.bbe_allowed?r.hr_allowed/r.bbe_allowed:null)
              return {
                _key: pt || String(i),
                pitch: pitchLabel(pt) || '—',
                use: r.usage_pct ?? null,
                bbe: r.bbe_allowed ?? null,
                hr: r.hr_allowed ?? null,
                hrBbe: hrPBBE != null ? hrPBBE * 100 : null,
                ev: r.avg_ev_allowed || null,
                hh: r.hard_hit_rate_allowed != null ? r.hard_hit_rate_allowed * 100 : null,
                brl: r.barrel_rate_allowed != null ? r.barrel_rate_allowed * 100 : null,
              }
            })}
            columns={[
              { key:'pitch', label:'Pitch',   heat:false, w:96, bold:true, sticky:true,
                fmt:(v, r) => (Number(r?.bbe) < MIN_BBE ? `${v} ·` : v) },
              { key:'use',   label:'Use%',    w:50, dp:0 },
              { key:'bbe',   label:'BBE',     w:44, title:'Balls in play allowed against this pitch' },
              { key:'hr',    label:'HR',      w:40 },
              { key:'hrBbe', label:'HR/BBE%', w:58, fmt:one },
              { key:'ev',    label:'EV',      w:46, fmt:one },
              { key:'hh',    label:'HH%',     w:46, fmt:zero },
              { key:'brl',   label:'Brl%',    w:48, fmt:one },
            ]}
            dimRow={(r) => Number(r.bbe || 0) < MIN_BBE}
            initialSort="use"
            maxHeight={280}
            caption={`Bright is good for the hitter — these are the pitches that get hurt. Same ${MIN_BBE}-batted-ball gate as the table above: dimmed rows with parenthesised rates are the ones where a high HR/BBE is one swing rather than a tendency.`}
          />
        </div>
      )}

      <div style={{fontSize:9,color:C.text3,marginTop:8,lineHeight:1.5,fontFamily:NUM_FONT}}>
        Brightness is magnitude and bright is always good for the hitter — same ramp as every other
        board, so a dark cell is a low number, not a warning. Nothing is hidden by the column picker:
        Everything still shows all eighteen.
      </div>
    </div>
  )
}
