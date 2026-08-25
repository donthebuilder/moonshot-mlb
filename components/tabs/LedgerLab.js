'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { alpha } from '../../lib/scales'
import { btnStyle, WhatThis } from '../ui'
import { easternToday } from '../../lib/data'
import HomerLedger from '../HomerLedger'
import {
  listLedgerNights, readLedgerNight, harvestRange, digestLedger,
  exportLedgerArchive, clearLedgerArchive, MIN_TELL,
  harvestPeople, pidsMissingPeople, readPeopleStore,
  parseArchiveQuery, findInArchive,
} from '../../lib/ledgerArchive'

// ══ 🧾 THE HOMER LEDGER — ITS OWN PAGE ══════════════════════════════════════
//
// Donovan, 2026-08-24: "what if [we take the] homer ledger and make it its own
// page in Alignments — do that, and make it damn near its own research tool."
//
// It had been mounted on TOP of Alignments, which is not a page, it is a
// stack: you scrolled past the ledger to reach the thing the tab is named
// after, and the ledger got read as a header for it. Now it is a pill of its
// own beside Alignments, same tier, same as the 2026-08-18 call that gave
// Alignments its own pill for the same reason.
//
// ── WHAT MAKES IT A RESEARCH TOOL AND NOT A BIGGER PANEL ────────────────────
//
// The panel could only ever show ONE NIGHT. Every interesting question he has
// ever asked it is about more than one:
//
//   "all the j names are going, whos a j"
//   "same first name — if one goes the other might go. bryce, brice. luis
//    robert, luis torrens. pete and pete. names that rhyme."
//
// You cannot answer either of those by flipping a night picker back and forth;
// that is manual labour with no arithmetic at the end. So this page has two
// halves and the second one is new:
//
//   🌙 ONE NIGHT — the ledger exactly as it is, in research mode: always open,
//      night picker, every strip. Unchanged component, on purpose.
//   📚 THE ARCHIVE — the corpus. Every night this browser holds, aggregated:
//      which letters are actually running, who keeps coming back, the matching
//      game counted with its denominator, the order, the teams, and a table of
//      nights you can read down.
//
// IT BACKFILLS. An archive that only fills as you happen to visit is useless
// on the day it ships, so the page can pull the last N nights straight off the
// branch's graded files — the same payload the Results tab grades from. One
// button, and it says what it fetched.
//
// ── THE RULES IT INHERITS ───────────────────────────────────────────────────
// Nothing here is scored, nothing feeds a pick, every count carries its
// denominator, and the coverage caveat is printed rather than implied: the
// graded file holds the ~90 candidates the bot watches, so this is a board
// about the names the sheet was looking at, not about baseball.

// 2026-08-24: text-only — secondary/sub-tab pills are emoji-free site-wide.
const VIEWS = [
  ['night', 'One night'],
  ['archive', 'The archive'],
]

const panel = (accent) => ({
  background: C.bg2, border: `1px solid ${C.border}`,
  borderLeft: `3px solid ${accent}`, borderRadius: 14,
  padding: '13px 16px', marginBottom: 12,
})

function Head({ icon, title, note }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', marginBottom: 9 }}>
      <span style={{ fontSize: 13, fontWeight: 900 }}>{icon} {title}</span>
      {note && <span style={{ fontSize: 10.5, color: C.text3 }}>{note}</span>}
    </div>
  )
}

function Num({ children, color = C.text }) {
  return <b style={{ fontFamily: NUM_FONT, color, fontWeight: 800 }}>{children}</b>
}

