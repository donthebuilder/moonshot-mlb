'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { clean } from '../lib/player'
import { dedupeGraded } from '../lib/graded'
import DenseTable from './DenseTable'
import { usePickRecords } from './PlayerPickRecord'

// DID THE PICK DO ITS OWN JOB?
//
// Every other grading view on this site asks one question — did he homer —
// which is the wrong question for four of the five pick categories. A HIT pick
// that singles twice did exactly what it was designated to do; scoring it
// against home runs marks it a failure. So each category is graded against its
// own outcome:
//
//   HR / TOP   homered
//   HIT        got a base hit
//   CONTACT    2+ total bases
//   HRR        2+ combined hits, runs and RBI
//
// game_pick_role is on 641 of 648 graded slots, and the outcome fields
// (got_hr, got_base_hit, actual_hits/runs/rbi/tb) are on all 648, so this is
// measured rather than modelled.
//
// WHAT THE ARCHIVE SAYS, over 9 graded days:
//
//   TOP      n=167   32.9% homered
//   HIT      n=157   77.7% got a hit
//   HRR      n=108   52.8% cleared 2+ H+R+RBI
//   CONTACT  n= 75   28.0% cleared 2+ TB
//   HR       n=134   14.9% homered
//
// The last line is the one that matters and it is not flattering: the slate
// baseline HR rate across all 648 graded slots is 18.4%, so the bot's
// designated HR PICKS have homered LESS often than a random graded hitter,
// while TOP picks homered at nearly twice the baseline. On 134 picks that is
// not statistically airtight — the interval around 14.9% still touches the
// baseline — but it is nine days of evidence that the HR bucket is not adding
// anything, and it is displayed rather than buried.

const JOBS = {
  HR:      { label: 'HR',      job: '1+ HR',        color: '#f97316',
             test: (r) => r.gotHr },
  TOP:     { label: 'Top',     job: '1+ HR',        color: '#FCD34D',
             test: (r) => r.gotHr },
  HIT:     { label: 'Hit',     job: '1+ hit',       color: '#a78bfa',
             test: (r) => r.hits > 0 },
  CONTACT: { label: 'Contact', job: '2+ total bases', color: '#4ade80',
             test: (r) => r.tb >= 2 },
  HRR:     { label: 'HRR',     job: '2+ H+R+RBI',   color: '#22d3ee',
             test: (r) => r.hits + r.runs + r.rbi >= 2 },
}
const ORDER = ['TOP', 'HR', 'HIT', 'HRR', 'CONTACT']

const i = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

// Shared with PickRow so the badge on an individual row and the rate in the
// scorecard can never disagree about what "did its job" means.
export function pickJob(s) {
  if (!s) return null
  const role = clean(s.game_pick_role || s.pick_type, '').split('/')[0].trim().toUpperCase()
  const j = JOBS[role]
  if (!j) return null
  const r = {
    gotHr: s.got_hr === 1 || i(s.actual_hr) > 0,
    hits: i(s.actual_hits), runs: i(s.actual_runs),
    rbi: i(s.actual_rbi), tb: i(s.actual_tb),
  }
  return { role, label: j.label, job: j.job, color: j.color, did: j.test(r) }
}

