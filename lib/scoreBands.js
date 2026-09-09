// 📊 WHAT A SCORE IS ACTUALLY WORTH — the measured band table.
//
// 2026-08-16, Donovan: "based on the data what band of hr score goes [yard]
// every... like 70 an up, 70-50, 50-30, 40 or lower, unscored... and if you
// can do that for each category too based on hitting a hr, and if you want you
// can do it for hits and hrr, well all the categories."
//
// So this is every score, cut into bands, measured against every outcome, over
// the 62-night graded archive — 6,011 rows, 2026-04-16 to 2026-08-12, pulled off
// his Mac (~/Desktop/results, 2.5 GB, which the browser cannot reach).
//
// ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────
//
// The house rule is that A 0-100 SCORE IS NOT A PROBABILITY. That has always
// been enforced by refusing to dress a score as a percentage. This is the
// other half of it, and the better half: a MEASURED FREQUENCY WITH ITS
// DENOMINATOR *IS* a probability, so once the archive says what hitters in a
// band actually did, a score can finally carry a real number without lying.
// "hr_score 74" becomes "hitters in that band homered 19.8 percent of the
// time, 195 of 987, against a 15.7 percent slate average."
//
// ── THE NUMBERS ARE BAKED, AND THAT IS A LIABILITY ──────────────────────────
//
// The archive is on his machine, so the site cannot recompute this at runtime.
// Baked numbers are how a stale figure survived three restatement rounds on
// this repo in one week. Two defences:
//   · every figure ships WITH its denominator and the window it came from, and
//     the UI prints that window, so a reader can always see how old it is;
//   · REGENERATE with /home/claude/mock/gen_bands_js.py, which reads
//     mock/bands.csv — extracted by mock/extract_bands.py running on his Mac.
//     Re-run whenever the archive grows meaningfully.
//
// ── JUDGEABILITY ────────────────────────────────────────────────────────────
//
// 204 of the 6,011 archived rows are VOID, not misses: the hitter never
// came to the plate. He was not tested, so he leaves every denominator.
// Counting scratches as failures would drag every band down by the same amount
// and flatten the whole table. Denominators here are the 5,807 judgeable rows.
//
// ── TWO TESTS PER CELL, BECAUSE A BAND TABLE LIES EASILY ────────────────────
//
//   trend.z    Cochran-Armitage trend across the ordered bands. Uses every
//              band and every row, so a thin tail cannot dominate it.
//   ordered    Is any ADJACENT step SIGNIFICANTLY the wrong way? NOT "is it
//              perfectly monotone" — hit_score's under-30 band holds 93 rows
//              and wobbles 3 points, which is noise, and strict monotonicity
//              would have thrown out a score that plainly works.
//
// A band only earns a claim when |z| >= 1.96 AND ordered is true. Everything
// else is published as exactly what it is.
//
// ── THE HEADLINES, SO NOBODY HAS TO RE-DERIVE THEM ──────────────────────────
//
//   · hr_score DOES sort home runs, monotonically: 19.8 / 16.5 / 15.4 / 10.7
//     against a 15.7 base, z = +5.67. The top band is a 1.26x lift, not a
//     transformation — worth knowing before anyone calls a 70 a lock.
//   · hr_score is INVERTED on contact. 70+ gets a hit 62.8 percent of the
//     time; under-30 gets one 68.4 percent. z = -2.96, in order. The power
//     score is anti-predictive of hits, which is correct behaviour for a power
//     score and a trap for anyone reading it as general quality.
//   · hrr_score is the best score on the site and it is not close: significant
//     AND in order on ALL FIVE outcomes, including home runs (18.7 -> 5.9).
//   · hit_score does not predict home runs at all (z = -0.24), which is the
//     coherence rule holding — each score owns its own market.
//   · top_board_score_v2 is INVERTED on 1+ hit, 2+ hits and 2+ TB. It sorts
//     home runs (z = +3.32) and actively mis-sorts everything else.

export const BAND_ORDER = ['70+', '50-70', '30-50', '<30', 'unscored']

/** Which band a raw score falls in. null / undefined is 'unscored', NOT a zero. */
export function bandOf(v) {
  if (v == null || v === '' || Number.isNaN(Number(v))) return 'unscored'
  const n = Number(v)
  if (n >= 70) return '70+'
  if (n >= 50) return '50-70'
  if (n >= 30) return '30-50'
  return '<30'
}

