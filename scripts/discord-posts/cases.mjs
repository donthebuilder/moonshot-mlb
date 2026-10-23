// THE RENDER CASES of scripts/check-discord-posts.mjs: one entry per Discord post family. Each `load(ctx)` reads REAL stored rows
// (ctx.db, read-only) for the last few days and calls the SAME builder the poster calls, with the SAME hooks the poster passes.
// It returns renders: { kind, sport ('all' = cross-sport), day, label, text, embed?, embedSport?, link?, png?, hooks, members? }.
// The harness turns each into the exact Discord body and checks it. Nothing here sends.
//
// A kind that can reach Discord and is not rendered here must be in NOT_RENDERED with a reason (the harness fails otherwise).
import { feedHooks, feedHooksFor, sportHooks, nbaOwnHooks, receiptsHooks, withReceipts } from '../../lib/dash/discordChannels.js'
import { membersWebhook } from '../../lib/dash/membersPost.js'
import { isCut } from '../../lib/dash/routing.js'

const DAY_MS = 864e5
const etDate = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
/** The last n ET dates, newest first. */
export const recentDays = (n, now = Date.now()) => Array.from({ length: n }, (_, i) => etDate(now - i * DAY_MS))
const members = () => membersWebhook()
const pick = (rows, n = 2) => (rows || []).slice(0, n)

// the latest stored homer_feed_posts rows of these kinds, newest first
async function feedRows(db, kinds, days, { like = false, n = 3 } = {}) {
  let q = db.from('homer_feed_posts').select('day,kind,payload,discord_sent,x_post_id').gte('day', days.at(-1)).order('day', { ascending: false }).limit(n)
  q = like ? q.like('kind', kinds) : q.in('kind', [].concat(kinds))
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data || []
}

// ── THE CARD (lib/card/post.js) ─────────────────────────────────────────────────────────────────────────────────────────────
const card = await import('../../lib/card/text.js')
const brief = await import('../../lib/card/briefing.js')
const store = await import('../../lib/card/store.js')
const core = await import('../../lib/card/core.js')
const SPORTS = core.CARD_SPORTS

async function cardDays(ctx) {
  if (ctx._cardDays) return ctx._cardDays
  const out = []
  for (const day of ctx.days) { const rows = await store.dayRows(ctx.db, day); if (rows.length) out.push({ day, rows }) }
  ctx._cardDays = out
  return out
}
const latestCard = async (ctx, sport, ok) => {
  for (const { day, rows } of await cardDays(ctx)) {
    const mine = rows.filter((r) => (sport === 'all' ? true : r.sport === sport))
    const hit = ok(mine)
    if (hit) return { day, rows: mine, hit }
  }
  return null
}

