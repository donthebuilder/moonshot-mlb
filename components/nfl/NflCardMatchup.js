'use client'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
import NflTable from './NflTable'
import TeamMark from '../TeamMark'
import SourceSeason from './SourceSeason'
import { SportTheme } from '../SportTheme'
import { GROUP } from './DvpRead'
import { SHELL_WORD, MIN_TGT, MIN_SHELL_N } from '../../lib/writeups/nfl'
import { ordinal } from '../../lib/format'

// THE CARD'S MATCHUP TAB (2026-10-07, Donovan: "disgusting"). Rebuilt on the
// pattern of MOONSHOT's vs-pitcher tab: who he is facing in the title, then dense
// tables, nothing else. One accent (the product's jade); his own row edged, the
// rest quiet. Real numbers only from nfl_matchup.json; a thin sample is flagged
// "early" and a missing block is left out, never dashed in.
//   1. THE DEFENCE BY ROLE   his group's chairs: touchdowns and yards allowed, ranks of 32
//   2. HOW HE DOES VS EACH COVERAGE   man / zone: his targets and yards next to how much the club plays it
//   3. THEIR SHELLS          the club's coverage mix
//   4. EXPLOSIVE             his 10+/20+/30+/40+ next to what the club has allowed
const Title = ({ children, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '16px 0 6px', font: `900 ${TYPE.label}px/1.2 ${NUM_FONT}`, letterSpacing: '.1em', color: C.text3 }}>
    <span>{children}</span>{right}
  </div>
)
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null)

