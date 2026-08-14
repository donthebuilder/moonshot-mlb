'use client'
import { C, NUM_FONT } from '../lib/theme'
import { n, nn, clean, nameOf, hrScore } from '../lib/player'
import GameCockpit from './GameCockpit'
import Storylines from './Storylines'
import TeamVsStarter from './TeamVsStarter'

// GAME DEEP DIVE — what clicking a game actually earns you (2026-08-06).
//
// The strip chip used to just scroll; the selected game looked identical to
// every other section. Now the clicked game opens with an intelligence
// header: tonight's air, both pitching matchups in full (season + L3 trend +
// weak side + calibrated HR luck when the xHR fields carry), and each
// lineup's threat profile — all from slate fields already on the rows,
// assembled per game instead of scattered across four tabs.

const wTemp = (p) => n(p?.weather_temp_f, n(p?.temp_f, 0))
const wWind = (p) => n(p?.weather_wind_mph, n(p?.wind_mph, 0))

function Stat({ label, value, color, title }) {
  if (value == null || value === '' || value === '—') return null
  return (
    <div title={title} style={{ textAlign: 'center', minWidth: 40 }}>
      <div style={{ fontSize: 7.5, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 800 }}>{label}</div>
      <div style={{ fontFamily: NUM_FONT, fontSize: 13, fontWeight: 900, color: color || C.text }}>{value}</div>
    </div>
  )
}