const cardCases = [
  ...SPORTS.map((sport) => ({
    kinds: [`card_${sport}`],
    load: async (ctx) => {
      const c = await latestCard(ctx, sport, (rows) => core.leadStraight(rows))
      if (!c) return []
      const t = card.xCardText({ sport, day: c.day, straight: c.hit.legs[0], donovan: null })
      return [{ kind: `card_${sport}`, sport, day: c.day, text: t.text, hooks: feedHooks(sport) }]
    },
  })),
  ...SPORTS.map((sport) => ({
    kinds: [`card_result_${sport}`],
    load: async (ctx) => {
      const keep = (rows) => rows.filter((r) => r.product !== 'long_shot' && r.product !== 'double' && !(r.lane === 'donovan' && r.product === 'straight'))
      const c = await latestCard(ctx, sport, (rows) => { const k = keep(rows); return k.length && k.every((r) => r.result != null) ? k : null })
      if (!c) return []
      const t = card.resultText({ sport, day: c.day, rows: c.hit })
      return [{ kind: `card_result_${sport}`, sport, day: c.day, text: t.text, embed: card.resultEmbed({ sport, day: c.day, rows: c.hit }), png: true, hooks: feedHooks(sport) }]
    },
  })),
  ...SPORTS.map((sport) => ({
    kinds: [`card_ls_${sport}`],
    load: async (ctx) => {
      const c = await latestCard(ctx, sport, (rows) => rows.find((r) => r.lane === 'bot' && r.product === 'long_shot'))
      if (!c) return []
      const leg = c.hit.legs[0]
      const t = card.longShotText({ sport, day: c.day, leg })
      return [{ kind: `card_ls_${sport}`, sport, day: c.day, text: t.text, embed: card.longShotEmbed({ sport, day: c.day, leg }), hooks: feedHooks(sport) }]
    },
  })),
  ...SPORTS.map((sport) => ({
    kinds: [`card_ls_result_${sport}`],
    load: async (ctx) => {
      const c = await latestCard(ctx, sport, (rows) => rows.find((r) => r.lane === 'bot' && r.product === 'long_shot' && r.result != null))
      if (!c) return []
      const t = card.longShotResultText({ sport, day: c.day, row: c.hit, rec: null })
      return [{ kind: `card_ls_result_${sport}`, sport, day: c.day, text: t.text, embed: card.longShotResultEmbed({ sport, day: c.day, row: c.hit, rec: null }), png: true, hooks: feedHooks(sport) }]
    },
  })),
  {
    kinds: ['card_double_result'],
    load: async (ctx) => {
      const c = await latestCard(ctx, 'all', (rows) => rows.find((r) => r.product === 'double' && r.lane === 'bot' && r.result != null))
      if (!c) return []
      const t = card.doubleResultText({ day: c.day, row: c.hit })
      return [{ kind: 'card_double_result', sport: 'all', day: c.day, text: t.text, embed: card.doubleResultEmbed({ day: c.day, row: c.hit }), png: true, hooks: feedHooks('mlb') }]
    },
  },
  {
    kinds: ['card_members_day', 'card_members_day_2', 'card_members_day_3', 'card_members_day_4'],
    load: async (ctx) => {
      const c = await latestCard(ctx, 'all', (rows) => rows.some((r) => r.lane === 'bot') ? rows : null)
      if (!c) return []
      const all = c.rows
      // the first briefing, and the '(added)' follow-up of the cards that locked last (MEMBERS_FOLDS_ON is on in production: the briefing look)
      const last = Math.max(...all.map((r) => Date.parse(r.locks_at)))
      const later = all.filter((r) => Date.parse(r.locks_at) === last)
      const out = [{ kind: 'card_members_day', sport: 'all', day: c.day, label: 'THE DAY', text: brief.briefingText({ day: c.day, rows: all, all, prices: new Map() }), embed: brief.briefingEmbed({ day: c.day, rows: all, all, prices: new Map() }), hooks: members(), members: true }]
      if (later.length < all.length) out.push({ kind: 'card_members_day_2', sport: 'all', day: c.day, label: '(added)', text: brief.briefingText({ day: c.day, rows: later, all, prices: new Map(), update: true }), embed: brief.briefingEmbed({ day: c.day, rows: later, all, prices: new Map(), update: true }), hooks: members(), members: true })
      return out
    },
  },
  {
    kinds: ['card_today'],
    load: async (ctx) => {
      for (const { day, rows } of await cardDays(ctx)) {
        const bySport = {}
        for (const r of rows) if (r.lane === 'bot' && r.product === 'straight') (bySport[r.sport] ||= []).push(r)
        const lead = card.dayLead(bySport)[0]
        if (!lead) continue
        const t = card.todayText({ day, lead })
        return [{ kind: 'card_today', sport: lead.sport, day, text: t.text, hooks: feedHooks(lead.sport) }]
      }
      return []
    },
  },
]


// ── #MEMBERS (lib/dash/membersFolds.js, lib/dash/membersPost.js) ────────────────────────────────────────────────────────────
const folds = await import('../../lib/dash/membersFolds.js')
const mp = await import('../../lib/dash/membersPost.js')
const membersCases = [
  ...folds.ROUNDUP_SPORTS.map((sport) => ({
    kinds: [folds.roundupKind(sport)],
    load: async (ctx) => {
      for (const day of ctx.days) {
        const { data } = await ctx.db.from('homer_feed_posts').select('kind,payload').eq('day', day).like('kind', `writeup\\_${sport}\\_%`)
        // the roundup reads the rows the write-up poster left for it; a night before the folds read as every live called game
        const items = folds.roundupItems((data || []).map((r) => ({ ...r, payload: { ...r.payload, members_sent: 'roundup' } })))
        if (!items.length) continue
        return [{ kind: folds.roundupKind(sport), sport, day, text: folds.roundupText({ sport, day, items }), hooks: members(), members: true }]
      }
      return []
    },
  })),
  {
    kinds: ['mlb_members_grade', 'mlb_members_board'],
    load: async (ctx) => {
      const [b] = await feedRows(ctx.db, 'mlb_members_board', ctx.days.concat(recentDays(14).slice(ctx.days.length)), { n: 1 })
      if (!b?.payload?.picks?.length) return []
      const { data: hits } = await ctx.db.from('homer_feed').select('player_id').eq('day', b.day)
      if (isCut('mlb_members_board')) return [{ kind: 'mlb_members_grade', skip: 'not sent: its board is cut, THE DAY graded replaces it' }]
      const g = mp.mlbMembersGrade({ board: b.payload, events: hits || [] })
      return [{ kind: 'mlb_members_grade', sport: 'mlb', day: b.day, text: g?.text, hooks: members(), members: true }]
    },
  },
  {
    kinds: ['nfl_members_grade', 'nfl_members_board'],
    load: async (ctx) => {
      const [b] = await feedRows(ctx.db, 'nfl_members_board', recentDays(14), { n: 1 })
      if (!b?.payload?.picks?.length) return []
      const { data: tds } = await ctx.db.from('nfl_td_feed').select('gsis_id').gte('day', b.day).limit(500)
      if (isCut('nfl_members_board')) return [{ kind: 'nfl_members_grade', skip: 'not sent: its board is cut, THE DAY graded replaces it' }]
      const g = mp.nflMembersGrade({ board: b.payload, events: (tds || []).map((t) => ({ player_id: t.gsis_id })) })
      return [{ kind: 'nfl_members_grade', sport: 'nfl', day: b.day, text: g?.text, hooks: members(), members: true }]
    },
  },
]

