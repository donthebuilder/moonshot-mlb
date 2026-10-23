'use client'
import { useEffect, useState } from 'react'
import { SPORT_ACCENT } from '../lib/sportAccent'
import { championshipConfig, loadChampionship } from '../lib/championship'
import { awardsConfig, loadAwards } from '../lib/awards'
import TeamMark from './TeamMark'

// 🏆 THE RACES, ONE SMALL ROW (2026-10-22, Donovan: "the championship races, MVP ... the standard 2-3 awards people watch throughout
// the season ... throw that somewhere on the homepage, just like a little tracker, something cute"). Who leads the title race and the
// first three award races, by the same files the Leaders page's tables read (lib/championship, lib/awards). Names only -- no share --
// so it says the same thing on every product (NHL / NBA never print a model's chance). A race still 'waiting' is left out; nothing
// here draws until a file reads. The row opens Leaders, where the full races are.
const AWARD_TILES = 3

export default function RaceTracker({ sport, theme: C, numFont, onOpen = null }) {
  const accent = SPORT_ACCENT[sport] || C.text
  const ccfg = championshipConfig(sport)
  const [title, setTitle] = useState(null)
  const [awards, setAwards] = useState(null)
  useEffect(() => {
    let alive = true
    loadChampionship(sport).then((r) => {
      if (!alive || !r?.ok) return
      const lead = [...r.teams].sort((a, b) => Number(b[ccfg.champion]) - Number(a[ccfg.champion]))[0]
      if (lead) setTitle(lead)
    }).catch(() => {})
    if (awardsConfig(sport)) loadAwards(sport).then((r) => { if (alive && r?.ok) setAwards(r) }).catch(() => {})
    return () => { alive = false }
  }, [sport, ccfg])
  const races = (awards?.races || []).filter((r) => r.status !== 'waiting' && r.rows?.length).slice(0, AWARD_TILES)
  const tiles = [
    ...(title ? [{ k: 'title', label: ccfg.championLabel, mark: title.abbr, name: title.abbr || title.name }] : []),
    ...races.map((r) => ({ k: r.key, label: r.label, mark: r.rows[0].team, name: r.rows[0].name })),
  ]
  if (!tiles.length) return null
  return (
    <section aria-label="The races">
      <div style={{ font: `900 10px/1 ${numFont}`, letterSpacing: '.12em', color: C.text3, margin: '0 0 6px' }}>THE RACES · WHO LEADS</div>
      <div className="race-tracker" style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {tiles.map((t) => (
          <button key={t.k} type="button" data-tile="race" onClick={onOpen || undefined} aria-label={`${t.label}: ${t.name} leads`}
            style={{ flex: '0 0 auto', minWidth: 118, minHeight: 44, display: 'grid', gap: 4, padding: '8px 10px', borderRadius: 12, cursor: onOpen ? 'pointer' : 'default', textAlign: 'left',
              border: `1px solid color-mix(in srgb, ${accent} 30%, ${C.border})`, background: `linear-gradient(160deg, color-mix(in srgb, ${accent} 10%, transparent), ${C.bg2} 70%)`, color: C.text }}>
            <span style={{ font: `900 10px/1 ${numFont}`, letterSpacing: '.1em', color: accent }}>{t.k === 'title' ? '🏆 ' : '🏅 '}{String(t.label).toUpperCase()}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap' }}>
              {t.mark ? <TeamMark sport={sport} abbr={t.mark} variant="logo" px={16} /> : null}{t.name}
            </span>
          </button>
        ))}
      </div>
      <style>{'.race-tracker::-webkit-scrollbar{display:none}'}</style>
    </section>
  )
}
