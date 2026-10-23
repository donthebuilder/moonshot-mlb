'use client'
import { useEffect, useMemo, useState } from 'react'

import useScrollLock from '../lib/useScrollLock'
import { C, NUM_FONT } from '../lib/theme'
import { pitcherTiles } from '../lib/pitcherTiles'
import { n, clean, nameOf } from '../lib/player'
import { runningGame, runningGameLine } from '../lib/running'
import { verdictInk } from '../lib/scales'
import { PillRow } from './Filters'
import VerdictHero from './VerdictHero'
import PitcherTags from './PitcherTags'
import DenseTable from './DenseTable'
import CardShell from './CardShell'
import { mlbFaceStrict } from './PlayerFace'
import { PitcherSplitsTable, PitcherArsenal, PitcherZones } from './player/PitcherPortal'
import ShareCardButton from './card/ShareCardButton'
import { shareUrl, slug, stamp } from '../lib/cards/saveCard'
import PitcherSpots from './PitcherSpots'
import PitcherProfile from './PitcherProfile'
import SituationalSplits from './SituationalSplits'
import PitcherField from './PitcherField'
import SlotDamage from './SlotDamage'
import TeamVsStarter from './TeamVsStarter'
import GameLineup from './GameLineup'
import { PitcherSim } from './GameSimulator'

// The pitcher's own modal.
//
// Every board on this site is built around who's on the mound, and until now
// the only way to read a starter was to open a hitter and look at him sideways.
// Clicking a pitcher opens him directly.
//
// The bot never writes a pitcher row. It stamps pitcher fields onto every
// BATTER in the opposing lineup, so any of those rows carries his season line
// and they all agree. `lineup` is that set of hitters; the first row with a
// usable value wins, which is the same trick PitcherProfile and PitcherSpots
// already use. MatchupPitcher then wants one representative hitter for the
// platoon-matched arsenal — it gets the highest-HR-score bat in the lineup, and
// the panel says which side that is so nobody reads a lefty's split as the
// whole staff view.

// AT-A-GLANCE TILE (2026-08-14 upgrade — Donovan: "the pitchers page and
// modal need a full upgrade, bring it up to speed"). Same tile language his
// own hitter page header wears (label above a mono number, border tinted by
// meaning) — orange = good for the BATS facing him, blue = his strength.
function Tile({ label, value, tone, tip }) {
  return (
    <span title={tip} style={{
      display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, padding: '5px 8px', textAlign: 'center',
      border: `1px solid ${tone === 'hot' ? 'rgba(249,115,22,.5)' : tone === 'cold' ? 'rgba(96,165,250,.45)' : C.border}`,
      background: tone === 'hot' ? 'rgba(249,115,22,.07)' : tone === 'cold' ? 'rgba(96,165,250,.06)' : 'rgba(255,255,255,.02)',
      borderRadius: 8, cursor: tip ? 'inherit' : 'default',
    }}>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: C.text3, fontFamily: NUM_FONT, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 900, fontFamily: NUM_FONT, color: tone === 'hot' ? C.orange : tone === 'cold' ? C.blue : C.text }}>{value}</span>
    </span>
  )
}

// ══ TWO BANDS, IN ORDER (2026-08-23) ════════════════════════════════════════
//
// Donovan on the pitcher surfaces, three times: "so much reaching, not enough
// give and go info", "i dk what im looking at", "too much on mobile" — and,
// asked whether the arsenal or the splits should lead, "both. want the both to
// look better."
//
// Counted on a 390px render before this: hero, then a blowup panel, then TEN
// tag chips, then EIGHT stat tiles, then ELEVEN split buttons, then FIVE more
// tiles — thirty-four coloured elements before a sentence, and the two tile
// groups are the SAME statistics twice, adjacent, under different colour
// rules. Nothing there is wrong. Nothing there is ordered either, and an
// unordered wall is what "all over the place" means.
//
// So the modal gets the same two named bands the Pitchers page card got, in
// the same order, using the same words:
//
//   WHAT HE GIVES UP   the damage — his season line and his recent contact.
//   WHO GETS HIM       the splits — by hand, by park, by situation.
//
// "Both" is answered by titling each half rather than promoting one: on a
// phone you now read one question, then the other, and the heading tells you
// which one you are in. Nothing was removed — every tile, chip and control
// still renders, in the band it belongs to.