// ── RECEIPTS: the night's receipt, the week, the month, the recaps (lib/posts/receipt.js, recapPost.js) ───────────────────────
const rc = await import('../../lib/posts/receipt.js')
const rl = await import('../../lib/posts/receiptLoad.js')
const recap = await import('../../lib/posts/recapPost.js')
const receiptCases = [
  {
    kinds: ['receipt', 'receipt_nocash'],
    load: async (ctx) => {
      for (const day of ctx.days.slice(1)) {
        const { data } = await ctx.db.from('homer_feed_posts').select('kind, x_post_id, payload').eq('day', day)
        const rows = (data || []).filter((r) => r.kind !== rc.KIND)
        const named = rc.namedPlayers(rows)
        if (!named.players?.length) continue
        const read = await rl.receiptLoader(ctx.db, { day })(named.players, rows)
        const a = rc.assembleReceipt({ day, rows, results: read.results, games: read.games, now: Date.now() })
        if (a.state === 'none' && a.discordText) return [{ kind: 'receipt_nocash', sport: 'all', day, label: 'no cash night: #called-it only', text: a.discordText, embed: a.discordEmbed || null, hooks: receiptsHooks() }]
        if (a.state !== 'go') continue
        return [{ kind: 'receipt', sport: 'all', day, text: a.text, embed: a.embed || null, png: true, hooks: withReceipts(feedHooks('mlb')) }]
      }
      return []
    },
  },
  {
    kinds: ['weekly', 'monthly'],
    load: async (ctx) => {
      const to = ctx.days[1]
      const from = recentDays(8)[7]
      const { data } = await ctx.db.from('homer_feed_posts').select('day, payload').eq('kind', rc.KIND).gte('day', from).lte('day', to)
      if (!data?.length) return []
      const totals = rc.periodTotals(data)
      return [{ kind: 'weekly', sport: 'all', day: to, label: `${from}..${to}`, text: rc.renderPeriod({ kind: 'weekly', from, to, totals }), embed: rc.periodEmbed({ kind: 'weekly', from, to, totals }), hooks: withReceipts(feedHooks('mlb')) }]
    },
  },
  ...['nfl', 'nhl'].map((sport) => ({
    kinds: [`recap_${sport}`],
    load: async (ctx) => {
      for (const day of ctx.days.slice(1)) {
        const read = await recap.LOADERS[sport](ctx.db, day)
        if (read.error || !read.input) continue
        const built = recap.recapFor(sport, { ...read.input, now: Date.now() })
        if (built.state !== 'go') continue
        return [{ kind: `recap_${sport}`, sport, day, text: built.text, embed: built.embed, hooks: receiptsHooks() }]
      }
      return []
    },
  })),
]

// ── LIVE ALERTS: a CALLED homer, touchdown, goal (the ticks) ──────────────────────────────────────────────────────────────────
const hf = await import('../../lib/dash/homerFeed.js')
const td = await import('../../lib/nfl/tdFeed.js')
const gf = await import('../../lib/nhl/goalFeed.js')
const cs = await import('../../lib/callStatus.js')
const alertCases = [
  {
    kinds: ['homer'],
    load: async (ctx) => {
      const { data, error } = await ctx.db.from('homer_feed').select('*').gte('day', recentDays(30).at(-1)).order('day', { ascending: false }).limit(200)
      if (error) throw new Error(error.message)
      const rows = (data || []).filter((r) => cs.callStatus(r) === 'called').slice(0, 2)
      // the tick sends with no hook list: postToDiscord's default, DISCORD_HOMER_WEBHOOK only
      return rows.map((row) => { const ev = { ...row, _roles: row.role || '' }; return { kind: 'homer', sport: 'mlb', day: row.day, label: row.name || row.player_name, text: hf.postText(ev), embed: hf.homerEmbed(ev, { extra: [], at: row.created_at }), png: true, hooks: feedHooksFor('mlb', cs.callStatus(row)) } })
    },
  },
  {
    kinds: ['td'],
    load: async (ctx) => {
      const { data } = await ctx.db.from('nfl_td_feed').select('*').gte('day', recentDays(14).at(-1)).order('day', { ascending: false }).limit(300)
      const out = []
      for (const row of data || []) {
        const ev = td.eventFromRow(row)
        const status = cs.tdCallStatus({ on_bot: ev.onBot, td_board: ev.tdBoard })
        if (status !== 'called' || out.length >= 2) continue
        out.push({ kind: 'td', sport: 'nfl', day: row.day, label: ev.name || row.scorer_name, text: td.tdPostText(ev), embed: td.tdEmbed(ev, { extra: [], at: row.created_at }), png: true, hooks: feedHooksFor('nfl', status) })
      }
      return out
    },
  },
  {
    kinds: ['nhlgoal'],
    load: async (ctx) => {
      const { data } = await ctx.db.from('lamp_goal_feed').select('*').gte('day', ctx.days.at(-1)).order('day', { ascending: false }).limit(300)
      const called = (data || []).filter((r) => r.status === 'called').slice(0, 2)
      return called.map((row) => { const rows = (data || []).filter((r) => r.game_id === row.game_id && r.player_id === row.player_id); return { kind: 'nhlgoal', sport: 'nhl', day: row.day, label: row.name, text: gf.postText(row, rows), embed: gf.goalEmbed(row, rows), png: true, hooks: feedHooks('nhl') } })
    },
  },
]