function StarterPanel({ team, rows, onPlayerClick }) {
  // These rows are the hitters ON this team; their pitcher_* fields describe
  // the OPPOSING starter they face.
  const src = (k) => {
    for (const p of rows) { const v = p?.[k]; if (v !== null && v !== undefined && v !== '') return v }
    return null
  }
  const name = clean(src('pitcher_name'), 'TBD')
  const throws = clean(src('pitcher_throws'), '?')
  const hr9 = n(src('pitcher_hr9'), null)
  const l3hr9 = n(src('pitcher_l3_hr9'), null)
  const era = n(src('pitcher_era'), null)
  const whip = n(src('pitcher_whip'), null)
  const k9 = n(src('pitcher_k9'), null)
  const weakSide = clean(src('pitcher_weak_side'), '')
  const wsScore = n(src('pitcher_weak_side_score'), 0)
  const trend = clean(src('pitcher_trend_direction'), '')
  const xluck = n(src('pitcher_hr_luck'), 0)
  const xbbe = n(src('pitcher_xhr_bbe'), 0)
  const trendUp = /worse|up|hot/i.test(trend)

  // Lineup threat, this team's side.
  const sortedBats = [...rows].sort((a, b) => hrScore(b) - hrScore(a))
  const top3 = sortedBats.slice(0, 3)
  const weakCount = rows.filter((p) => p?.weak_spot_flag).length
  const avgHrw = rows.length ? rows.reduce((a, p) => a + nn(p?.hrw_score), 0) / rows.length : 0
  const picks = rows.filter((p) => String(p?.game_pick_role || '').trim())

  return (
    <div style={{
      flex: '1 1 300px', minWidth: 0, background: C.bg2,
      border: `1px solid ${C.border}`, borderRadius: 11, padding: '9px 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>{team} bats</span>
        <span style={{ fontSize: 10.5, color: C.text2, fontFamily: NUM_FONT }}>
          vs {name} ({throws}HP){rows.some((r2) => r2?.pitcher_projected) && (
            <span title="No probable announced — this is the bot's rotation projection (the arm whose turn it is), not an official listing" style={{ color: C.yellow }}> ≈ projected</span>
          )}
        </span>
        {trend && (
          <span style={{ fontSize: 9, fontFamily: NUM_FONT, color: trendUp ? '#4ade80' : C.text3 }}
            title="The starter's recent direction, from his L3 vs season gap">{trend}</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 7 }}>
        <Stat label="HR/9" value={hr9 != null ? hr9.toFixed(2) : null} color={hr9 >= 1.4 ? C.orange : undefined} />
        <Stat label="L3 HR/9" value={l3hr9 != null ? l3hr9.toFixed(2) : null}
          color={l3hr9 != null && hr9 != null && l3hr9 > hr9 + 0.2 ? C.orange : undefined}
          title="His last three starts — above his season number means he's bleeding lately" />
        <Stat label="ERA" value={era != null ? era.toFixed(2) : null} />
        <Stat label="WHIP" value={whip != null ? whip.toFixed(2) : null} />
        <Stat label="K/9" value={k9 != null ? k9.toFixed(1) : null}
          color={k9 != null && k9 >= 9.5 ? '#f87171' : undefined}
          title="High K/9 is the hitter's enemy — red when it's a strikeout arm" />
        {weakSide && (
          <Stat label="Weak vs" value={`${weakSide}${wsScore ? ` ${wsScore.toFixed(0)}` : ''}`} color={C.yellow}
            title="The batter side this arm bleeds against, and how hard" />
        )}
        {xbbe >= 50 && xluck !== 0 && (
          <Stat label="HR luck" value={`${xluck > 0 ? '+' : ''}${xluck.toFixed(1)}`}
            color={xluck < 0 ? C.orange : '#38bdf8'}
            title="Actual HRs allowed minus expected-from-contact (calibrated xHR). Negative = fewer than his contact deserved — regression says target him." />
        )}
      </div>

      <div style={{ borderTop: `1px dashed ${C.border2}`, marginTop: 8, paddingTop: 7 }}>
        <div style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, marginBottom: 4 }}>
          lineup: avg HRW <b style={{ color: avgHrw >= 55 ? C.orange : C.text2 }}>{avgHrw.toFixed(0)}</b>
          {' '}· <b style={{ color: weakCount ? C.yellow : C.text3 }}>{weakCount}</b> weak spot{weakCount === 1 ? '' : 's'}
          {picks.length > 0 && <> · picks: {picks.map((p) => `${String(p.game_pick_role).split('/')[0]} ${String(nameOf(p)).split(' ').slice(-1)[0]}`).join(', ')}</>}
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {top3.map((p) => (
            <button key={p?.player_id || nameOf(p)} onClick={() => onPlayerClick?.(p)} style={{
              display: 'flex', gap: 5, alignItems: 'baseline', cursor: 'pointer',
              border: `1px solid ${C.border}`, borderRadius: 7, padding: '3px 8px', background: 'transparent',
            }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: C.text }}>{nameOf(p)}</span>
              <span style={{ fontSize: 9.5, fontFamily: NUM_FONT, fontWeight: 800, color: C.orange }}>{hrScore(p).toFixed(0)}</span>
              {p?.weak_spot_flag && <span style={{ fontSize: 9 }}>⭐</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function GameDeepDive({ game, allPlayers = [], slateDate = '', results, onPlayerClick }) {
  const gp = game?.players || []
  if (!gp.length) return null
  const any = gp[0]
  const teams = [...new Set(gp.map((p) => clean(p?.team, '')).filter(Boolean))]
  const temp = wTemp(any), wind = wWind(any)
  const wLbl = clean(any?.wind_direction_label, '')
  const parkHR = n(any?.park_hr_factor, n(any?.park_dist_factor, 0))
  const humid = n(any?.weather_humidity, n(any?.humidity_pct, 0))
  const rain = n(any?.weather_precip_chance, n(any?.precip_chance, 0)) * 100
  const roof = clean(any?.roof, '')
  const out = /out/i.test(wLbl)

  return (
    <div style={{ marginBottom: 12 }}>
      {/* live cockpit — renders only while this game is actually in progress */}
      <GameCockpit game={game} onPlayerClick={onPlayerClick} />

      {/* conditions ribbon */}
      <div style={{
        display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline',
        background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.04))`,
        border: `1px solid ${C.border}`, borderRadius: 10, padding: '7px 12px', marginBottom: 8,
        fontFamily: NUM_FONT, fontSize: 10.5, color: C.text2,
      }}>
        <span style={{ fontWeight: 800, color: C.text, fontSize: 11 }}>{clean(any?.venue_name, 'Ballpark')}</span>
        {temp > 0 && <span style={{ color: temp >= 82 ? C.orange : temp <= 58 ? '#38bdf8' : C.text2 }}>{Math.round(temp)}°</span>}
        {wind > 0 && <span style={{ color: out ? C.orange : C.text2 }}>{out ? '↗' : /in\b/i.test(wLbl) ? '↙' : '→'} {Math.round(wind)} mph{wLbl ? ` ${wLbl}` : ''}</span>}
        {parkHR > 0 && <span title="Park HR factor — above 1.00 helps hitters" style={{ color: parkHR >= 1.03 ? C.orange : parkHR <= 0.97 ? '#38bdf8' : C.text3 }}>park ×{parkHR.toFixed(2)}</span>}
        {humid > 0 && <span title="Humid air is thinner — the ball carries a touch further" style={{ color: C.text3 }}>{Math.round(humid)}% hum</span>}
        {rain > 5 && <span style={{ color: '#38bdf8' }}>☔ {Math.round(rain)}%</span>}
        {roof && <span style={{ color: C.text3 }}>roof {roof}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 9, color: C.text3 }}>
          {game?.lineup_confirmed ? '✓ lineups confirmed' : '◻ projected'}
        </span>
      </div>

      {/* both sides */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {teams.map((t) => (
          <StarterPanel key={t} team={t} rows={gp.filter((p) => clean(p?.team, '') === t)} onPlayerClick={onPlayerClick} />
        ))}
      </div>

      {/* 🆚 career vs the starter, both sides (2026-08-14 — the competitor
          feature Donovan asked for: "team vs pitcher splits... needs to be
          accessible somewhere". Same table also lives in the pitcher
          modal's Lineup-he-faces tab; one component, two mounts.) */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {teams.map((t) => {
          const rows = gp.filter((p) => clean(p?.team, '') === t)
          const any = rows[0] || {}
          return (
            <div key={`vs-${t}`} style={{ flex: '1 1 330px', minWidth: 0 }}>
              <TeamVsStarter
                players={rows}
                team={t}
                pitcherName={clean(any?.pitcher_name, '')}
                pitcherThrows={clean(any?.pitcher_throws, '')}
                onPlayerClick={onPlayerClick}
                compact
              />
            </div>
          )
        })}
      </div>

      {/* this game's storylines — the same engine the Scoreboard runs,
          scoped to one building: its duels, revenge games, B2B bats,
          milestones in reach, birthdays and giveaway night (2026-08-08) */}
      <div style={{ marginTop: 8 }}>
        <Storylines
          players={gp}
          fetchPlayers={allPlayers.length ? allPlayers : gp}
          gamePk={game?.game_pk}
          compact
          slateDate={slateDate}
          results={results}
          onPlayerClick={onPlayerClick}
        />
      </div>
    </div>
  )
}
