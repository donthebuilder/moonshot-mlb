// THE SCORE'S COMPONENT VOCABULARY — the plain, server-safe half.
//
// SPLIT OUT 2026-09-18. components/nfl/ScoreAnatomy.js carries 'use client',
// which Next's production runtime enforces as a hard server/client boundary:
// importing ANY export from that file on the server throws, even a plain
// object with no React in it. This is the exact failure lib/b2bCore.js was
// split out of lib/b2b.js for on 2026-09-08 ("Attempted to call backToBack()
// from the server but backToBack is on the client"), and the NFL tweet feed
// needs these two tables server-side to name a score's components in a post.
//
// LABELS and WHY have never touched React. ScoreAnatomy.js re-exports both so
// its existing importers (StatPortal, Picks, Touchdowns, Boards,
// NflPlayerModal) do not change, and there is still exactly one definition of
// what a component is called -- rule #21, one place, not two drifting copies.

export const LABELS = {
  f_gl_opp: 'Goal-line opportunity',
  f_rz_opp: 'Red-zone touches',
  implied_total: 'Implied team total',
  f_xtd: 'Expected TDs',
  f_touches: 'Touches (carries + targets)',
  f_snap_pct: 'Snap share',
  opp_td_soft: 'Defense TD softness',
  td_regression: 'TD regression (due)',
  f_wopr: 'WOPR (opportunity)',
  f_receiving_yards: 'Receiving yards form',
  f_receiving_air_yards: 'Air yards (depth)',
  opp_pass_soft: 'Defense pass softness',
  f_target_share: 'Target share',
  f_receptions: 'Receptions form',
  f_targets: 'Targets',
  f_carries: 'Carries',
  f_rushing_yards: 'Rushing yards form',
  f_rz_car: 'Red-zone carries',
  f_ngs_rush_yards_over_expected_per_att: 'RYOE per attempt (NGS)',
  total_line: 'Game total',
  f_passing_yards: 'Passing yards form',
  f_attempts: 'Pass attempts',
  f_passing_cpoe: 'CPOE',
  f_tm_fg_drive_rate: 'Team FG-drive rate',
  f_tm_rz_td_rate_inv: 'Team RZ TD rate (inverted)',
  // 2026-09-18: the label existed only under the INVERTED key, but the board
  // publishes the component as the plain `f_tm_rz_td_rate` (nfl_scoring.py
  // weights it as `-f_tm_rz_td_rate`; the minus is the weight's, not the
  // field's). So this was the one live component key of 26 with no label, and
  // Boards' own KICK_PTS "why" chips have been rendering the raw key.
  f_tm_rz_td_rate: 'Team red-zone TD rate',
  f_fg_att: 'FG attempts',
  kick_env: 'Kicking environment',
  f_tm_drives: 'Team drives',
}

export const WHY = {
  // TD (bots/nfl/nfl_scoring.py MODELS.TD.w)
  f_gl_opp:      'gets the ball right next to the end zone more than almost anyone',
  f_rz_opp:      'is on the field for the plays that happen close to the end zone',
  f_touches:     'gets handed the ball constantly — the offence runs through him',
  f_snap_pct:    'almost never comes off the field',
  implied_total: 'plays for the team expected to score the most points',
  f_xtd:         'gets the kind of chances that usually turn into touchdowns',
  opp_td_soft:   'faces a defence that has been giving touchdowns up',
  td_regression: 'has had the chances and not cashed them yet',
  // REC_YDS (MODELS.REC_YDS.w)
  f_wopr:                'commands a huge share of his team’s targets and air yards',
  f_receiving_yards:     'has been racking up real receiving yardage lately',
  f_receiving_air_yards: 'is getting targeted deep down the field',
  opp_pass_soft:         'faces a defence that has been giving up yards through the air',
  // REC (MODELS.REC.w)
  f_target_share: 'is one of his team’s most-targeted receivers',
  f_receptions:   'has been catching the ball at a high rate',
  f_targets:      'keeps getting thrown the ball',
  // RUSH_YDS / RUSH_ATT (MODELS.RUSH_YDS.w, MODELS.RUSH_ATT.w)
  f_carries:                                'keeps getting handed the ball',
  f_rushing_yards:                          'has been piling up rushing yards lately',
  f_rz_car:                                 'gets the ball on the ground near the goal line',
  f_ngs_rush_yards_over_expected_per_att:   'gains more per carry than a runner in his shoes usually would',
  // PASS_YDS (MODELS.PASS_YDS.w)
  total_line:      'is in a game Vegas expects to be a shootout',
  f_passing_yards: 'has been throwing for real yardage lately',
  f_attempts:      'throws the ball more than almost anyone',
  f_passing_cpoe:  'completes passes at a higher rate than the situation calls for',
  // KICK_PTS (MODELS.KICK_PTS.w)
  f_tm_fg_drive_rate:  'plays for an offense whose drives keep stalling into field-goal range',
  f_tm_rz_td_rate_inv: 'plays for an offense that struggles to finish drives with touchdowns, which means more kicks',
  f_tm_rz_td_rate:     'plays for an offense that struggles to finish drives with touchdowns, which means more kicks',
  f_fg_att:            'gets a high number of field-goal chances',
  kick_env:            'kicks in a clean, low-wind setup',
  f_tm_drives:         'plays for a team that runs more drives than most',
}