// ── MOMENTS: ELITE / LEGEND cards on their own (lib/posts/momentPost.js) ──────────────────────────────────────────────────────
const mf = await import('../../lib/posts/momentFeed.js')
const mpost = await import('../../lib/posts/momentPost.js')
const mposting = await import('../../lib/cards/momentPosting.js')
const momentCases = [{
  kinds: ['moment_mlb', 'moment_nfl', 'moment_nhl', 'moment_nba'],
  load: async (ctx) => {
    const { events } = await mf.historicalEvents(ctx.db, { days: ctx.days.length })
    const out = []
    const seen = new Set()
    for (const e of (events || []).filter((x) => mposting.postable(x.tier))) {
      if (seen.has(e.sport) && out.filter((o) => o.sport === e.sport).length >= 1) continue
      seen.add(e.sport)
      const line = mposting.momentLine(e.moment, e.row, e.who)
      if (!line) { out.push({ kind: `moment_${e.sport}`, error: `no line for ${e.who?.name} (${e.moment})` }); continue }
      const discordLine = mpost.momentDiscordLine(line, e.status)
      const embed = mpost.momentDiscordEmbed(e, { name: e.who.name, discordLine, png: true })
      const policy = mposting.policyFor(e.tier, { hasX: false, hasMembers: true })
      const base = { kind: `moment_${e.sport}`, sport: e.sport, day: e.day, label: `${e.who.name} · ${e.tier}`, text: discordLine, embed, png: true }
      if (policy.discord) out.push({ ...base, hooks: feedHooks(e.sport) })
      if (policy.members) { const plain = mpost.momentMembersLine(line); out.push({ ...base, label: `${base.label} (#members copy)`, text: plain, embed: mpost.momentDiscordEmbed({ ...e, status: null }, { name: e.who.name, discordLine: plain, png: true, plain: true }), hooks: members(), members: true }) }
    }
    return out
  },
}]

// ── POLLS (lib/dash/polls) ─────────────────────────────────────────────────────────────────────────────────────────────────
const pollPost = await import('../../lib/dash/polls/post.js')
const ADAPTERS = {
  mlb: (await import('../../lib/dash/polls/adapters/mlb.js')).createMlbPollAdapter,
  nfl: (await import('../../lib/dash/polls/adapters/nfl.js')).createNflPollAdapter,
  nhl: (await import('../../lib/dash/polls/adapters/nhl.js')).createNhlPollAdapter,
  nba: (await import('../../lib/dash/polls/adapters/nba.js')).createNbaPollAdapter,
}
const POLL_FORMATS = ['pick', 'over', 'guess', 'streak', 'board']
const pollKind = (sport, f) => `${sport === 'mlb' ? '' : `${sport}_`}poll_${f}`
const pollCases = Object.keys(ADAPTERS).map((sport) => ({
  kinds: POLL_FORMATS.map((f) => pollKind(sport, f)),
  load: async (ctx) => {
    const day = ctx.today
    const adapter = ADAPTERS[sport]({ day, now: Date.now(), db: ctx.db })
    const picked = await pollPost.choosePollFor(ctx.db, { sport, day, adapter, history: [] }).catch((e) => ({ none: e?.message }))
    if (!picked?.spec) return []
    const sp = picked.spec
    return [{ kind: sp.kind, sport, day, label: sp.format, text: sp.discordText || sp.text, hooks: sport === 'nba' ? '' : feedHooks(sport) }]
  },
}))

// ── THE 2+ CLUB (lib/dash/multiClubPost.js) ──────────────────────────────────────────────────────────────────────────────────
const mc = await import('../../lib/dash/multiClubPost.js')
const multiRead = await import('../../lib/multi/read.js')
const MC_KIND = { mlb: 'multi_club', nfl: 'nfl_multi_club', nhl: 'nhl_multi_club' }
const multiCases = Object.entries(MC_KIND).map(([sport, kind]) => ({
  kinds: [kind],
  load: async (ctx) => {
    const m = await multiRead.readMulti(ctx.db, sport).catch(() => null)
    if (!m) return []
    return [{ kind, sport, day: ctx.today, text: mc.multiClubText(m), hooks: feedHooks(sport) }]
  },
}))