// A bar, not a number in a box — the same lesson the props sheet wrote down:
// a rate you have to rank in your head is worse than a rank already drawn. The
// track is the biggest value on the board, so every row is read against the
// same zero and the same top.
function Bar({ label, n, max, color, tail, onClick, active }) {
  const w = max > 0 ? Math.max(2, Math.round((100 * n) / max)) : 0
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, width: '100%', minWidth: 0,
        padding: '5px 7px', borderRadius: 9, textAlign: 'left', border: '1px solid transparent',
        background: active ? alpha(color, .1) : 'transparent',
        borderColor: active ? alpha(color, .5) : 'transparent',
        cursor: onClick ? 'pointer' : 'default', color: C.text,
      }}
    >
      <span style={{
        flexShrink: 0, width: 34, fontFamily: NUM_FONT, fontSize: 11.5, fontWeight: 900,
        color, textAlign: 'center',
      }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, height: 9, borderRadius: 999, background: C.glass, overflow: 'hidden' }}>
        <span style={{ display: 'block', width: `${w}%`, height: '100%', background: color, borderRadius: 999 }} />
      </span>
      <span style={{ flexShrink: 0, fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, minWidth: 22, textAlign: 'right' }}>{n}</span>
      {tail && <span style={{ flexShrink: 0, fontSize: 9.5, color: C.text3, minWidth: 0 }}>{tail}</span>}
    </button>
  )
}

