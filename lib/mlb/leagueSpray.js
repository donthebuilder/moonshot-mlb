// THE LEAGUE'S HOME RUNS BY WHERE THE BALL LANDS, 2025 (measured 2026-10-19 from Baseball Savant's statcast_search
// export: every 2025 regular-season batted ball, 124,887 of them, 119,635 with hit coordinates in the grid below,
// 5,611 home runs). Placed with the site's own conversion (components/SprayField.js toPolar: feet from the plate,
// degrees from straightaway centre, negative = left field). Cells: 10-degree directions from -50, 30-ft distances from 0.
// n = balls landing there, hr = how many left the park. MOONSHOT's spray hills (components/SprayFieldStadium.js) shade a
// spot orange where a hitter homers there more than this. Re-measure each season (NOW.md).
export const LEAGUE_SPRAY_SEASON = 2025
const A0 = -50, AS = 10, RS = 30, MIN_N = 100
const N = [[119,314,553,1595,477,300,304,545,782,888,824,447,258,124,29,0],[154,386,1441,3018,728,399,478,877,1315,1273,971,656,478,280,98,7],[116,320,947,2709,2058,615,520,1088,1556,1422,1108,846,635,452,134,19],[126,222,447,2523,2832,575,368,639,1066,1159,1137,1046,948,546,175,20],[123,300,254,638,1715,532,399,754,1380,1523,1252,1116,1004,608,171,18],[158,776,263,306,1210,537,358,669,1344,1609,1323,1059,988,608,161,23],[144,675,158,616,1880,635,366,548,1048,1282,1285,1120,1026,559,139,14],[114,355,279,1543,3451,632,453,850,1494,1467,1120,935,670,421,90,14],[125,265,510,1867,2429,493,532,1208,1826,1452,1067,703,420,282,82,13],[97,257,752,2413,1050,314,362,606,849,881,819,482,248,147,29,1]]
const HR = [[0,0,0,0,0,0,0,0,0,1,2,69,217,119,29,0],[0,0,0,0,0,0,0,0,0,0,3,47,340,267,98,7],[0,0,0,0,0,0,0,0,0,1,0,10,237,407,130,19],[0,0,0,0,0,0,0,0,0,1,0,2,42,308,155,19],[0,0,0,0,0,0,0,0,0,0,0,2,2,151,152,15],[0,0,0,0,0,0,0,0,0,0,0,1,6,152,145,21],[0,0,0,0,0,0,0,0,0,0,1,1,47,325,123,14],[0,0,0,0,0,0,0,0,0,0,2,10,194,382,88,14],[0,0,0,0,0,0,0,0,0,1,0,65,309,275,81,12],[0,0,0,0,0,0,0,0,0,0,9,100,213,138,29,1]]

/** the league's home-run rate (0-1) for balls landing r ft out at ang degrees, or null under 100 balls there */
export function leagueHrRate(r, ang) {
  const ai = Math.floor((ang - A0) / AS), ri = Math.floor(r / RS)
  const n = N[ai]?.[ri]
  return n >= MIN_N ? HR[ai][ri] / n : null
}