// ── WRITE-UPS: the free featured game (lib/writeups/post.js sendFree) ─────────────────────────────────────────────────────────
const wt = await import('../../lib/writeups/text.js')
const writeupCases = ['nfl', 'nhl', 'nba'].map((sport) => ({
  kinds: [`writeup_${sport}`],
  load: async (ctx) => {
    const rows = await feedRows(ctx.db, `writeup\\_${sport}\\_%`, ctx.days, { like: true, n: 60 })
    const r = rows.find((x) => x.payload?.writeup && x.payload?.featured) || rows.find((x) => x.payload?.writeup)
    if (!r) return []
    const w = wt.renderWriteupSafe(r.payload.writeup)
    if (!w.ok) return [{ kind: r.kind, error: `write-up checker: ${(w.why || []).join('; ')}` }]
    const free = sport === 'nba' ? nbaOwnHooks().join(',') : sportHooks(sport).join(',')
    return [{ kind: r.kind, sport, day: r.day, label: `${(r.payload.teams || []).join(' at ')}${r.payload.featured ? ' (featured)' : ' (not featured: site + #members only)'}`, text: w.full, hooks: r.payload.featured ? free : '' }]
  },
}))

// ── SLATES: THE SLATE (cross-sport, morning) and LAMP's slate (lib/posts/slate.js, lampSlate.js) ─────────────────────────────
const slate = await import('../../lib/posts/slate.js')
const slateLoad = await import('../../lib/posts/slateLoad.js')
const lamp = await import('../../lib/posts/lampSlate.js')
const nhlBoard = await import('../../lib/nhl/boardRead.js').catch(() => null)
const slateCases = [
  {
    kinds: ['slate', 'pregame', 'callofnight', 'thefour'],
    load: async (ctx) => {
      const day = ctx.today
      const sports = await slateLoad.slateLoader({ day })()
      const starts = sports.map((x) => x.firstStartMs).filter(Number.isFinite)
      const now = starts.length ? Math.min(...starts) - 55 * 60e3 : Date.now()
      const a = slate.assembleSlate({ day, sports, now })
      if (a.state !== 'go') return [{ kind: 'slate', skip: `today's slate: ${a.state} (${a.reason})` }]
      return [{ kind: 'slate', sport: 'all', day, text: a.text, hooks: feedHooks('mlb') }]
    },
  },
  {
    kinds: ['nhl_slate'],
    load: async (ctx) => {
      if (!nhlBoard?.readBoard) return [{ kind: 'nhl_slate', error: 'lib/nhl/board.js readBoard not found' }]
      const day = ctx.today
      const games = (await nhlBoard.readBoard(day, { market: 'GOAL', net: true })).games || []
      const starts = games.map((g) => Date.parse(g.startUtc || g.start || '')).filter(Number.isFinite)
      const now = starts.length ? Math.min(...starts) - 60 * 60e3 : Date.now()
      const a = lamp.assembleLampSlate({ day, games, now })
      if (a.state !== 'go') return [{ kind: 'nhl_slate', skip: `today's LAMP slate: ${a.state} (${a.reason})` }]
      return [{ kind: 'nhl_slate', sport: 'nhl', day, text: a.text, embed: a.embed || null, hooks: feedHooks('nhl') }]
    },
  },
]

// ── THE WEEKLY SHOWS: FILM ROOM, THE FIVE, THE SUNDAY SHEET, BY THE NUMBERS (lib/posts/*) ──────────────────────────────────
const film = await import('../../lib/posts/filmRoom.js')
const five = await import('../../lib/posts/theFive.js')
const sheet = await import('../../lib/posts/sundaySheet.js')
const nums = await import('../../lib/posts/byNumbers.js')
const showCases = [
  {
    kinds: ['film_room'],
    load: async (ctx) => {
      const day = ctx.today
      const { from, to } = film.filmWindow(day)
      const rec = await ctx.db.from('homer_feed_posts').select('day, payload').eq('kind', 'receipt').gte('day', from).lte('day', to)
      const tue = await ctx.db.from('homer_feed_posts').select('day, payload').eq('kind', 'card_ls_tuesday_result').gte('day', recentDays(9)[8]).lte('day', day).order('day', { ascending: false }).limit(1)
      const t = film.filmRoomText({ day, data: film.filmData({ receipts: rec.data || [], tuesdayRow: (tue.data || [])[0] || null }) })
      return t?.text ? [{ kind: 'film_room', sport: 'all', day, label: t.topic || '', text: t.text, png: true, hooks: feedHooks('mlb') }] : [{ kind: 'film_room', skip: 'nothing to say this week' }]
    },
  },
  {
    kinds: ['the_five'],
    load: async (ctx) => {
      const day = ctx.today
      const sports = await slateLoad.slateLoader({ day })()
      const picks = five.pickFive(sports)
      if (picks.length < 3) return [{ kind: 'the_five', skip: `${picks.length} usable calls today` }]
      return [{ kind: 'the_five', sport: 'all', day, text: five.fiveText({ picks, day }), png: true, hooks: feedHooks('mlb') }]
    },
  },
  {
    kinds: ['sunday_sheet'],
    load: async (ctx) => {
      const day = ctx.today
      const r = await (await import('../../lib/cards/shareData.js')).loadShareModel('ranked', 'nfl', { date: day }, Date.now()).catch((e) => ({ ok: false, why: e?.message }))
      if (!r?.ok) return [{ kind: 'sunday_sheet', skip: `no TUDDY board (${r?.why})` }]
      const week = String(r.model?.dayWord || '').replace(/^Week\s*/i, '') || '?'
      return [{ kind: 'sunday_sheet', sport: 'nfl', day, text: sheet.sheetText({ model: r.model, week }), png: true, hooks: feedHooks('nfl') }]
    },
  },
  {
    kinds: ['by_numbers'],
    load: async (ctx) => {
      const day = ctx.today
      const boards = await nums.readBoards(day, { bucketsOn: true })
      const ro = await nums.readRosters(boards)
      if (!ro?.size) return [{ kind: 'by_numbers', skip: 'no roster read' }]
      const men = [...nums.nbaMen({ board: boards.nbaBoard, rosters: ro, now: 0 }), ...nums.nhlMen({ games: boards.nhlGames, rosters: ro, now: 0 })]
      const pick = nums.pickNumbers(nums.findNumbers(men, { day }))
      if (!pick) return [{ kind: 'by_numbers', skip: 'nothing lines up tonight' }]
      // sent with sportKey 'nba' to FEED_WEBHOOKS (the MLB rooms) by the homers tick
      return [{ kind: 'by_numbers', sport: 'all', day, text: nums.numbersText(pick), png: true, hooks: feedHooks('mlb') }]
    },
  },
]

