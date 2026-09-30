'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import FootballField from './FootballField'
import { ChipGroup } from '../matchup/SprayParts'
import { SIDES, DEPTHS, DEPTH_AX, LANES, LANE_AX, LANE_WORD, phrase } from './MatchupMap'

// 🏈 WHERE HE GETS THE BALL (2026-09-29, Donovan: "do we have anything like
// [the spray chart] for NFL? make that better too"). Football's spray chart:
// every target he drew in the twelve zones of the field (left / middle /
// right x long / medium / quick / behind the line) or every carry in the
// seven run lanes, his share of each, and a tap for the zone's own line --
// targets, catches, yards, TDs. "Vs a typical player" shades by how much more
// (or less) of his work goes there than the league's share of that zone.
//
// Built from MOONSHOT's pieces: the zone tiles are MatchupParts HeatTiles
// (MOONSHOT's zone grid), the switches are the spray chart's ChipGroup.
// Source: nfl_matchup.json field.player_pass / player_rush (play-by-play,
// the season the matchup file is on) and league_pass / league_rush. There is
// no per-target x/y in the published data, so this is zones, not dots.

const pctOf = (n, d) => (d > 0 ? (100 * n) / d : 0)

export default function TouchMap({ field, player, season = null }) {
  const pid = player?.player_id
  const pass = field?.player_pass?.[pid]
  const rush = field?.player_rush?.[pid]
  const sum = (m, zs) => zs.reduce((a, z) => a + (m?.[z]?.att || 0), 0)
  const passZ = SIDES.flatMap((s) => DEPTHS.map((d) => `${s}|${d}`))
  const passN = sum(pass, passZ)
  const rushN = sum(rush, LANES)
  const [kind, setKind] = useState(passN >= rushN ? 'pass' : 'rush')
  const [mode, setMode] = useState('him')
  const [pick, setPick] = useState(null)

  const model = useMemo(() => {
    const isPass = kind === 'pass'
    const mine = isPass ? pass : rush
    const lg = isPass ? field?.league_pass : field?.league_rush
    if (!mine) return null
    // Tiles run row by row: depth rows (long at the top), sides across.
    const zones = isPass ? DEPTHS.flatMap((d) => SIDES.map((s) => `${s}|${d}`)) : LANES
    const n = sum(mine, zones)
    const lgN = sum(lg, zones)
    const cells = zones.map((z) => {
      const m = mine[z] || {}
      const share = pctOf(m.att || 0, n)
      const lgShare = pctOf(lg?.[z]?.att || 0, lgN)
      const diff = share - lgShare
      return {
        key: z, z, m, share, lgShare, diff,
        big: m.att ? `${Math.round(share)}%` : '·',
        small: m.att ? (isPass ? `${m.cmp || 0}/${m.att}${m.td ? ` · ${m.td}TD` : ''}` : `${m.att}${m.td ? ` · ${m.td}TD` : ''}`) : null,
        heat: mode === 'him' ? (m.att ? Math.min(1, share / 30) : null) : (diff > 0 ? Math.min(1, diff / 12) : null),
        title: isPass ? phrase(z) : LANE_WORD[z],
      }
    })
    const top = [...cells].sort((a, b) => b.share - a.share)[0]
    return { cells, n, isPass, top }
  }, [kind, mode, pass, rush, field])

  if (!pass && !rush) return null
  const unit = kind === 'pass' ? 'targets' : 'carries'
  const c = pick && model?.cells.find((x) => x.key === pick)
  const nf = { theme: C, numFont: NUM_FONT }
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <ChipGroup {...nf} first label="Ball" value={kind} onChange={(k) => { setKind(k); setPick(null) }} color={C.green}
          options={[{ k: 'pass', label: 'Targets', n: passN, title: 'Where he was thrown to' }, { k: 'rush', label: 'Carries', n: rushN, title: 'Which lane he ran' }]} />
        <ChipGroup {...nf} label="Shade" value={mode} onChange={setMode} color={C.cyan}
          options={[{ k: 'him', label: 'His share', n: model?.n ?? 0, title: 'Darker = more of his work goes there' }, { k: 'lg', label: 'Vs a typical player', n: model?.n ?? 0, title: 'Shaded only where he goes MORE than the league share of that zone' }]} />
      </div>
      {model ? (
        <>
          {/* THE FIELD, DRAWN (2026-09-30, components/nfl/FootballField.js):
              the zones painted on the grass, or the run holes as arrows at the
              line -- was a grid of tiles. */}
          {model.top?.m?.att ? <p style={{ margin: '0 0 8px', fontSize: 12.5, lineHeight: 1.5, color: C.text2 }}>His biggest zone: <b style={{ color: C.text }}>{model.isPass ? phrase(model.top.z) : LANE_WORD[model.top.z].replace(/^runs /, '')}</b> — {Math.round(model.top.share)}% of his {model.n} {unit}{season ? ` in ${season}` : ''}.</p> : null}
          <FootballField mode={model.isPass ? 'pass' : 'rush'} maxWidth={model.isPass ? 360 : 420}
            cells={Object.fromEntries(model.cells.map((x) => [x.key, { big: x.big, small: x.small, heat: x.heat, title: x.title, len: x.share / 40 }]))}
            onPick={(key) => setPick(pick === key ? null : key)} pickedKey={pick} />
          <div style={{ height: 8 }} />
          <div aria-live="polite" style={{ minHeight: 40, padding: '7px 10px', borderRadius: 9, border: `1px solid ${C.border}`, background: C.bg2, font: `700 10.5px/1.5 ${NUM_FONT}`, color: C.text2, maxWidth: 460 }}>
            {!c ? <span style={{ color: C.text3 }}>Tap a zone for his line there.</span> : (
              <>
                <b style={{ color: C.text }}>{model.isPass ? phrase(c.z) : LANE_WORD[c.z]}</b>
                {' · '}{c.m.att || 0} {unit}
                {model.isPass ? <>{' · '}{c.m.cmp || 0} caught{c.m.att ? ` (${Math.round(pctOf(c.m.cmp || 0, c.m.att))}%)` : ''}</> : null}
                {' · '}{c.m.yds || 0} yds{c.m.att ? ` (${(model.isPass ? c.m.ypa : c.m.ypc) ?? ((c.m.yds || 0) / c.m.att).toFixed(1)} a ${model.isPass ? 'target' : 'carry'})` : ''}
                {' · '}<b style={{ color: c.m.td ? C.green : C.text3 }}>{c.m.td || 0} TD</b>
                {' · '}{Math.round(c.share)}% of his {unit} vs {Math.round(c.lgShare)}% for a typical player
              </>
            )}
          </div>
          {model.n < 20 && <div style={{ fontSize: 10, color: C.text3, marginTop: 6 }}>Built on {model.n} {unit} — thin enough that the shape is a hint, not a tendency.</div>}
        </>
      ) : <div style={{ fontSize: 11, color: C.text3 }}>No {unit} on file for him yet.</div>}
    </div>
  )
}