const TABS = [
  // 2026-10-23: the front is his arsenal to each side and his zones, as tables and boxes (components/player/PitcherPortal.js)
  { key: 'matchup', label: '🥎 Arsenal + zones' },
  { key: 'lineup',  label: '📋 Lineup he faces' },
  { key: 'profile', label: '📊 Command + splits' },
  { key: 'sim',     label: '🎮 Sim' },
]

// THE SPLITS (2026-10-23): one table, components/player/PitcherPortal.js PitcherSplitsTable (it was a pill picker, one split at a time).

export default function PitcherModal({ pitcher, slateMode, onClose, onPlayerClick }) {
  useScrollLock(Boolean(pitcher))
  const [tab, setTab] = useState('matchup')

  const lineup = useMemo(() => (pitcher?.lineup || []).filter(Boolean), [pitcher])


  // A RAW row carrying the 98 pitcher_* stat fields, for the tag rules.
  const tagRow = useMemo(() => {
    const rows = lineup.map((b) => b?.raw).filter(Boolean)
    return rows.find((r) => r.pitcher_hr9 != null) || rows[0] || null
  }, [lineup])

  const rows = useMemo(() => lineup.map((b) => {
    const raw = b?.raw || {}
    return {
      _key: b?.player_id ?? b?.name,
      _raw: raw,
      spot: n(b?.lineup_spot ?? raw?.lineup_spot, null),
      batter: clean(b?.name, nameOf(raw)),
      bats: clean(b?.bats ?? raw?.bats, '?'),
      hr: n(raw?.hr_score, 0),
      hrw: n(raw?.hrw_score, 0),
      hit: n(raw?.hit_score, 0),
      ev: n(raw?.recent_ev, 0) || null,
      ihr: n(raw?.recent_ideal_hr_contact, 0) * 100,
      l5hr: n(raw?.last5_hr, 0),
      seasonHr: n(raw?.season_hr, 0),
      weak: raw?.weak_spot_flag ? 1 : 0,
      match: n(raw?.pitch_type_match_score, 0) > 0 ? 1 : 0,
      spotDmg: n(raw?.pitcher_spot_damage_score, 0),
    }
  }), [lineup])

  if (!pitcher) return null

  const src = (k) => {
    for (const b of lineup) {
      const v = b?.raw?.[k]
      if (v !== null && v !== undefined && v !== '') return v
    }
    return null
  }
  // groupPitchers() builds these rows, so the pitcher-level fields are named
  // pitcher_name / pitcher_throws / team, not name / throws.
  const name = clean(pitcher?.pitcher_name ?? src('pitcher_name'), 'Unknown')
  const throws = clean(pitcher?.pitcher_throws ?? src('pitcher_throws'), '?')
  const team = clean(pitcher?.team ?? src('pitcher_team'), '')
  const opp = clean(pitcher?.opponent_team, '')
  const weakSide = clean(src('pitcher_weak_side'), '')
  const hr9 = n(src('pitcher_hr9'), null)

  // The at-a-glance row (2026-08-14) — every number was already on the
  // opposing hitters' rows; the modal just never surfaced them above the
  // fold. Thresholds mirror the starter table's own documented slate means
  // (FB% ~38, HH% ~38, Brl% ~7; HR/9 1.3+ hot / 0.85- wall).
  const era = n(pitcher?.pitcher_era ?? src('pitcher_era'), null)
  const whip = n(pitcher?.pitcher_whip ?? src('pitcher_whip'), null)
  const k9 = n(src('pitcher_k9'), null)
  const fbAllowed = n(src('pitcher_fb_rate'), null)
  const hhAllowed = n(src('pitcher_hardhit_allowed'), null)
  const brlAllowed = n(src('pitcher_barrel_allowed'), null)
  const l3hr9 = n(src('pitcher_l3_hr9'), null)
  const l3n = n(src('pitcher_l3_starts_found'), 0)

  // ── the hero's numbers and its sentence ───────────────────────────────────
  // "the words for the pitcher ... i wanted to be shown" — this is the line
  // that says, in plain English, what kind of arm this is before any table
  // does. It only ever states fields the bot actually published; a missing
  // one drops out of the sentence rather than printing a zero.
  const attack = n(src('pitcher_attack_score'), null)
  const attackTag = clean(src('pitcher_attack_tag'), '')
  // Warm = good for the BATS, the site-wide verdict pair. 30+ is the "genuinely
  // high" line MatchupPitcher.js already draws on this same field; under 12 is
  // the bottom fifth of tonight's starters.
  const attackInk = verdictInk(attack == null ? null : attack >= 30 ? true : attack <= 12 ? false : null)
  // the tiles are lib/pitcherTiles.js (shared with the server's pitcher share card)
  const tiles = pitcherTiles({ era, whip, hr9, k9, fbAllowed, hhAllowed, brlAllowed, l3hr9, l3n })

  // THE RUNNING GAME (what he gives away), resolved once for the tiles
  const rgRow = (lineup.find((b) => b?.raw?.pitcher_running_game_status) || lineup[0])?.raw
  const rg = runningGame(rgRow)
  const pc = (v, d = 0) => `${(v * 100).toFixed(d)}%`
  // the hero holds his four headline numbers (the batter card's way, 2026-10-23); the rest sit in one grid under the flags
  const headline = tiles.filter((t) => ['ERA', 'WHIP', 'HR/9', 'K/9'].includes(t.label))
  const rest = tiles.filter((t) => !['ERA', 'WHIP', 'HR/9', 'K/9'].includes(t.label))
  const awayTiles = rg.ok ? [
    { label: 'Run on him', value: rg.attempts == null ? '—' : String(rg.attempts), tip: `Stolen-base attempts against him this season${rg.attempts ? ` (${rg.sb} SB · ${rg.cs} CS)` : ''}.` },
    { label: 'Thrown out', value: rg.csRate == null ? '—' : pc(rg.csRate), tip: rg.csWhy || 'Caught stealing on those attempts -- the catcher’s number as much as his.' },
    { label: 'WP/9', value: rg.wp9 == null ? '—' : rg.wp9.toFixed(2), tip: 'Wild pitches per nine innings.' },
    { label: 'Pickoffs', value: rg.pickRate == null ? '—' : pc(rg.pickRate, 1), tip: rg.pickWhy || 'Share of the baserunners he allows that he picks off.' },
    ...(rg.defence.ok && rg.defence.oaa != null ? [{ label: 'Defense', value: `${rg.defence.oaa > 0 ? '+' : ''}${rg.defence.oaa}`, tip: 'Outs Above Average for the gloves behind him (Baseball Savant). Positive = they take hits away.' }] : []),
  ] : []

  return (
    // THE BATTER CARD'S SHELL (2026-10-23): the same wide card as a hitter's (components/CardShell.js fill), so the two read as one product
    <CardShell onClose={onClose} width={1760} fill label={`${name} card`}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 }}>
            {/* 📸 his card as a baseball card: the at-a-glance tiles and his toughest lineup matchup */}
            <ShareCardButton sport="mlb" what="his card" url={shareUrl({ kind: 'pitcher', sport: 'mlb', id: pitcher?.pitcher_id })} filename={`pitcher-${slug(name, 'pitcher')}_${stamp('')}.png`} />
          </div>

          {/* THE TOP, THE BATTER CARD'S WAY (2026-10-23, Donovan: the pitcher card "is where this [all] stemmed from"): who he is,
              his four numbers and his flags on the left with everything he gives up and gives away under them; every split he
              has on the right, as one table. The sentences (the hero line, The read, the band notes) are gone. */}
          <div className="portal-top">
          <div className="portal-who">
          <VerdictHero
            style={{ marginBottom: 10 }}
            photo={pitcher?.pitcher_id ? mlbFaceStrict(String(pitcher.pitcher_id), 128) : null}
            col={attackInk.color}
            score={attack}
            max={55}
            dp={attack != null && attack < 10 ? 1 : 0}
            dialTitle={`Attack score ${attack == null ? '—' : attack.toFixed(1)} — how much this arm gives the bats. The slate runs about 0–55 with a median near 18, and the ring is drawn against 55, not 100.`}
            title={name}
            badge={attackTag && attackTag !== 'Neutral' ? attackTag : `${throws}HP`}
            badgeQuiet={!attackTag || attackTag === 'Neutral'}
            meta={`${throws}HP · ${team}${opp ? ` vs ${opp}` : ''} · ${lineup.length} hitter${lineup.length === 1 ? '' : 's'}${pitcher?.lineup_confirmed === false ? ' · projected' : ''}`}
            market="attack score"
            footer={<div style={{ display: 'grid', gridTemplateColumns: `repeat(${headline.length || 1}, minmax(0, 1fr))`, gap: 4 }}>{headline.map((t) => <Tile key={t.label} {...t} />)}</div>}
            right={(
              <button onClick={onClose} aria-label="Close" style={{
                background: 'transparent', border: 'none', color: C.text3, fontSize: 20,
                cursor: 'pointer', lineHeight: 1, padding: '2px 6px', margin: '0 -6px 0 0',
                flexShrink: 0,
              }}>✕</button>
            )}
          />
          {/* the flags (the tag row), one row over his numbers */}
          <PitcherTags
            row={tagRow}
            extraChips={[
              weakSide ? { label: `Weak vs ${weakSide}`, why: 'MOONSHOT’s own split read' } : null,
              clean(src('pitcher_attack_tag'), '') !== '—' && clean(src('pitcher_attack_tag'), '') ? { label: clean(src('pitcher_attack_tag')), why: 'MOONSHOT’s coarse attack bucket — three buckets, not independent of the other tags' } : null,
              src('pitcher_low_k_flag') ? { label: 'Low K', why: 'MOONSHOT’s low-strikeout flag' } : null,
              src('weak_pitcher_flag') ? { label: 'Weak arm', why: 'MOONSHOT’s weak-pitcher flag — fired on 37 of 59 measured arms, informative but not independent' } : null,
            ]}
          />
          {/* what he gives up (contact) and what he gives away (the running game), one grid of tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 6, margin: '4px 0 6px' }}>
            {rest.map((t) => <Tile key={t.label} {...t} />)}
            {awayTiles.map((t) => <Tile key={t.label} {...t} />)}
          </div>
          {rg.ok && rg.catcher.ok && rg.catcher.name ? <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginBottom: 8 }}>{rg.catcher.name} catching{rg.catcher.source === 'roster' ? ' (roster)' : ''} · orange = good for the bats · blue = his strength</div> : null}
          {/* WHO GETS HIM: tonight's lineup against him, the best bats first (the full table is the Lineup tab) */}
          {rows.length > 0 && (
            <section aria-label="Who gets him" style={{ marginTop: 4 }}>
              <div style={{ font: `900 12px/1.2 ${NUM_FONT}`, letterSpacing: '.08em', color: C.text, marginBottom: 6 }}>WHO GETS HIM <span style={{ color: C.text3, fontWeight: 700, fontSize: 10 }}>tonight’s lineup, best bats first</span></div>
              <DenseTable
                rows={[...rows].sort((x, y) => y.hr - x.hr)}
                columns={[
                  { key: 'batter', label: 'Batter', group: 'Batter', w: 140, heat: false, sticky: true, bold: true, numeric: false },
                  { key: 'spot', label: '#', group: 'Batter', w: 30, heat: false, title: 'Lineup spot' },
                  { key: 'bats', label: 'B', group: 'Batter', w: 30, heat: false, numeric: false, title: 'Bats' },
                  { key: 'hr', label: 'HR SCORE', group: 'Tonight', w: 70, dp: 0, primary: true, title: 'MOONSHOT’s HR score for him tonight' },
                  { key: 'l5hr', label: 'L5 HR', group: 'Form', w: 50, title: 'Homers in his last 5 games' },
                  { key: 'seasonHr', label: 'HR', group: 'Form', w: 40, title: 'Homers this season' },
                ]}
                initialSort={null} maxRows={5} maxHeight={9999}
                onRowClick={onPlayerClick ? (r) => onPlayerClick(r?._raw ?? r) : null}
                caption="Tap a hitter for his card." />
            </section>
          )}
          </div>
          <div className="portal-read">
            <PitcherSplitsTable src={src} pitcherId={pitcher?.pitcher_id} />
          </div>
          </div>

          <div style={{ marginBottom: 16, borderBottom: `1px solid ${C.border}`, paddingBottom: 10 }}>
            <PillRow
              value={tab}
              options={TABS}
              onChange={setTab}
            />
          </div>

          {/* THE FRONT (2026-10-23): his arsenal to each side | his zones (where he throws, where he gets hit) */}
          {tab === 'matchup' && (
            <div className="matchup-grid">
              <PitcherArsenal pitcherId={pitcher?.pitcher_id} slateMode={slateMode} />
              <PitcherZones pitcherId={pitcher?.pitcher_id} name={name} />
            </div>
          )}

          {tab === 'lineup' && (
            rows.length
              ? (
                <>
                  {/* 🆚 career vs him, first (2026-08-14 — the competitor
                      feature Donovan asked for; full column set here since
                      the modal has the width. Same component rides in each
                      game's deep-dive in compact form.) */}
                  <TeamVsStarter
                    players={lineup.map((b) => b?.raw).filter(Boolean)}
                    team={opp}
                    pitcherName={name}
                    pitcherThrows={throws}
                    onPlayerClick={onPlayerClick}
                    lead
                  />
                  {/* ── THE FULL TABLE, THE SAME ONE (2026-08-17) ────────────
                      Donovan: "the full table of players should be shown in
                      the pitcher as well." This tab had a 13-column summary of
                      its own; the Games page has the full ~35-column lineup
                      table. Two tables for one lineup drift, and the smaller
                      one always loses. GameLineup mounts here now — identical
                      component, identical columns, table-first default, the
                      spot read one pill over. */}
                  <GameLineup
                    players={lineup.map((b) => b?.raw).filter(Boolean)}
                    onPlayerClick={onPlayerClick}
                  />
                  <PitcherSpots pitcher={pitcher} onPlayerClick={onPlayerClick} />
                </>
              )
              : <div style={{ fontSize: 11.5, color: C.text3 }}>No lineup for this game yet.</div>
          )}

          {tab === 'profile' && (
            <>
              <PitcherProfile pitcher={pitcher} />
              {/* The damage field: spray-chart-shaped read of where his
                  allowed damage goes, from verified rates. A true spray needs
                  coordinates the payload doesn't publish for pitchers, and
                  the component says so on its face. */}
              <PitcherField pitcher={pitcher} />
              <SlotDamage pitcher={pitcher} />
              {/* Live from MLB StatsAPI: home/away HR9, the pitches-1–75 vs
                  76+ fatigue split (the API's stand-in for times through the
                  order), and rest-day ERA. Not bot data, not in any score —
                  the block says so on its face. */}
              <SituationalSplits playerId={pitcher?.pitcher_id} kind="pitcher" />
            </>
          )}

          {tab === 'sim' && <PitcherSim getStat={src} name={name} />}
    </CardShell>
  )
}