// ── TUDDY'S WEEK: the weekday slots and Milestone (app/api/dash/nfl/tick runWeeklyContentTick) ────────────────────────────────
const nflData = await import('../../lib/nfl/dataSource.js')
const ntf = await import('../../lib/nfl/tweetFeed.js')
const nflWeekCases = [{
  kinds: ['nfl_redzone', 'nfl_goalline', 'nfl_tdhistory', 'nfl_bigweek', 'nfl_spotlight', 'nfl_board', 'nfl_results', 'nfl_milestone', 'nfl_whyboard'],
  load: async (ctx) => {
    const day = ctx.today
    const [data, logs, box] = await Promise.all([
      nflData.fetchNfl(nflData.nflSlatePaths(), nflData.nflSlateLooksReal).catch(() => null),
      nflData.fetchNfl(nflData.nflLogPaths()).catch(() => null),
      nflData.fetchNfl(nflData.nflFantasyStatsPaths()).catch(() => null),
    ])
    if (!data) return [{ kind: 'nfl_redzone', skip: 'TUDDY week file not readable' }]
    const out = []
    const add = (kind, text, extra = {}) => out.push({ kind, sport: 'nfl', day, text, hooks: feedHooks('nfl'), ...extra })
    add('nfl_redzone', ntf.opportunityText(ntf.opportunityPicks(data, 'RZ'), data, 'RZ'))
    add('nfl_goalline', ntf.opportunityText(ntf.opportunityPicks(data, 'GL'), data, 'GL'))
    if (logs) add('nfl_tdhistory', ntf.tdHistoryText(ntf.tdHistoryPicks(logs, data), data))
    if (logs) { const mp = ntf.milestonePicks(logs, data); if (mp?.length) add('nfl_milestone', ntf.milestoneText(mp, data)) }
    if (box) { add('nfl_bigweek', ntf.bigWeekText(ntf.bigWeekPicks(box, data), data)); const sp = ntf.spotlightPick(box, data); if (sp) add('nfl_spotlight', ntf.spotlightText(sp, data), { png: true }) }
    const board = ntf.nflBoardPicks(data, undefined, { now: 0, day })
    add('nfl_board', ntf.nflBoardText(board, data))
    const why = ntf.whyOnBoardPick(data, { exclude: new Set() })
    if (why) out.push({ kind: 'nfl_whyboard', sport: 'nfl', day, text: ntf.whyOnBoardText(why, data), hooks: members(), members: true })
    // Monday's grade of Sunday's stored board
    const [prior] = await feedRows(ctx.db, 'nfl_board', recentDays(10), { n: 1 })
    if (prior?.payload?.picks?.length) {
      const { data: tds } = await ctx.db.from('nfl_td_feed').select('scorer_name, gsis_id').eq('day', prior.day)
      const scorers = { ids: new Set((tds || []).map((r) => String(r.gsis_id || '')).filter(Boolean)), names: new Set((tds || []).filter((r) => !r.gsis_id).map((r) => String(r.scorer_name || '').toLowerCase())) }
      add('nfl_results', ntf.nflBoardResultsText(prior.payload.picks, scorers, data), { day: prior.day, label: `grades ${prior.day}` })
    }
    return out.filter((o) => o.text)
  },
}]