const shortDate = (d) => {
  const t = new Date(`${d}T12:00:00Z`)
  return Number.isNaN(t.getTime()) ? d
    : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export default function LedgerLab({
  players = [], allPlayers = [], slateDate = '', results = null, onPlayerClick = null,
}) {
  const [view, setView] = useState('night')
  const [tick, setTick] = useState(0)          // forces an archive re-read
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [q, setQ] = useState('')
  const [axis, setAxis] = useState(null)       // pinned reading for a bare number
  const [lens, setLens] = useState(null)       // a lit first-initial, or null
  const [openNight, setOpenNight] = useState(null)
  const [people, setPeople] = useState({})

  // localStorage is client-only, so the archive is read after mount and never
  // during render — the same rule every device-local store on this site keeps.
  const [entries, setEntries] = useState([])
  useEffect(() => {
    setEntries(listLedgerNights().map(readLedgerNight).filter(Boolean))
    setPeople(readPeopleStore())
  }, [tick])

  const digest = useMemo(() => digestLedger(entries, people), [entries, people])

  // ── LOOKING UP THE NUMBERS ────────────────────────────────────────────────
  // Jersey and birthday come from the league, not from the graded file, and
  // neither ever changes — so this asks once per hitter, ever, and the answer
  // lives on disk (see the people store in lib/ledgerArchive.js). On a filled
  // archive it is one batched request for ~90 men and then nothing, forever.
  const enrich = useCallback(async (silent = false) => {
    const held = listLedgerNights().map(readLedgerNight).filter(Boolean)
    const need = pidsMissingPeople(held)
    if (!need.length) return false
    if (!silent) setMsg(`asking the league about ${need.length} hitters…`)
    await harvestPeople(need)
    setPeople(readPeopleStore())
    return true
  }, [])

  const backfill = useCallback(async (days, { silent = false } = {}) => {
    setBusy(true); if (!silent) setMsg('')
    try {
      const end = slateDate || easternToday()
      const res = await harvestRange(end, days, {
        onProgress: silent ? undefined : ({ i, of, date }) => setMsg(`reading ${date} — ${i}/${of}`),
      })
      setTick((t) => t + 1)
      await enrich(silent)
      if (!silent) {
        setMsg(res.added
          ? `Pulled ${res.added} night${res.added === 1 ? '' : 's'} off the branch.`
          : 'Nothing new — every night in that window was already here.')
      } else if (res.added) {
        setMsg(`Topped up — ${res.added} new night${res.added === 1 ? '' : 's'}.`)
      }
    } catch {
      if (!silent) setMsg("Couldn't reach the graded files.")
    } finally { setBusy(false) }
  }, [slateDate, enrich])

  // ── IT TOPS ITSELF UP (2026-08-24) ────────────────────────────────────────
  // Donovan, asked whether it should: "yes if that's the best thing to do."
  //
  // It is, and cheaply: harvestRange SKIPS every night already on disk without
  // issuing a request, so an archive that is current costs exactly one fetch —
  // for today, whose graded file may not exist yet — and an archive that is a
  // week stale quietly fills the gap while you read. Seven days, not forty-five:
  // the deep pull stays a button, because that one is a real burst and should
  // be something you asked for.
  //
  // ONCE PER MOUNT, and never on top of a running pull. Nothing here blocks the
  // render — the boards draw from whatever is already on disk and redraw when
  // the top-up lands — so a slow or dead network costs a stale board, not a
  // blank page.
  const toppedRef = useRef(false)
  useEffect(() => {
    if (toppedRef.current || busy) return
    toppedRef.current = true
    backfill(7, { silent: true }).then(() => enrich(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function doExport() {
    try {
      const blob = new Blob([exportLedgerArchive()], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `moonshot-ledger-archive-${easternToday()}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      setMsg('Exported.')
    } catch { setMsg("Couldn't export.") }
  }

  const parsed = useMemo(() => parseArchiveQuery(q, axis), [q, axis])
  const hits = useMemo(() => {
    if (!digest || !parsed) return null
    if (parsed.axis === 'name' && String(parsed.value).length < 2) return null
    return findInArchive(digest, parsed).slice(0, 24)
  }, [digest, parsed])

  return (
    <div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
        {VIEWS.map(([k, label]) => (
          <button key={k} onClick={() => setView(k)} style={btnStyle(C.orange, view === k)}>{label}</button>
        ))}
      </div>

      {view === 'night' && (
        <>
          <WhatThis label="what one night shows">
            Which homer of the season each one was, where in the order it came from, and every
            alignment the night landed on — the roots, the repeats, the jersey matches and the
            name echoes. The picker reads any night this browser has archived; each one comes off
            the branch&apos;s own graded file, so it agrees with the Results tab by construction.
          </WhatThis>
          <HomerLedger
            variant="research"
            players={allPlayers.length ? allPlayers : players}
            slateDate={slateDate}
            results={results}
            onPlayerClick={onPlayerClick}
          />
        </>
      )}

      {view === 'archive' && (
        <>
          {/* ── THE CORPUS, AND WHERE IT CAME FROM ────────────────────────── */}
          <div style={panel(C.cyan)}>
            <Head
              icon="📚" title="The archive"
              note={digest
                ? `${digest.nights} night${digest.nights === 1 ? '' : 's'} · ${digest.from} → ${digest.to}`
                : 'empty on this device'}
            />
            {digest ? (
              <div>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))',
                  gap: 7,
                }}>
                  {[
                    ['Nights', digest.nights, C.cyan],
                    ['Home runs', digest.homers, C.orange],
                    ['Hitters', digest.repeats.length, C.green],
                  ].map(([label, value, color]) => (
                    <div key={label} style={{
                      background: `${color}0d`, border: `1px solid ${color}33`,
                      borderRadius: 9, padding: '8px 10px',
                    }}>
                      <div style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 800 }}>{label}</div>
                      <div style={{ fontSize: 19, fontFamily: NUM_FONT, fontWeight: 900, color, marginTop: 1 }}>{value}</div>
                    </div>
                  ))}
                </div>
                {digest.thin && (
                  <div style={{ marginTop: 8, fontSize: 10.5, color: C.yellow }}>
                    Small sample — pull at least four nights before reading a pattern.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.75 }}>
                Nothing archived on this device yet. Pull the last two weeks off the branch and the
                boards below fill in immediately — it is the same graded file the Results tab reads.
              </div>
            )}

            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
              <button disabled={busy} onClick={() => backfill(14)} style={btnStyle(C.cyan, false)}>
                {busy ? 'Updating…' : 'Update · 14 nights'}
              </button>
              <button disabled={busy} onClick={() => backfill(45)} style={btnStyle(C.cyan, false)}>Backfill · 45 nights</button>
              {digest && <button onClick={doExport} style={btnStyle(C.text3, false)}>Export JSON</button>}
              {digest && (
                <button
                  onClick={() => {
                    if (window.confirm('Delete every archived night on this device?')) {
                      const n = clearLedgerArchive(); setTick((t) => t + 1); setMsg(`Cleared ${n}.`)
                    }
                  }}
                  style={{ ...btnStyle(C.red, false), color: C.red, borderColor: `${C.red}55` }}
                >Clear device archive</button>
              )}
              {msg && <span style={{ fontSize: 10, color: C.text3 }}>{msg}</span>}
            </div>

            <WhatThis label="what the archive counts" maxWidth={680}>
              Counts cover hitters on each night&apos;s Moonshot sheet, not every hitter who played. They are research totals and do not change any pick or score.
            </WhatThis>
          </div>

          {digest && (
            <>
              {/* ── WHOSE LETTER IS IT ────────────────────────────────────
                  His question, verbatim: "all the j names are going, who's a
                  j." The board answers it with the denominator attached, and
                  a night only earns the word "letter night" when one initial
                  took at least three of its homers AND at least 30% of them —
                  two of eleven is not a J night, and printing it as one is how
                  a pattern page becomes a horoscope. */}
              <div style={panel(C.orange)}>
                <Head icon="🔤" title="Whose letter is it"
                      note={`first initials · ${digest.homers} homers`} />
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    {digest.firsts.slice(0, 9).map((r) => (
                      <Bar
                        key={r.k} label={r.k} n={r.n} max={digest.firsts[0].n} color={C.orange}
                        active={lens === r.k}
                        onClick={() => setLens(lens === r.k ? null : r.k)}
                        tail={<>{r.nights}n{r.best && r.best.n >= 3 ? ` · ${r.best.n} on ${shortDate(r.best.date)}` : ''}</>}
                      />
                    ))}
                  </div>
                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <div style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, marginBottom: 4, paddingLeft: 7 }}>
                      SURNAME INITIAL
                    </div>
                    {digest.lasts.slice(0, 9).map((r) => (
                      <Bar key={r.k} label={r.k} n={r.n} max={digest.lasts[0].n} color={C.blue}
                           tail={<>{r.nights}n</>} />
                    ))}
                  </div>
                </div>
                {lens && (
                  <div style={{ fontSize: 11.5, color: C.text2, marginTop: 10, lineHeight: 1.7 }}>
                    <b style={{ color: C.orange }}>{lens}</b> —{' '}
                    {digest.nightRows.filter((r) => r.lead?.k === lens && r.letterNight).length > 0 ? (
                      <>ran the night on{' '}
                        {digest.nightRows.filter((r) => r.lead?.k === lens && r.letterNight)
                          .map((r) => `${shortDate(r.date)} (${r.lead.n} of ${r.men})`).join(', ')}.</>
                    ) : (
                      <>never took a night outright — it is spread across{' '}
                        <Num>{digest.firsts.find((f) => f.k === lens)?.nights || 0}</Num> nights rather
                        than concentrated in one.</>
                    )}
                  </div>
                )}
              </div>

              {/* ── THE MATCHING GAME ─────────────────────────────────────
                  "Same first name — if one goes the other might go. Bryce,
                  Brice. Luis Robert, Luis Torrens. Pete and Pete."
                  Every unordered pair inside a night, through the same
                  pairEcho the live ledger uses. The DENOMINATOR leads, because
                  four same-first-name pairs out of a thousand possible pairs
                  is a very different sentence from four out of forty, and the
                  numerator alone would read as a finding. */}
              <div style={panel('#c084fc')}>
                <Head icon="🪞" title="The matching game"
                      note={`${digest.echoes.length} echo${digest.echoes.length === 1 ? '' : 'es'} out of ${digest.pairs.toLocaleString()} pairs that could have been one`} />
                {digest.echoKinds.length ? (
                  <>
                    {digest.echoKinds.map((k) => (
                      <div key={k.kind} style={{ marginBottom: 9 }}>
                        <div style={{ fontSize: 11.5, color: C.text2, lineHeight: 1.6 }}>
                          <Num color="#c084fc">{k.n}</Num> × <b style={{ color: C.text }}>{k.kind}</b>
                          <span style={{ color: C.text3 }}> · on {k.nights} night{k.nights === 1 ? '' : 's'}</span>
                        </div>
                        <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.75, marginTop: 2 }}>
                          {k.examples.map((e, i) => (
                            <span key={`${e.date}-${e.a}-${e.b}`}>
                              {i > 0 ? ' · ' : ''}
                              <b style={{ color: C.text2 }}>{e.a}</b> + <b style={{ color: C.text2 }}>{e.b}</b>{' '}
                              <span style={{ fontFamily: NUM_FONT }}>{shortDate(e.date)}</span>
                            </span>
                          ))}
                          {k.n > k.examples.length && <span> · +{k.n - k.examples.length} more</span>}
                        </div>
                      </div>
                    ))}
                    {/* ── THE NUMBER TWINS ─────────────────────────────
                        "same jersey numbers, Pete and Pete" — the other half
                        of what he described. Rarest family first, and every
                        row states HOW MANY WAYS IT COULD HAVE DIFFERED: two
                        men sharing a birthday is one in 365 and worth a look;
                        two men sharing a life path is one in nine and will
                        happen dozens of times a fortnight whatever anyone
                        believes. Printing those two families in the same list
                        without that number beside them would flatter the
                        cheap one into looking like the striking one. */}
                    {digest.twinKinds.length > 0 && (
                      <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                        <div style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, marginBottom: 6 }}>
                          BY THE NUMBERS · {digest.numbered} of {digest.bats} homers have a shirt and a birthday on file
                        </div>
                        {digest.twinKinds.map((k) => (
                          <div key={k.kind} style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 11.5, color: C.text2, lineHeight: 1.6 }}>
                              <Num color="#c084fc">{k.n}</Num> × <b style={{ color: C.text }}>{k.kind}</b>
                              <span style={{ color: C.text3 }}> · 1 in {k.of} · on {k.nights} night{k.nights === 1 ? '' : 's'}</span>
                            </div>
                            <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.75, marginTop: 2 }}>
                              {k.examples.map((e, i) => (
                                <span key={`${e.date}-${e.a}-${e.b}`}>
                                  {i > 0 ? ' · ' : ''}
                                  <b style={{ color: C.text2 }}>{e.a}</b> + <b style={{ color: C.text2 }}>{e.b}</b>{' '}
                                  <span style={{ fontFamily: NUM_FONT }}>{e.value}</span>{' '}
                                  <span style={{ fontFamily: NUM_FONT }}>{shortDate(e.date)}</span>
                                </span>
                              ))}
                              {k.n > k.examples.length && <span> · +{k.n - k.examples.length} more</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 10.5, color: C.text3, lineHeight: 1.7, marginTop: 4 }}>
                      Syllable rhymes are deliberately <b style={{ color: C.text2 }}>not</b> counted here.
                      Counting syllables from spelling is a guess that is wrong often enough that it can
                      never carry a claim on its own — over a whole corpus it would be the loudest family
                      and the least trustworthy one. Only echoes you can see in the spelling are on this
                      board; the live ledger runs the shuffle test on a single night&apos;s names.
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 11.5, color: C.text3, lineHeight: 1.7 }}>
                    No two names echoed each other on any archived night — which is itself the answer,
                    and the reason the denominator is printed above.
                  </div>
                )}
              </div>

              {/* ── WHO KEEPS COMING BACK ─────────────────────────────────── */}
              <div style={panel(C.green)}>
                <Head icon="🔁" title="Who keeps coming back"
                      note={`${digest.repeats.length} hitters · ${digest.nights} nights`} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {digest.repeats.slice(0, 10).map((r) => (
                    <button
                      key={r.key}
                      onClick={() => setQ(r.name)}
                      style={{
                        display: 'flex', alignItems: 'baseline', gap: 9, width: '100%',
                        padding: '6px 2px', borderTop: `1px solid ${C.border}`, border: 'none',
                        borderTopStyle: 'solid', background: 'none', textAlign: 'left',
                        cursor: 'pointer', color: C.text, fontSize: 12,
                      }}
                    >
                      <b style={{ fontWeight: 800, minWidth: 0 }}>{r.name}</b>
                      <span style={{ fontSize: 9.5, fontFamily: NUM_FONT, color: C.text3 }}>{r.team}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 10.5, color: C.text3, fontFamily: NUM_FONT }}>
                        <Num color={C.green}>{r.dates.length}</Num> night{r.dates.length === 1 ? '' : 's'}
                        {r.hr !== r.dates.length && <> · <Num color={C.text3}>{r.hr}</Num> HR</>}
                      </span>
                    </button>
                  ))}
                </div>
                {/* ── SEARCH, ON EVERY AXIS (2026-08-24) ────────────────
                    Donovan: "ability to search jersey number, life path,
                    birthday, all those type matching."

                    ONE BOX THAT READS WHAT YOU TYPED rather than six boxes or
                    a dropdown nobody opens: #22 is a shirt, "lp 7" a life
                    path, "jan 2" a birthday, "mar" a birth month, NYM a club,
                    anything else a name.

                    THE CHIPS EXIST FOR ONE REASON — a bare "7" could be a
                    shirt, a life path or a day number, and silently picking
                    one would be a wrong answer with no way to tell. Untouched,
                    the box guesses shirt AND SAYS SO on the line below; tap a
                    chip and the reading is pinned. */}
                <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 11 }}>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 7 }}>
                    {[[null, 'auto'], ['jersey', '#shirt'], ['jerseyRoot', 'shirt root'],
                      ['lifePath', 'life path'], ['dayRoot', 'day number']].map(([k, label]) => (
                      <button key={k || 'auto'} onClick={() => setAxis(k)} style={{
                        fontSize: 9.5, fontFamily: NUM_FONT, fontWeight: 800, cursor: 'pointer',
                        padding: '3px 9px', borderRadius: 999,
                        border: `1px solid ${axis === k ? C.green : C.border}`,
                        background: axis === k ? `${C.green}18` : 'transparent',
                        color: axis === k ? C.green : C.text3,
                      }}>{label}</button>
                    ))}
                  </div>
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="a name · a team · #22 · lp 7 · day 3 · jan 2 · mar"
                    style={{
                      width: '100%', background: C.bg, color: C.text, fontSize: 12,
                      border: `1px solid ${C.border}`, borderRadius: 9, padding: '7px 11px',
                    }}
                  />
                  {parsed && (
                    <div style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, marginTop: 5 }}>
                      reading it as <b style={{ color: C.green }}>{parsed.label}</b>
                      {hits ? ` · ${hits.length} hit${hits.length === 1 ? '' : 's'}` : ''}
                    </div>
                  )}
                  {hits && (
                    <div style={{ fontSize: 11.5, color: C.text2, marginTop: 7, lineHeight: 1.85 }}>
                      {hits.length ? hits.map((r) => (
                        <div key={r.key} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                          <b>{r.name}</b>
                          <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9.5 }}>{r.team}</span>
                          {/* His whole card, so a match on one axis shows you
                              the others for free — which is the actual point
                              of searching by number. */}
                          <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9.5 }}>
                            {r.jersey != null ? `#${r.jersey}` : 'no shirt on file'}
                            {r.lifePath ? ` · lp ${r.lifePath}` : ''}
                            {r.dayRoot ? ` · day ${r.dayRoot}` : ''}
                            {r.birthDay ? ` · born ${r.birthDay}` : ''}
                          </span>
                          <span style={{ marginLeft: 'auto', color: C.text3, fontFamily: NUM_FONT, fontSize: 9.5 }}>
                            {r.dates.slice().sort().reverse().map(shortDate).join(' · ')}
                          </span>
                        </div>
                      )) : (
                        <span style={{ color: C.text3 }}>
                          Nothing in the archive matches that. Either nobody who fits went deep on an
                          archived night, or he is not one of the ~90 names the sheet was watching.
                          {parsed.axis !== 'name' && digest.numbered < digest.bats && (
                            <> {digest.bats - digest.numbered} of {digest.bats} homers still have no
                              shirt or birthday on file, so a number search cannot see them.</>
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── THE NUMBERS (2026-08-24) ───────────────────────────────
                  Jersey, birthday, day number and life path, across the whole
                  archive — the same three reductions the live ledger reads on
                  one night, finally readable against each other.

                  THE DENOMINATOR IS NOT THE HOMER COUNT. It is how many of
                  those homers have the axis on file at all; the league is
                  missing a shirt number for a handful of men every season and
                  a board that quietly divides by the wrong total looks
                  authoritative while being off by a fifth.

                  AND A FLAT BOARD IS THE EXPECTED RESULT. Nine buckets over a
                  couple of hundred homers is about twenty each, and the
                  arithmetic that makes the buckets does not know anything
                  about baseball. Tap a bar to search that axis rather than to
                  be told what it means. */}
              {digest.numbered > 0 && (
                <div style={panel('#c084fc')}>
                  <Head icon="🔢" title="The numbers"
                        note={`${digest.numbered} of ${digest.bats} homers have a shirt and a birthday on file`} />
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    {[
                      ['LIFE PATH', digest.lifePaths, 'lifePath', '#c084fc'],
                      ['DAY NUMBER', digest.dayRoots, 'dayRoot', C.cyan],
                      ['SHIRT ROOT', digest.jerseyRoots, 'jerseyRoot', C.orange],
                    ].map(([label, board, ax, col]) => (
                      <div key={label} style={{ flex: '1 1 200px', minWidth: 0 }}>
                        <div style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, marginBottom: 4, paddingLeft: 7 }}>
                          {label}
                        </div>
                        {board.rows.map((r) => (
                          <Bar
                            key={r.k} label={`${r.k}`} n={r.n}
                            max={board.rows[0].n} color={col}
                            active={axis === ax && String(q) === String(r.k)}
                            onClick={() => { setAxis(ax); setQ(String(r.k)) }}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                  {digest.jerseyNumbers.length > 0 && (
                    <div style={{ marginTop: 11, borderTop: `1px solid ${C.border}`, paddingTop: 9 }}>
                      <div style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, marginBottom: 5 }}>
                        THE SAME SHIRT · unreduced, so a match here is a real coincidence rather than one of nine buckets
                      </div>
                      <div style={{ fontSize: 11.5, color: C.text2, lineHeight: 1.85 }}>
                        {digest.jerseyNumbers.slice(0, 8).map((r) => (
                          <div key={r.k}>
                            <b style={{ color: C.orange, fontFamily: NUM_FONT }}>#{r.k}</b>{' '}
                            <span style={{ color: C.text3 }}>{r.who.join(' · ')}</span>
                          </div>
                        ))}
                        {digest.jerseyNumbers.length > 8 && (
                          <div style={{ color: C.text3, fontSize: 10.5 }}>
                            +{digest.jerseyNumbers.length - 8} more shirt numbers worn by two or more
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <div style={{ fontSize: 10.5, color: C.text3, marginTop: 10, lineHeight: 1.7 }}>
                    Day number is the day of the month reduced (the 26th → 2+6 → 8); life path is every
                    digit of the full birth date reduced the same way; shirt root is the number on his
                    back reduced. Nine buckets over a couple of hundred homers is about twenty apiece
                    whatever is true, so a tall bar here is arithmetic before it is anything else.
                    Same standing rule as the live ledger&apos;s strip: watched, disclosed, never scored.
                  </div>
                </div>
              )}

              {/* ── THE ORDER, AND THE TEAMS ──────────────────────────────── */}
              <div style={panel(C.yellow)}>
                <Head icon="🪜" title="Where in the order"
                      note={`${digest.homers} homers by lineup spot`} />
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    {digest.spots.map((s) => (
                      <Bar key={s.spot} label={`${s.spot}`} n={s.n}
                           max={Math.max(...digest.spots.map((x) => x.n), 1)} color={C.yellow} />
                    ))}
                    {digest.spotless > 0 && (
                      <div style={{ fontSize: 10, color: C.text3, paddingLeft: 7, marginTop: 3 }}>
                        {digest.spotless} with no lineup spot on file
                      </div>
                    )}
                  </div>
                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <div style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, marginBottom: 4, paddingLeft: 7 }}>
                      BY TEAM
                    </div>
                    {digest.teams.slice(0, 9).map((t) => (
                      <Bar key={t.k} label={t.k} n={t.n} max={digest.teams[0].n} color={C.green}
                           tail={<>{t.nights}n</>} />
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: 10.5, color: C.text3, marginTop: 9, lineHeight: 1.7 }}>
                  A full night is roughly a dozen tracked homers across nine spots, so even a whole
                  fortnight is a small sample per bucket. The top of the order leading is mostly the
                  top of the order batting more often — this is a picture, not a finding.
                </div>
              </div>

              {/* ── NIGHT BY NIGHT ────────────────────────────────────────── */}
              <div style={panel(C.text3)}>
                <Head icon="🗓" title="Night by night" note="tap a night to read its names" />
                {digest.nightRows.map((r) => (
                  <div key={r.date} style={{ borderTop: `1px solid ${C.border}` }}>
                    <button
                      onClick={() => setOpenNight(openNight === r.date ? null : r.date)}
                      style={{
                        display: 'flex', alignItems: 'baseline', gap: 9, width: '100%',
                        padding: '7px 2px', border: 'none', background: 'none', textAlign: 'left',
                        cursor: 'pointer', color: C.text, fontSize: 12,
                      }}
                    >
                      <b style={{ fontFamily: NUM_FONT, fontSize: 11 }}>{shortDate(r.date)}</b>
                      <Num color={C.orange}>{r.total}</Num>
                      <span style={{ fontSize: 10, color: C.text3 }}>HR</span>
                      {r.letterNight && (
                        <span style={{
                          fontSize: 9, fontFamily: NUM_FONT, fontWeight: 900, padding: '1.5px 7px',
                          borderRadius: 999, color: C.orange, border: `1px solid ${C.orange}66`,
                          background: `${C.orange}1a`,
                        }}>{r.lead.k} NIGHT · {r.lead.n}/{r.men}</span>
                      )}
                      {r.echoes > 0 && (
                        <span style={{ fontSize: 9.5, color: '#c084fc', fontFamily: NUM_FONT }}>
                          {r.echoes} echo{r.echoes === 1 ? '' : 'es'}
                        </span>
                      )}
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: C.text3 }}>
                        {openNight === r.date ? '▲' : '▼'}
                      </span>
                    </button>
                    {openNight === r.date && (
                      <div style={{ fontSize: 11.5, color: C.text2, padding: '0 2px 9px', lineHeight: 1.8 }}>
                        {r.names.join(' · ')}
                      </div>
                    )}
                  </div>
                ))}
                {digest.nights >= MIN_TELL && (
                  <div style={{ fontSize: 10.5, color: C.text3, marginTop: 10, lineHeight: 1.7 }}>
                    Nights this browser holds, newest first. Anything missing is a night nobody
                    opened the site on and the backfill has not reached — pull further back and it
                    fills in.
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