export const SCORE_BANDS = {
  "nights": 62,
  "from": "2026-04-16",
  "to": "2026-08-12",
  "rows": 6011,
  "judgeable": 5807,
  "base": {
    "hr": [
      914,
      5807
    ],
    "hit": [
      3822,
      5807
    ],
    "hits2": [
      1478,
      5807
    ],
    "hrr2": [
      3017,
      5807
    ],
    "tb2": [
      2375,
      5807
    ]
  },
  "scores": {
    "hr_score": {
      "label": "HR score",
      "bands": {
        "70+": {
          "hr": [
            195,
            987
          ],
          "hit": [
            620,
            987
          ],
          "hits2": [
            231,
            987
          ],
          "hrr2": [
            496,
            987
          ],
          "tb2": [
            395,
            987
          ]
        },
        "50-70": {
          "hr": [
            382,
            2309
          ],
          "hit": [
            1502,
            2309
          ],
          "hits2": [
            558,
            2309
          ],
          "hrr2": [
            1199,
            2309
          ],
          "tb2": [
            945,
            2309
          ]
        },
        "30-50": {
          "hr": [
            224,
            1450
          ],
          "hit": [
            974,
            1450
          ],
          "hits2": [
            390,
            1450
          ],
          "hrr2": [
            751,
            1450
          ],
          "tb2": [
            598,
            1450
          ]
        },
        "<30": {
          "hr": [
            113,
            1061
          ],
          "hit": [
            726,
            1061
          ],
          "hits2": [
            299,
            1061
          ],
          "hrr2": [
            571,
            1061
          ],
          "tb2": [
            437,
            1061
          ]
        }
      },
      "trend": {
        "hr": {
          "z": 5.67,
          "ordered": true
        },
        "hit": {
          "z": -2.96,
          "ordered": true
        },
        "hits2": {
          "z": -3.01,
          "ordered": true
        },
        "hrr2": {
          "z": -1.49,
          "ordered": true
        },
        "tb2": {
          "z": -0.54,
          "ordered": true
        }
      }
    },
    "hit_score": {
      "label": "Hit score",
      "bands": {
        "70+": {
          "hr": [
            230,
            1474
          ],
          "hit": [
            1043,
            1474
          ],
          "hits2": [
            434,
            1474
          ],
          "hrr2": [
            844,
            1474
          ],
          "tb2": [
            652,
            1474
          ]
        },
        "50-70": {
          "hr": [
            516,
            3233
          ],
          "hit": [
            2123,
            3233
          ],
          "hits2": [
            835,
            3233
          ],
          "hrr2": [
            1680,
            3233
          ],
          "tb2": [
            1326,
            3233
          ]
        },
        "30-50": {
          "hr": [
            147,
            1007
          ],
          "hit": [
            598,
            1007
          ],
          "hits2": [
            187,
            1007
          ],
          "hrr2": [
            442,
            1007
          ],
          "tb2": [
            354,
            1007
          ]
        },
        "<30": {
          "hr": [
            21,
            93
          ],
          "hit": [
            58,
            93
          ],
          "hits2": [
            22,
            93
          ],
          "hrr2": [
            51,
            93
          ],
          "tb2": [
            43,
            93
          ]
        }
      },
      "trend": {
        "hr": {
          "z": -0.24,
          "ordered": true
        },
        "hit": {
          "z": 5.64,
          "ordered": true
        },
        "hits2": {
          "z": 5.52,
          "ordered": true
        },
        "hrr2": {
          "z": 5.68,
          "ordered": false
        },
        "tb2": {
          "z": 3.61,
          "ordered": false
        }
      }
    },
    "hrr_score": {
      "label": "HRR score",
      "bands": {
        "70+": {
          "hr": [
            114,
            609
          ],
          "hit": [
            438,
            609
          ],
          "hits2": [
            173,
            609
          ],
          "hrr2": [
            358,
            609
          ],
          "tb2": [
            276,
            609
          ]
        },
        "50-70": {
          "hr": [
            486,
            2794
          ],
          "hit": [
            1911,
            2794
          ],
          "hits2": [
            757,
            2794
          ],
          "hrr2": [
            1511,
            2794
          ],
          "tb2": [
            1194,
            2794
          ]
        },
        "30-50": {
          "hr": [
            300,
            2165
          ],
          "hit": [
            1351,
            2165
          ],
          "hits2": [
            520,
            2165
          ],
          "hrr2": [
            1071,
            2165
          ],
          "tb2": [
            839,
            2165
          ]
        },
        "<30": {
          "hr": [
            14,
            239
          ],
          "hit": [
            122,
            239
          ],
          "hits2": [
            28,
            239
          ],
          "hrr2": [
            77,
            239
          ],
          "tb2": [
            66,
            239
          ]
        }
      },
      "trend": {
        "hr": {
          "z": 5.28,
          "ordered": true
        },
        "hit": {
          "z": 6.95,
          "ordered": true
        },
        "hits2": {
          "z": 4.82,
          "ordered": true
        },
        "hrr2": {
          "z": 7.0,
          "ordered": true
        },
        "tb2": {
          "z": 5.08,
          "ordered": true
        }
      }
    },
    "contact_score": {
      "label": "Contact score",
      "bands": {
        "70+": {
          "hr": [
            117,
            570
          ],
          "hit": [
            404,
            570
          ],
          "hits2": [
            146,
            570
          ],
          "hrr2": [
            322,
            570
          ],
          "tb2": [
            247,
            570
          ]
        },
        "50-70": {
          "hr": [
            381,
            2083
          ],
          "hit": [
            1369,
            2083
          ],
          "hits2": [
            534,
            2083
          ],
          "hrr2": [
            1114,
            2083
          ],
          "tb2": [
            871,
            2083
          ]
        },
        "30-50": {
          "hr": [
            367,
            2591
          ],
          "hit": [
            1679,
            2591
          ],
          "hits2": [
            649,
            2591
          ],
          "hrr2": [
            1302,
            2591
          ],
          "tb2": [
            1049,
            2591
          ]
        },
        "<30": {
          "hr": [
            49,
            563
          ],
          "hit": [
            370,
            563
          ],
          "hits2": [
            149,
            563
          ],
          "hrr2": [
            279,
            563
          ],
          "tb2": [
            208,
            563
          ]
        }
      },
      "trend": {
        "hr": {
          "z": 6.62,
          "ordered": true
        },
        "hit": {
          "z": 1.97,
          "ordered": true
        },
        "hits2": {
          "z": -0.04,
          "ordered": true
        },
        "hrr2": {
          "z": 3.14,
          "ordered": true
        },
        "tb2": {
          "z": 2.34,
          "ordered": true
        }
      }
    },
    "overall_score": {
      "label": "Overall score",
      "bands": {
        "70+": {
          "hr": [
            98,
            500
          ],
          "hit": [
            324,
            500
          ],
          "hits2": [
            120,
            500
          ],
          "hrr2": [
            261,
            500
          ],
          "tb2": [
            205,
            500
          ]
        },
        "50-70": {
          "hr": [
            572,
            3268
          ],
          "hit": [
            2170,
            3268
          ],
          "hits2": [
            843,
            3268
          ],
          "hrr2": [
            1741,
            3268
          ],
          "tb2": [
            1361,
            3268
          ]
        },
        "30-50": {
          "hr": [
            232,
            1924
          ],
          "hit": [
            1255,
            1924
          ],
          "hits2": [
            481,
            1924
          ],
          "hrr2": [
            959,
            1924
          ],
          "tb2": [
            756,
            1924
          ]
        },
        "<30": {
          "hr": [
            12,
            115
          ],
          "hit": [
            73,
            115
          ],
          "hits2": [
            34,
            115
          ],
          "hrr2": [
            56,
            115
          ],
          "tb2": [
            53,
            115
          ]
        }
      },
      "trend": {
        "hr": {
          "z": 5.57,
          "ordered": true
        },
        "hit": {
          "z": 0.43,
          "ordered": true
        },
        "hits2": {
          "z": -0.47,
          "ordered": true
        },
        "hrr2": {
          "z": 1.89,
          "ordered": true
        },
        "tb2": {
          "z": 0.69,
          "ordered": true
        }
      }
    },
    "top_board_score_v2": {
      "label": "Top board v2",
      "bands": {
        "70+": {
          "hr": [
            169,
            925
          ],
          "hit": [
            568,
            925
          ],
          "hits2": [
            206,
            925
          ],
          "hrr2": [
            455,
            925
          ],
          "tb2": [
            357,
            925
          ]
        },
        "50-70": {
          "hr": [
            215,
            1294
          ],
          "hit": [
            851,
            1294
          ],
          "hits2": [
            317,
            1294
          ],
          "hrr2": [
            669,
            1294
          ],
          "tb2": [
            528,
            1294
          ]
        },
        "30-50": {
          "hr": [
            78,
            587
          ],
          "hit": [
            385,
            587
          ],
          "hits2": [
            155,
            587
          ],
          "hrr2": [
            294,
            587
          ],
          "tb2": [
            229,
            587
          ]
        },
        "<30": {
          "hr": [
            18,
            179
          ],
          "hit": [
            128,
            179
          ],
          "hits2": [
            64,
            179
          ],
          "hrr2": [
            106,
            179
          ],
          "tb2": [
            90,
            179
          ]
        },
        "unscored": {
          "hr": [
            434,
            2822
          ],
          "hit": [
            1890,
            2822
          ],
          "hits2": [
            736,
            2822
          ],
          "hrr2": [
            1493,
            2822
          ],
          "tb2": [
            1171,
            2822
          ]
        }
      },
      "trend": {
        "hr": {
          "z": 3.32,
          "ordered": true
        },
        "hit": {
          "z": -2.74,
          "ordered": true
        },
        "hits2": {
          "z": -3.54,
          "ordered": true
        },
        "hrr2": {
          "z": -1.8,
          "ordered": true
        },
        "tb2": {
          "z": -1.97,
          "ordered": true
        }
      }
    },
    "hrw_score": {
      "label": "HRW score",
      "bands": {
        "70+": {
          "hr": [
            194,
            939
          ],
          "hit": [
            603,
            939
          ],
          "hits2": [
            231,
            939
          ],
          "hrr2": [
            480,
            939
          ],
          "tb2": [
            390,
            939
          ]
        },
        "50-70": {
          "hr": [
            170,
            978
          ],
          "hit": [
            630,
            978
          ],
          "hits2": [
            259,
            978
          ],
          "hrr2": [
            509,
            978
          ],
          "tb2": [
            398,
            978
          ]
        },
        "30-50": {
          "hr": [
            87,
            772
          ],
          "hit": [
            512,
            772
          ],
          "hits2": [
            183,
            772
          ],
          "hrr2": [
            396,
            772
          ],
          "tb2": [
            301,
            772
          ]
        },
        "<30": {
          "hr": [
            29,
            296
          ],
          "hit": [
            187,
            296
          ],
          "hits2": [
            69,
            296
          ],
          "hrr2": [
            139,
            296
          ],
          "tb2": [
            115,
            296
          ]
        },
        "unscored": {
          "hr": [
            434,
            2822
          ],
          "hit": [
            1890,
            2822
          ],
          "hits2": [
            736,
            2822
          ],
          "hrr2": [
            1493,
            2822
          ],
          "tb2": [
            1171,
            2822
          ]
        }
      },
      "trend": {
        "hr": {
          "z": 5.93,
          "ordered": true
        },
        "hit": {
          "z": -0.27,
          "ordered": true
        },
        "hits2": {
          "z": 0.61,
          "ordered": true
        },
        "hrr2": {
          "z": 0.86,
          "ordered": true
        },
        "tb2": {
          "z": 1.15,
          "ordered": true
        }
      }
    }
  }
}

