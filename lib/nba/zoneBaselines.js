// BUCKETS' ZONE BASELINES, 2025-26 (measured 2026-10-20 by scripts/measure-nba-zones.mjs from buckets_shots: 1231 regular-season games,
// 219293 field-goal attempts; 4 games skipped for not having exactly two clubs in their shots). By the twelve zones of
// lib/nba/zones.js, [makes, attempts]: LEAGUE = every club; DEF[club] = what that club's opponents made / took in each zone.
// RE-MEASURE when the 2026-27 season has enough shots (~mid-December): node scripts/measure-nba-zones.mjs 2027
export const ZONE_BASE_SEASON = '2025-26'
export const ZONE_LEAGUE = {"ra":[43202,65304],"paint":[18669,42096],"midBL":[1879,4546],"midL":[1281,3253],"midC":[2219,5236],"midR":[1375,3319],"midBR":[1946,4563],"c3L":[4799,12396],"ab3L":[8035,22628],"ab3C":[8547,24692],"ab3R":[6871,19700],"c3R":[4458,11560]}
export const ZONE_DEF = {
  "BKN": {"ra":[1580,2359],"paint":[611,1312],"midBL":[73,163],"midL":[29,85],"midC":[49,130],"midR":[37,84],"midBR":[51,118],"c3L":[179,417],"ab3L":[235,647],"ab3C":[283,771],"ab3R":[185,515],"c3R":[143,345]},
  "BOS": {"ra":[1027,1586],"paint":[637,1539],"midBL":[53,162],"midL":[69,142],"midC":[90,198],"midR":[49,125],"midBR":[71,155],"c3L":[140,380],"ab3L":[321,837],"ab3C":[299,932],"ab3R":[274,733],"c3R":[113,318]},
  "NY": {"ra":[1325,2069],"paint":[498,1133],"midBL":[59,161],"midL":[32,98],"midC":[89,199],"midR":[59,139],"midBR":[50,130],"c3L":[190,499],"ab3L":[303,809],"ab3C":[290,857],"ab3R":[223,629],"c3R":[146,389]},
  "PHI": {"ra":[1556,2380],"paint":[501,1181],"midBL":[37,99],"midL":[43,115],"midC":[99,222],"midR":[42,101],"midBR":[55,141],"c3L":[177,437],"ab3L":[251,712],"ab3C":[283,861],"ab3R":[221,662],"c3R":[163,433]},
  "TOR": {"ra":[1437,2177],"paint":[537,1205],"midBL":[56,156],"midL":[48,127],"midC":[68,159],"midR":[50,117],"midBR":[64,160],"c3L":[154,392],"ab3L":[274,744],"ab3C":[277,848],"ab3R":[189,605],"c3R":[133,352]},
  "CHI": {"ra":[1686,2593],"paint":[547,1289],"midBL":[57,130],"midL":[35,91],"midC":[97,211],"midR":[45,95],"midBR":[55,144],"c3L":[151,394],"ab3L":[285,725],"ab3C":[331,894],"ab3R":[224,676],"c3R":[162,444]},
  "CLE": {"ra":[1344,2148],"paint":[538,1223],"midBL":[86,199],"midL":[51,128],"midC":[70,159],"midR":[60,121],"midBR":[74,197],"c3L":[161,413],"ab3L":[326,849],"ab3C":[277,761],"ab3R":[220,665],"c3R":[179,435]},
  "DET": {"ra":[1168,1886],"paint":[636,1451],"midBL":[52,148],"midL":[37,97],"midC":[56,138],"midR":[42,98],"midBR":[65,154],"c3L":[147,409],"ab3L":[252,797],"ab3C":[278,790],"ab3R":[206,638],"c3R":[156,379]},
  "IND": {"ra":[1619,2442],"paint":[684,1453],"midBL":[82,168],"midL":[48,116],"midC":[81,179],"midR":[48,99],"midBR":[75,173],"c3L":[143,384],"ab3L":[204,668],"ab3C":[301,787],"ab3R":[205,619],"c3R":[140,335]},
  "MIL": {"ra":[1398,2042],"paint":[501,1218],"midBL":[63,154],"midL":[49,114],"midC":[72,167],"midR":[46,104],"midBR":[62,157],"c3L":[166,408],"ab3L":[311,839],"ab3C":[306,856],"ab3R":[270,744],"c3R":[162,390]},
  "ATL": {"ra":[1567,2405],"paint":[570,1289],"midBL":[66,151],"midL":[30,99],"midC":[71,158],"midR":[51,123],"midBR":[62,135],"c3L":[155,395],"ab3L":[239,694],"ab3C":[305,898],"ab3R":[221,620],"c3R":[134,364]},
  "CHA": {"ra":[1423,2185],"paint":[620,1416],"midBL":[63,142],"midL":[32,97],"midC":[71,186],"midR":[42,110],"midBR":[62,145],"c3L":[116,319],"ab3L":[240,711],"ab3C":[316,888],"ab3R":[238,670],"c3R":[138,335]},
  "MIA": {"ra":[1444,2213],"paint":[697,1555],"midBL":[49,129],"midL":[35,109],"midC":[57,155],"midR":[48,107],"midBR":[74,165],"c3L":[154,399],"ab3L":[288,793],"ab3C":[294,912],"ab3R":[240,666],"c3R":[168,427]},
  "ORL": {"ra":[1429,2117],"paint":[672,1483],"midBL":[74,178],"midL":[43,96],"midC":[85,202],"midR":[44,126],"midBR":[81,175],"c3L":[147,348],"ab3L":[252,707],"ab3C":[269,821],"ab3R":[200,578],"c3R":[125,358]},
  "WSH": {"ra":[1782,2600],"paint":[513,1263],"midBL":[53,153],"midL":[44,101],"midC":[56,123],"midR":[58,112],"midBR":[53,141],"c3L":[170,401],"ab3L":[270,758],"ab3C":[297,864],"ab3R":[241,656],"c3R":[144,368]},
  "DEN": {"ra":[1413,2046],"paint":[664,1467],"midBL":[72,173],"midL":[52,129],"midC":[61,187],"midR":[39,94],"midBR":[85,181],"c3L":[181,494],"ab3L":[262,743],"ab3C":[290,861],"ab3R":[229,680],"c3R":[155,427]},
  "MIN": {"ra":[1492,2392],"paint":[622,1450],"midBL":[60,137],"midL":[52,125],"midC":[74,185],"midR":[41,124],"midBR":[64,156],"c3L":[145,331],"ab3L":[234,663],"ab3C":[274,829],"ab3R":[206,613],"c3R":[132,350]},
  "OKC": {"ra":[1156,1923],"paint":[566,1420],"midBL":[49,127],"midL":[33,98],"midC":[81,202],"midR":[34,107],"midBR":[75,182],"c3L":[201,491],"ab3L":[279,752],"ab3C":[273,805],"ab3R":[237,661],"c3R":[185,476]},
  "POR": {"ra":[1445,2212],"paint":[653,1482],"midBL":[73,165],"midL":[58,115],"midC":[96,217],"midR":[47,138],"midBR":[47,127],"c3L":[162,426],"ab3L":[217,671],"ab3C":[268,770],"ab3R":[226,617],"c3R":[154,384]},
  "UTAH": {"ra":[1427,1982],"paint":[754,1544],"midBL":[55,135],"midL":[38,92],"midC":[65,146],"midR":[37,75],"midBR":[61,132],"c3L":[210,516],"ab3L":[288,814],"ab3C":[321,902],"ab3R":[270,699],"c3R":[164,437]},
  "GS": {"ra":[1378,2033],"paint":[718,1528],"midBL":[75,173],"midL":[40,98],"midC":[86,181],"midR":[39,101],"midBR":[78,185],"c3L":[145,385],"ab3L":[261,772],"ab3C":[270,792],"ab3R":[227,641],"c3R":[155,349]},
  "LAC": {"ra":[1363,2029],"paint":[646,1484],"midBL":[50,133],"midL":[44,112],"midC":[68,183],"midR":[37,102],"midBR":[68,146],"c3L":[144,379],"ab3L":[283,783],"ab3C":[261,783],"ab3R":[244,651],"c3R":[152,384]},
  "LAL": {"ra":[1538,2182],"paint":[594,1380],"midBL":[69,146],"midL":[34,91],"midC":[85,160],"midR":[47,121],"midBR":[68,160],"c3L":[188,436],"ab3L":[262,771],"ab3C":[243,688],"ab3R":[230,688],"c3R":[126,397]},
  "PHX": {"ra":[1399,2061],"paint":[604,1371],"midBL":[82,179],"midL":[37,110],"midC":[52,135],"midR":[42,110],"midBR":[82,168],"c3L":[152,433],"ab3L":[269,761],"ab3C":[215,663],"ab3R":[211,620],"c3R":[150,396]},
  "SAC": {"ra":[1352,1936],"paint":[826,1697],"midBL":[65,144],"midL":[38,102],"midC":[81,169],"midR":[47,123],"midBR":[62,133],"c3L":[165,403],"ab3L":[292,743],"ab3C":[293,800],"ab3R":[268,725],"c3R":[116,318]},
  "DAL": {"ra":[1627,2458],"paint":[692,1521],"midBL":[72,167],"midL":[46,114],"midC":[81,176],"midR":[44,115],"midBR":[64,147],"c3L":[141,412],"ab3L":[269,783],"ab3C":[267,762],"ab3R":[212,641],"c3R":[160,397]},
  "HOU": {"ra":[1336,2047],"paint":[697,1582],"midBL":[51,133],"midL":[49,137],"midC":[65,190],"midR":[49,102],"midBR":[59,137],"c3L":[132,343],"ab3L":[251,768],"ab3C":[294,822],"ab3R":[219,652],"c3R":[117,304]},
  "MEM": {"ra":[1588,2322],"paint":[631,1405],"midBL":[44,119],"midL":[32,71],"midC":[69,152],"midR":[50,112],"midBR":[50,115],"c3L":[169,430],"ab3L":[254,735],"ab3C":[302,863],"ab3R":[258,713],"c3R":[167,419]},
  "NO": {"ra":[1609,2412],"paint":[582,1215],"midBL":[54,124],"midL":[44,90],"midC":[55,159],"midR":[37,91],"midBR":[44,108],"c3L":[167,471],"ab3L":[287,811],"ab3C":[287,824],"ab3R":[252,774],"c3R":[169,438]},
  "SA": {"ra":[1294,2067],"paint":[658,1540],"midBL":[85,198],"midL":[59,154],"midC":[89,208],"midR":[64,143],"midBR":[85,196],"c3L":[147,451],"ab3L":[276,768],"ab3C":[283,788],"ab3R":[225,649],"c3R":[150,412]},
}