// ── BUCKETS: the 30 PIECE / double-double / triple-double (app/api/buckets/moments) ─────────────────────────────────────────
const nbaM = await import('../../lib/nba/moments.js')
const nbaCases = [{
  kinds: ['nba30'],
  load: async (ctx) => {
    const { data } = await ctx.db.from('buckets_feed').select('*').neq('season_type', 1).order('game_date', { ascending: false }).limit(40)
    const rows = (data || []).filter((r) => r.status === 'called' || r.status === 'board').slice(0, 2)
    return rows.map((r) => ({ kind: 'nba30', sport: 'nba', embedSport: 'nba', day: r.game_date, label: `${r.name} ${r.kind}`, text: r.kind === nbaM.KIND ? nbaM.momentText(r) : nbaM.ddtdText(r), hooks: feedHooksFor('nba', r.status) }))
  },
}]

// ── DONOVAN'S OWN ENTRIES (lib/card/post.js postDonovan) and THE PLAYS (lib/posts/sportPlans.js) ────────────────────────────
const sp = await import('../../lib/posts/sportPlans.js')
const donPlaysCases = [
  ...SPORTS.map((sport) => ({
    kinds: [`card_don_${sport}`],
    load: async (ctx) => {
      const c = await latestCard(ctx, sport, (rows) => rows.find((r) => r.lane === 'donovan' && r.product === 'two_man'))
      if (!c) return []
      const t = card.xCardText({ sport, day: c.day, straight: null, donovan: { legs: c.hit.legs, note: c.hit.note } })
      return [{ kind: `card_don_${sport}`, sport, day: c.day, text: t.text, hooks: feedHooks(sport) }]
    },
  })),
  ...SPORTS.map((sport) => ({
    kinds: [`plays_${sport}`],
    load: async (ctx) => {
      const c = await latestCard(ctx, sport, (rows) => core.leadStraight(rows))
      if (!c) return []
      const lead = card.xCardText({ sport, day: c.day, straight: c.hit.legs[0], donovan: null }).text
      return [{ kind: `plays_${sport}`, sport, day: c.day, text: sp.playsText({ sport, day: c.day, leadText: lead }), hooks: feedHooks(sport) }]
    },
  })),
]

// ── LAMP extras: the hardest shot, the long shots (lib/nhl/hardestShot.js, lib/dash/longshotsPost.js) ───────────────────────
const hard = await import('../../lib/nhl/hardestShot.js')
const ls = await import('../../lib/dash/longshotsPost.js')
const odds = await import('../../lib/odds/longshots.js')
const lampExtraCases = [
  {
    kinds: ['nhlhardest'],
    load: async (ctx) => {
      for (const day of ctx.days.slice(1)) {
        const { data } = await ctx.db.from('lamp_shot_speed').select('*').eq('game_date', day).order('speed', { ascending: false }).limit(1)
        const m = (data || [])[0]
        if (!m) continue
        return [{ kind: 'nhlhardest', sport: 'nhl', day, text: hard.hardestText(m), hooks: feedHooks('nhl') }]
      }
      return []
    },
  },
  {
    kinds: ['nhl_longshots'],
    load: async (ctx) => {
      const body = await odds.readLongshots(ctx.db, { sport: 'nhl', date: ctx.today }).catch(() => null)
      const b = body ? await ls.longshotsBuild(body, { sport: 'nhl', now: 0 }) : null
      if (!b?.text) return [{ kind: 'nhl_longshots', skip: 'no LAMP long shots today' }]
      return [{ kind: 'nhl_longshots', sport: 'nhl', day: ctx.today, text: b.text, hooks: feedHooks('nhl') }]
    },
  },
]

// ── #MEMBERS WINS AND THE MORNING GRADE (lib/card/wins.js) ─────────────────────────────────────────────────────────────────────
const wins = await import('../../lib/card/wins.js')
const winsCases = [{
  kinds: ['card_members_graded', 'card_members_win_'],
  load: async (ctx) => {
    for (const { day, rows } of await cardDays(ctx)) {
      const picks = wins.dayPicks(rows)
      if (!picks.length || picks.some((r) => r.result == null)) continue
      const out = [{ kind: wins.GRADED_KIND, sport: 'all', day, label: 'the morning grade', text: wins.gradedText({ day, rows }), embed: wins.gradedEmbed({ day, rows }), hooks: members(), members: true }]
      const hits = picks.filter((r) => r.result === 'hit')
      if (hits.length) out.push({ kind: wins.winKind(hits[0]), sport: hits[0].sport === 'all' ? 'all' : hits[0].sport, day, label: `${hits.length} hits in one post`, text: wins.winsText({ day, rows: hits }), embed: wins.winsEmbed({ day, rows: hits }), hooks: members(), members: true })
      return out
    }
    return []
  },
}]