/** Outcome keys, in the order the site shows them, each with its real bar. */
export const BAND_OUTCOMES = [
  { key: 'hr', label: 'HR', bar: 'went deep' },
  { key: 'hit', label: '1+ hit', bar: 'got a hit' },
  { key: 'hits2', label: '2+ hits', bar: 'a multi-hit game' },
  { key: 'hrr2', label: '2+ HRR', bar: 'two of hits / runs / RBI' },
  { key: 'tb2', label: '2+ TB', bar: 'two total bases' },
]

const pct = (c) => (c && c[1] > 0 ? (100 * c[0]) / c[1] : null)

/** The archive-wide rate for an outcome — the bar every band is beaten against. */
export function baseRate(outcomeKey) {
  return pct(SCORE_BANDS.base?.[outcomeKey])
}

/**
 * What hitters in this score's band actually did.
 *
 * Returns { band, k, n, pct, base, lift, z, ordered, claims } or null when the
 * score is not one this table measured. `claims` is the honest gate: false
 * means the table has a number but the trend does not support reading it as a
 * property of the score, and a caller must not present it as one.
 */
export function bandRate(scoreKey, outcomeKey, value) {
  const s = SCORE_BANDS.scores?.[scoreKey]
  if (!s) return null
  const band = bandOf(value)
  const cell = s.bands?.[band]?.[outcomeKey]
  if (!cell || !cell[1]) return null
  const t = s.trend?.[outcomeKey] || {}
  const base = baseRate(outcomeKey)
  const p = pct(cell)
  return {
    band,
    k: cell[0],
    n: cell[1],
    pct: p,
    base,
    lift: base == null || p == null ? null : p - base,
    z: t.z ?? 0,
    ordered: !!t.ordered,
    // UNSCORED NEVER CLAIMS. The trend is computed across the ORDERED bands
    // only; the unscored pile sits outside that ordering entirely, so it must
    // not inherit the trend's significance. Its rate is still a real measured
    // frequency and is still returned — "hitters the bot did not score for
    // this market homered 15.4% of the time, 434 of 2,822" is a fact, it is
    // just not evidence about what the score does.
    claims: band !== 'unscored' && Math.abs(t.z ?? 0) >= 1.96 && !!t.ordered,
  }
}

/** "62 nights, 2026-04-16 to 2026-08-12" — printed wherever a figure is quoted. */
export function bandWindow() {
  return `${SCORE_BANDS.nights} nights, ${SCORE_BANDS.from} to ${SCORE_BANDS.to}`
}