const pctOf = ([m, a]) => (a ? (100 * m) / a : null)
/** The league's FG% in a zone (twelve-zone key). */
export const leagueZonePct = (k) => (ZONE_LEAGUE[k] ? pctOf(ZONE_LEAGUE[k]) : null)
/** The league's share of all attempts that come from a zone. */
const LEAGUE_TOTAL = Object.values(ZONE_LEAGUE).reduce((t, [, a]) => t + a, 0)
export const leagueZoneShare = (k) => (ZONE_LEAGUE[k] ? (100 * ZONE_LEAGUE[k][1]) / LEAGUE_TOTAL : null)
// A club's mid-range zones are ~100-200 attempts a season, so what it allows is pulled toward the league by SHRINK
// attempts of league shooting before it is compared (a stated, fixed rule, the same for every club).
export const SHRINK = 100
/** What a club's opponents shot in a zone, shrunk toward the league; { pct, raw, a, diff (pts vs league), rank (1 = allows the most of 30) }. */
export function defZone(club, k) {
  const row = ZONE_DEF[club]?.[k], L = leagueZonePct(k)
  if (!row || L == null) return null
  const [m, a] = row
  const pct = (m + (SHRINK * L) / 100) / (a + SHRINK) * 100
  const all = Object.keys(ZONE_DEF).map((c) => { const [mm, aa] = ZONE_DEF[c][k]; return (mm + (SHRINK * L) / 100) / (aa + SHRINK) * 100 }).sort((x, y) => y - x)
  return { pct, raw: pctOf(row), a, diff: pct - L, rank: all.findIndex((v) => v <= pct + 1e-9) + 1 }
}
