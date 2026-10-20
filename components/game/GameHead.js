'use client'
import Tap from '../Tap'
import { useTeamNav } from '../../lib/teamNav'

// THE GAME PAGE'S HEADER, SHARED (2026-10-20, Donovan: "buckets doesnt feel shared"). LAMP's game header (components/lamp/tabs/Game.js,
// unchanged pixel for pixel) lifted out so BUCKETS draws the same one: an eyebrow row (product · GAME, a chip, season / day, the 📸 on
// the right), each club once and big -- logo, code (opens the club), its name, its record -- the score or "@" between them with the
// status under it, then a row for the venue and anything the sport puts beside it. Theme and words come in; no sport branches here.

function Side({ team, lead, align, C, NUM_FONT }) {
  const teamNav = useTeamNav()
  return (
    <div style={{ display: 'flex', flexDirection: align === 'right' ? 'row-reverse' : 'row', alignItems: 'center', gap: 10, minWidth: 0, justifyContent: 'flex-start' }}>
      <img src={team.logo} alt="" width={44} height={44} style={{ width: 44, height: 44, flex: 'none', objectFit: 'contain' }} />
      <div style={{ textAlign: align, minWidth: 0 }}>
        <div style={{ font: `900 15px/1 ${NUM_FONT}`, color: lead ? C.text : C.text2, letterSpacing: '.04em' }}>{teamNav ? <Tap onClick={() => teamNav(team.abbrev)}>{team.abbrev}</Tap> : team.abbrev}</div>
        <div style={{ marginTop: 4, color: C.text3, fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{team.name}</div>
        {team.record && <div style={{ marginTop: 3, color: C.text3, font: `800 9px/1 ${NUM_FONT}` }}>{team.record}</div>}
      </div>
    </div>
  )
}

/**
 * @param away / home  { abbrev, name, record?, score?, logo }
 * @param state        'pre' | 'live' | 'final' (anything else reads as pre)
 * @param status       the line under the score ("Tue, Oct 20 · 4:00 PM MST", "P2 12:31", "Final")
 * @param liveInk      the live status colour; liveDot the sport's live dot
 * @param eyebrow / chip / meta / share   the top row; under / venue / beside / foot   below the clubs
 */
export default function GameHead({ C, NUM_FONT, accent, eyebrow, chip = null, meta = '', share = null, away, home, state, status, liveInk, liveDot = null, under = null, venue = '', beside = null, foot = null }) {
  const live = state === 'live'; const done = state === 'final'; const scored = live || done
  const lead = (side) => scored && side.score != null && side.score > (side === away ? home : away).score
  return (
    <header style={{ borderBottom: `1px solid ${C.border2}`, paddingBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ color: accent, font: `900 8px/1 ${NUM_FONT}`, letterSpacing: '.14em' }}>{eyebrow}</span>
        {chip}
        {meta ? <span style={{ color: C.text3, font: `800 8px/1 ${NUM_FONT}`, letterSpacing: '.08em' }}>{meta}</span> : null}
        {share}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10 }}>
        <Side team={away} lead={lead(away)} align="left" C={C} NUM_FONT={NUM_FONT} />
        <div style={{ textAlign: 'center', minWidth: 96 }}>
          <div style={{ font: `900 34px/1 ${NUM_FONT}`, color: C.text, letterSpacing: '-.02em' }}>
            {scored ? <><span style={{ color: lead(away) ? C.text : C.text2 }}>{away.score ?? '–'}</span><span style={{ color: C.text3, margin: '0 8px', fontWeight: 400 }}>–</span><span style={{ color: lead(home) ? C.text : C.text2 }}>{home.score ?? '–'}</span></> : <span style={{ color: C.text3, fontSize: 18 }}>@</span>}
          </div>
          <div style={{ marginTop: 6, color: live ? liveInk : done ? C.text2 : C.text3, font: `900 10px/1.3 ${NUM_FONT}`, letterSpacing: '.06em' }}>
            {live && liveDot}{status}
          </div>
          {under}
        </div>
        <Side team={home} lead={lead(home)} align="right" C={C} NUM_FONT={NUM_FONT} />
      </div>
      {(venue || beside) && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 10 }}>
          <span style={{ color: C.text3, fontSize: 11 }}>{venue}</span>
          {beside}
        </div>
      )}
      {foot}
    </header>
  )
}