export default function NflCardMatchup({ player, matchup, slate }) {
  const opp = player?.opp
  const id = player?.player_id
  if (!opp || !matchup) return <div style={{ fontSize: 13, color: C.text3 }}>No opponent on the board for him this week.</div>

  const role = matchup.roles?.[id] || null
  const blob = matchup.dvp?.season?.[opp]
  const group = GROUP[player.position] || []
  const roleRows = group.filter((r) => blob?.[r]).map((r) => ({ _key: r, role: r, ...blob[r], mine: r === role }))
  const hasRush = player.position === 'RB' || player.position === 'QB'

  const cov = matchup.coverage_player?.[id]
  const oc = matchup.coverage_team?.[opp]
  const covRows = ['zone', 'man'].filter((k) => cov?.[k] && num(cov[k].tgts) >= MIN_TGT).map((k) => ({
    _key: k, kind: k === 'zone' ? 'Zone' : 'Man', ...cov[k], opp_pct: k === 'zone' ? num(oc?.zone_pct) : num(oc?.man_pct),
  }))
  const shells = oc && num(oc.shell_n) >= MIN_SHELL_N ? Object.entries(oc.shells || {}).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => ({ _key: k, shell: SHELL_WORD[k] || k, pct: v })) : []
  const ex = matchup.player_explosive?.[id]
  const de = matchup.def_explosive?.[opp]
  const exRows = []
  if (ex && num(ex.tgts) >= MIN_TGT) exRows.push({ _key: 'his', who: 'His catches', p10: ex.rec_10, p20: ex.rec_20, p30: ex.rec_30, p40: ex.rec_40, lng: ex.lng, n: ex.rec })
  if (de && num(de.pass_20) != null) exRows.push({ _key: 'opp', who: `${opp} allow`, p10: de.pass_10, p20: de.pass_20, p30: de.pass_30, p40: de.pass_40, lng: null, n: null })

  if (!roleRows.length && !covRows.length && !shells.length && !exRows.length) {
    return <div style={{ fontSize: 13, color: C.text3 }}>Not available yet: nothing published on {opp}&apos;s defence for his role.</div>
  }
  const g = roleRows[0]?.g
  return (
    <SportTheme theme={C} accent={C.green} numFont={NUM_FONT}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <TeamMark sport="nfl" abbr={opp} variant="logo" px={28} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 900 }}>{opp} defence</div>
          <div style={{ fontSize: 12, color: C.text3 }}>{role ? `${player.name} is their ${role} to face` : `facing ${player.position}s`}{Number.isFinite(g) ? ` · ${g} game${g === 1 ? '' : 's'}${g < 4 ? ', early' : ''}` : ''}</div>
        </div>
      </div>

      {roleRows.length > 0 && <>
        <Title right={<SourceSeason matchup={matchup} kind="stats" slateSeason={slate?.season} />}>{opp} BY ROLE · RANK OF 32, 1 ALLOWS THE MOST</Title>
        <NflTable bare tight heatMode="none" maxHeight={9999} maxRows={8} initialSort={null}
          caption={`What ${opp} allow to each ${player.position} chair. His chair is edged.`}
          rows={roleRows} rowEdge={(r) => (r.mine ? C.green : null)}
          columns={[
            { key: 'role', group: 'Chair', label: 'Role', w: 66, heat: false, sticky: true, bold: true },
            { key: 'td', group: 'TD', label: 'TD', w: 38, dp: 0, title: 'Touchdowns allowed to this chair' },
            { key: 'td_rank', group: 'TD', label: 'Rank', w: 46, dp: 0, fmt: (v) => (num(v) != null ? ordinal(v) : '—') },
            hasRush
              ? { key: 'rshyd_g', group: 'Yds/g', label: 'Rush', w: 52, dp: 1 }
              : { key: 'recyd_g', group: 'Yds/g', label: 'Rec', w: 52, dp: 1 },
            hasRush
              ? { key: 'rshyd_g_rank', group: 'Yds/g', label: 'Rank', w: 46, dp: 0, fmt: (v) => (num(v) != null ? ordinal(v) : '—') }
              : { key: 'recyd_g_rank', group: 'Yds/g', label: 'Rank', w: 46, dp: 0, fmt: (v) => (num(v) != null ? ordinal(v) : '—') },
            { key: hasRush ? 'rz_car' : 'rz_tgts', group: 'Red zone', label: hasRush ? 'Car' : 'Tgts', w: 44, dp: 0, title: hasRush ? 'Red-zone carries allowed' : 'Red-zone targets allowed' },
            { key: 'g', group: 'Sample', label: 'G', w: 34, dp: 0 },
          ]} />
      </>}

      {covRows.length > 0 && <>
        <Title right={<SourceSeason matchup={matchup} kind="charting" slateSeason={slate?.season} />}>HIS NUMBERS VS EACH COVERAGE</Title>
        <NflTable bare tight heatMode="none" maxHeight={9999} initialSort={null}
          caption={`${MIN_TGT}+ targets against it. ${opp} plays it the share shown.`}
          rows={covRows}
          columns={[
            { key: 'kind', group: 'Coverage', label: 'Vs', w: 56, heat: false, sticky: true, bold: true },
            { key: 'opp_pct', group: `${opp}`, label: 'Plays %', w: 58, dp: 0, title: `Share of ${opp}'s charted snaps in this coverage` },
            { key: 'tgts', group: 'His', label: 'Tgts', w: 44, dp: 0 },
            { key: 'ypt', group: 'His', label: 'Yds/tgt', w: 58, dp: 1, primary: true },
            { key: 'catch_pct', group: 'His', label: 'Catch%', w: 56, dp: 0 },
            { key: 'td', group: 'His', label: 'TD', w: 36, dp: 0 },
            { key: 'rz_tgts', group: 'His', label: 'RZ tgt', w: 52, dp: 0 },
          ]} />
      </>}

      {shells.length > 0 && <>
        <Title>HOW {opp} COVER · SHARE OF {oc.shell_n} CHARTED SNAPS</Title>
        <NflTable bare tight heatMode="primary" maxHeight={9999} initialSort={null} caption={`${opp}'s six most-used coverage shells.`}
          rows={shells}
          columns={[
            { key: 'shell', group: 'Shell', label: 'Coverage', w: 90, heat: false, sticky: true, bold: true },
            { key: 'pct', group: 'Share', label: '% of snaps', w: 76, dp: 1, primary: true },
          ]} />
      </>}

      {exRows.length > 0 && <>
        <Title>BIG PLAYS · HIS CATCHES NEXT TO WHAT {opp} HAVE ALLOWED</Title>
        <NflTable bare tight heatMode="none" maxHeight={9999} initialSort={null} caption="Pass plays of each length."
          rows={exRows}
          columns={[
            { key: 'who', group: 'Whose', label: '', w: 88, heat: false, sticky: true, bold: true },
            { key: 'p10', group: 'Plays of', label: '10+', w: 40, dp: 0 },
            { key: 'p20', group: 'Plays of', label: '20+', w: 40, dp: 0 },
            { key: 'p30', group: 'Plays of', label: '30+', w: 40, dp: 0 },
            { key: 'p40', group: 'Plays of', label: '40+', w: 40, dp: 0 },
            { key: 'lng', group: 'Longest', label: 'Lng', w: 44, dp: 0 },
          ]} />
      </>}
    </SportTheme>
  )
}