// ── LIVE-ROOM ALERTS (lib/dash/discordAlerts.js, from lib/dash/pushRules.js). Built from a live game state with no stored input, so these render
// the copy's own TEST samples (lib/copy/notifications.js CATALOG): the WORDS are checked, the data is labelled TEST.
const copy = await import('../../lib/copy/notifications.js')
const roomText = (e) => (e.title ? `**${e.title}**\n${e.body || ''}` : String(e.body || ''))
const roomAlertCases = [{
  kinds: ['alert_nflboardred', 'alert_scratched'],
  load: async (ctx) => {
    const out = []
    const red = copy.nfl.boardRedZone({ team: 'TST', men: [{ name: 'Test Back', rank: 3, called: true }, { name: 'Test End', rank: 9, called: false }], down: '2nd & 4 at TST 8', clock: 'Q3 4:12', game: { away: 'TST', home: 'EXA' } })
    out.push({ kind: 'alert_nflboardred', sport: 'nfl', day: ctx.today, label: 'TEST copy (built live)', text: roomText(red), hooks: feedHooks('nfl') })
    for (const row of copy.CATALOG.filter((r) => r.key === 'scratched' && r.sport === 'mlb' && !r.cut).slice(0, 1)) {
      out.push({ kind: `alert_${row.key}`, sport: 'mlb', day: ctx.today, label: `TEST copy: ${row.variant || row.key} (only with DISCORD_BOARD_ROOM_ALERTS=on)`, text: roomText(row.render()), hooks: feedHooks('mlb') })
    }
    return out
  },
}]

// ── THE /ADMIN TEST LINE (lib/dash/discordWire.js) ───────────────────────────────────────────────────────────────────────────────
const wire = await import('../../lib/dash/discordWire.js')
const adminCases = [{
  kinds: ['admin_test'],
  load: async (ctx) => [{ kind: 'admin_test', sport: 'all', day: ctx.today, label: 'to #buckets-nba, as picked on /admin/discord', text: wire.TEST_TEXT, hooks: sportHooks('nba').join(',') || process.env.DISCORD_MLB_WEBHOOKS || '' }],
}]

export const CASES = [...adminCases, ...roomAlertCases, ...winsCases, ...nflWeekCases, ...nbaCases, ...donPlaysCases, ...lampExtraCases, ...momentCases, ...pollCases, ...multiCases, ...writeupCases, ...slateCases, ...showCases, ...membersCases, ...cardCases, ...receiptCases, ...alertCases]

/** Kinds that can reach Discord but are not rendered, each with the reason. */
export const NOT_RENDERED = Object.freeze({
  // X only: replies and the Tuesday long shot never reach Discord (lib/card/post.js skipDiscord, the reply posters call postToX only)
  ...Object.fromEntries(['card_ls_tuesday', 'card_ls_tuesday_result', 'story_t3', 'nfl_callsheet_reply', 'homer_board_reply', 'mlbhr_reply', 'miss_reply'].map((k) => [k, 'X only: no Discord send'])),
  // retired (lib/dash/xSchedule mode retired): never post
  ...Object.fromEntries(['callofnight', 'thefour', 'pregame', 'writeup', 'writeup_mlb', 'nhl_board', 'facts'].map((k) => [k, 'retired or never sent on its own (folded into the slate / plays, or a family name)'])),
  postseason_mlb: 'the TOP 3 POSTSEASON digest family (postseason_mlb_top3_*): CUT by the routing table, X only',
  // members folds: the per-sport members card is stored, THE DAY carries it (lib/card/post.js skipDiscord under MEMBERS_FOLDS_ON)
  ...Object.fromEntries(['card_members_mlb', 'card_members_nhl', 'card_members_nba'].map((k) => [k, 'MEMBERS_FOLDS_ON: stored, not sent; THE DAY briefing carries it'])),
  // poll reveals quote a real X poll: no X poll, no reveal anywhere (lib/dash/polls/post.js postRevealsOnce)
  ...Object.fromEntries(['poll_result', 'nfl_poll_result', 'nhl_poll_result', 'nba_poll_result', 'network_vs_board'].map((k) => [k, 'needs a real X poll (and its votes) before anything posts'])),
  // Donovan's N-man results: only after his own N-man entry posts (rare; lib/card/post.js postDonovanResults)
  ...Object.fromEntries(['mlb', 'nfl', 'nhl', 'nba'].flatMap((s) => [1, 2, 3].map((n) => [`card_don_${s}_n_man_${n}_result`, "Donovan's N-man result: only after his own N-man entry"]))),
  // MOONSHOT's stat rotation: built inside the homers tick from the live MLB board (no stored input); one a day while MLB plays
  ...Object.fromEntries(['hotcontact', 'dangercombos', 'backtoback', 'hrleadersdow', 'matchuplines', 'matchup_hr', 'matchup_career', 'matchup_hr_late', 'matchup_career_late', 'storylines', 'storyline_watch_1', 'bestair', 'hot_month', 'hot_week', 'history_watch', 'pairswatch', 'longshot', 'numerology', 'board', 'list_mlb', 'list_nfl', 'list_nhl'].map((k) => [k, 'built inside its tick from live data with no stored input (MOONSHOT stat rotation / lists): rendered by the tick only'])),
})

export { feedRows, pick, members, feedHooksFor, sportHooks, nbaOwnHooks, receiptsHooks, withReceipts }
