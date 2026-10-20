// FEATURE NAMES IN PLAIN ENGLISH (2026-10-12, accuracy loop). Words only.
// A stored feature key ("legs.shotsPg", "pct.toi", "components.pmix") becomes the phrase a visitor reads. Anything not
// listed is humanised from its key, so a new stored input never prints as raw code. No word here predicts anything.
const WORDS = {
  // NHL legs / context
  toi: 'ice time', goalsPg: 'goals a game', shotsPg: 'shots a game', ptsPg: 'points a game', astPg: 'assists a game', gpCur: 'games played this season', gpPrev: 'games played last season',
  gpPooled: 'games in the form window', prevWeight: 'weight on last season', oppGaPg: 'opponent goals against a game',
  oppSaPg: 'opponent shots against a game', b2b: 'a back-to-back flag', lineupKnown: 'a known lineup', staleSeason: 'a last-season-only flag',
  // MLB components
  pmix: 'pitch-mix fit', pitch_type_match: 'pitch-type match', ihr: 'recent home-run share', zone_damage: 'zone damage', spot_damage: 'spot damage',
  pull_rate: 'pull rate', fb_rate: 'fly-ball rate', barrel_rate: 'barrel rate', damage_conversion: 'damage conversion', weak_side: 'weak-side fit',
  pitcher_hr9: 'pitcher home runs per nine', batted_shape: 'batted-ball shape', shape_max_ev: 'top exit velocity', season_power: 'season power',
  pitcher_side_ops: 'pitcher OPS against his side', pa_per_hr: 'plate appearances per home run', hr_per_pa: 'home runs per plate appearance',
  recent_form_last5_hr: 'home runs in his last 5', recent_form_last10_hr: 'home runs in his last 10', games_since_last_hr: 'games since his last home run',
  season_iso: 'season isolated power', recent_ev: 'recent exit velocity', recent_hard_hit_rate: 'recent hard-hit rate', recent_blast_rate: 'recent blast rate',
  recent_avg_distance: 'recent average distance', recent_squared_up_sample: 'recent batted balls tracked', carryover: 'carried-over rating', recent_squared_up_rate: 'recent squared-up rate', season_hr_game_probability: 'season home-run-game rate',
  // NFL components
  f_rz_opp: 'red-zone opportunity', implied_total: 'game implied total', f_touches: 'touches', f_xtd: 'expected touchdowns', f_gl_opp: 'goal-line opportunity',
  f_snap_pct: 'snap share', f_wopr: 'weighted opportunity rating', f_receiving_yards: 'receiving yards', f_receiving_air_yards: 'air yards', opp_pass_soft: 'pass-defense softness',
  f_target_share: 'target share', f_receptions: 'receptions', f_targets: 'targets', f_carries: 'carries', f_rushing_yards: 'rushing yards', f_rz_car: 'red-zone carries',
  oppr_rush_soft: 'rush-defense softness',
  home: 'playing at home',
}
const humanise = (k) => String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_.]+/g, ' ').replace(/^f /, '').trim().toLowerCase()

/** "legs.shotsPg" -> "shots a game"; "pct.toi" -> "ice time percentile". */
export function featureLabel(key) {
  const k = String(key)
  const dot = k.indexOf('.')
  const prefix = dot > 0 ? k.slice(0, dot) : ''
  const base = dot > 0 ? k.slice(dot + 1) : k
  const w = WORDS[base] || humanise(base)
  return prefix === 'pct' ? `${w} percentile` : w
}

// Feature names a public line never uses: drought / streak language reads as "due" or "hot", which the site never says.
// The private report keeps them (they are still compared, under their own names).
export const PUBLIC_DENY = /games_since|streak|\bhot\b|\bcold\b|\bdue\b|last5|last10|l20pa|l25pa|form/i

export const GROUP_WORDS = {
  gotAway: 'Players who got away',
  called: 'the called set',
  notCalledMiss: 'other players who were not called',
  calledHit: 'Called players who cleared',
  calledMiss: 'called players who did not',
}

/** One neutral description line. Description of two groups, never a prediction or an instruction. */
export function describeLine({ a, b, feature, direction, nA, nB }) {
  return `${a} had a ${direction} median for ${featureLabel(feature)} than ${b} (season so far, n=${nA} vs ${nB}).`
}