export default function PickScorecard({ slots = [], backtest = null, onPlayerClick }) {
  // Prior record across the graded archive, so a pick on this slate carries
  // what the same player has done the other times he's been picked. This is
  // the whole point of the column: seeing that a HIT pick is 5-for-6 lifetime
  // as a HIT pick is worth more than seeing tonight's result alone.
  const { byPlayer } = usePickRecords(backtest)

  const rows = useMemo(() => slots.map((s, idx) => {
    const role = clean(s?.game_pick_role, '').split('/')[0].trim().toUpperCase()
    const r = {
      _key: `${s?.player_id ?? idx}-${idx}`,
      _raw: s,
      name: clean(s?.name, '—'),
      team: clean(s?.team, ''),
      role,
      gotHr: s?.got_hr === 1 || i(s?.actual_hr) > 0,
      hits: i(s?.actual_hits),
      runs: i(s?.actual_runs),
      rbi: i(s?.actual_rbi),
      tb: i(s?.actual_tb),
      hr: i(s?.actual_hr),
    }
    const j = JOBS[role]
    r.job = j ? j.job : '—'
    r.did = j ? (j.test(r) ? 1 : 0) : 0
    // VOID IS NOT A MISS, and this is the third surface to have to learn it.
    // A designated pick who was scratched, or who never came to the plate,
    // has no outcome — grading him 0 punishes a bet that never existed. The
    // rule is stated in lib/myPicks.js, lib/watchLedger.js, lib/liveSlate.js
    // and the bot's own live_results_tracker; the Results Overview on this
    // very tab already applies it (`actual_ab > 0`) to produce "the picks
    // cleared X of Y". This table did not, so §1 and §4 of one page printed
    // two different denominators for the same claim and only one obeyed the
    // site's stated rule.
    r.void = i(s?.actual_ab) === 0 && i(s?.actual_bb) === 0
    r.graded = !!j
    // The row STAYS — a scratched pick is information, and dropping it would
    // just move the lie from the percentage to the roster. It leaves the
    // denominator, not the table.
    if (r.void) { r.did = 0; r.job = 'never batted' }

    // His record IN THIS CATEGORY across every graded day, and overall. Shown
    // as a raw fraction, never a percentage — on a nine-day archive most of
    // these are 1-for-2, and a percentage would dress that up as a rate it
    // isn't. "2/3" tells you the sample and the result at the same time.
    const rec = byPlayer.get(String(s?.player_id ?? ''))
    const inCat = rec?.byCat?.[role]
    r.catRec = inCat ? `${inCat.ok}/${inCat.n}` : '—'
    r.allRec = rec ? `${rec.did}/${rec.picks}` : '—'
    r._catN = inCat ? inCat.n : 0
    r._catOk = inCat ? inCat.ok : 0
    return r
  }).filter((r) => r.graded), [slots, byPlayer])

  const byRole = useMemo(() => ORDER.map((role) => {
    const sub = rows.filter((r) => r.role === role && !r.void)
    const ok = sub.filter((r) => r.did).length
    return { role, ...JOBS[role], n: sub.length, ok, pct: sub.length ? (100 * ok) / sub.length : 0 }
  }).filter((x) => x.n > 0), [rows])

  // An older graded day can be missing game_pick_role entirely, in which case
  // there is nothing to grade against — say that rather than showing an empty
  // frame that looks like a broken table.
  if (!rows.length) {
    return (
      <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.6, padding: '14px 2px' }}>
        No pick roles on this day&apos;s graded file. This view needs
        <code style={{ color: C.text2 }}> game_pick_role</code>, which is stamped on 641 of the 648
        slots in the archive — a day without it can&apos;t be graded by category.
      </div>
    )
  }

  const totalOk = rows.filter((r) => r.did).length
  // Slate-wide HR rate, the honest yardstick for the HR and TOP buckets.
  //
  // DEDUPED (lib/graded.js) while the per-category rows above stay raw. The
  // category rates ARE per pick — a hitter picked twice is two picks, graded
  // twice — but this is the baseline they're measured AGAINST, and a baseline
  // is a rate over HITTERS. Counting the multi-category picks twice in it
  // dragged the yardstick toward the picks it was supposed to be independent
  // of, which is the one number on this card that has to be clean.
  const uniq = dedupeGraded(slots)
  const baseHr = uniq.length
    ? (100 * uniq.filter((s) => s?.got_hr === 1 || i(s?.actual_hr) > 0).length) / uniq.length
    : 0

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>Did the pick do its job?</span>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
          {totalOk} of {rows.length} · each category graded on its own outcome
        </span>
      </div>

      <div className="bot-picks-grid" style={{
        display: 'grid', gap: 8, marginBottom: 8,
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      }}>
        {byRole.map((b) => {
          const isHrLike = b.role === 'HR' || b.role === 'TOP'
          const beat = isHrLike ? b.pct - baseHr : null
          return (
            <div key={b.role} style={{
              background: `linear-gradient(155deg, ${b.color}1c, ${b.color}06)`,
              border: `1px solid ${b.color}44`, borderRadius: 11, padding: '8px 12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 10.5, fontWeight: 900, color: b.color, fontFamily: NUM_FONT }}>{b.label}</span>
                <span style={{ fontSize: 8.5, color: C.text3 }}>{b.job}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                <span style={{ fontFamily: NUM_FONT, fontSize: 17, fontWeight: 900, color: b.color }}>
                  {b.pct.toFixed(1)}%
                </span>
                <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>{b.ok}/{b.n}</span>
              </div>
              {beat != null && (
                <div style={{
                  fontSize: 9, fontFamily: NUM_FONT, marginTop: 1,
                  color: beat >= 0 ? C.orange : '#f87171',
                }}>
                  {beat >= 0 ? '+' : ''}{beat.toFixed(1)} vs {baseHr.toFixed(1)}% slate
                </div>
              )}
            </div>
          )
        })}
      </div>

      <DenseTable
        rows={rows}
        columns={[
          { key: 'did',  label: '✓',      flag: true, mark: '✓', w: 30,
            title: 'Did this pick do the job its own category is for?' },
          { key: 'name', label: 'Player', heat: false, w: 150, bold: true, sticky: true },
          { key: 'team', label: 'Tm',     heat: false, w: 34, mono: true, dim: true },
          { key: 'role', label: 'Pick',   heat: false, w: 62, mono: true, dim: true,
            title: 'Which category the bot designated him for' },
          { key: 'job',  label: 'Needed', heat: false, w: 104, dim: true },
          { key: 'catRec', label: 'As this pick', heat: false, w: 78, mono: true,
            title: 'His record when picked in THIS category, across every graded day. Shown as a fraction, not a percentage — on a nine-day archive the sample matters as much as the result.' },
          { key: 'allRec', label: 'All picks', heat: false, w: 66, mono: true, dim: true,
            title: 'His record across every category he has been picked in' },
          { key: 'hr',   label: 'HR',     w: 38 },
          { key: 'hits', label: 'H',      w: 36 },
          { key: 'runs', label: 'R',      w: 36 },
          { key: 'rbi',  label: 'RBI',    w: 40 },
          { key: 'tb',   label: 'TB',     w: 36 },
        ]}
        onRowClick={onPlayerClick}
        initialSort="did"
        maxHeight={420}
        caption="A pick who never came to the plate reads “never batted” and is left out of the counts above — void is not a miss. A ✓ means this hitter did the thing his own category was for — a HIT pick that singled counts, even though he didn't homer. Grading every category against home runs is the mistake this table exists to avoid. 'As this pick' is his record the other times the bot has picked him in this same category, across every graded day; it's a fraction rather than a percentage because on a nine-day archive the sample size is half the information. Sort by Pick to compare within a category, or open Track record for the full per-player table."
      />

      <div style={{ fontSize: 9.5, color: C.text3, marginTop: 6, lineHeight: 1.6 }}>
        {/* RESTATED ON A BIGGER ARCHIVE (2026-08-15). These were 3,973 picks
            over 39 graded days; the sweep now runs on 5,184 judgeable
            designated picks over 62 nights and 811 games, so every figure
            below moved. Restating rather than bumping matters — the SAMPLE
            moved too, and a rate quoted against the wrong n is the thing this
            panel exists to prevent. Two other surfaces quoted the old numbers
            and now disagree with this one two panels away; they are corrected
            in the same commit. */}
        The cards above are this day only. Measured across the full local archive —
        <b style={{ color: C.text2 }}> 5,184 judgeable picks over 62 graded nights</b>, roughly six
        times what the published branch carries — the categories land at: HIT 69.6% (968/1391),
        HRR 50.9% (709/1392), CONTACT 39.9% (316/791), TOP 21.3% (172/807), HR 15.9% (128/803).
        Voids are excluded throughout: a man who never batted is not a loss.
        <br /><br />
        On home runs specifically, <b style={{ color: C.text2 }}>TOP 21.3% and HR 15.9%</b>, against
        14.6% across every pick in the archive. That gap is <b style={{ color: C.text2 }}>not
        statistically significant</b> — TOP vs HR is p=0.084, and HR against every other pick is
        p=0.556, which is no difference at all. The 95% intervals overlap heavily: TOP [16.2, 22.6],
        HR [12.7, 18.6].
        <br /><br />
        So the honest read is narrow and worth stating exactly: <b style={{ color: C.text2 }}>the HR
        bucket does not distinguish itself from any other pick on home runs.</b> It is not
        established that it&apos;s worse, and it is not established that TOP is better. An earlier
        version of this note claimed HR picks homered below baseline while TOP nearly doubled it;
        that came from a nine-day slice and did not survive the full archive.
      </div>
    </div>
  )
}
