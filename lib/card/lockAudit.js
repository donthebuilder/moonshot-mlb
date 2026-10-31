// THE LOCK AUDIT (2026-10-30, Donovan: "I'm not able to explain it ... sometimes the play I'd expect doesn't get sent out and something else does").
// Until now the reason a man was NOT picked lived only in the lock's log string. At the lock this saves, per sport window, the ranked field of every
// straight slot with each man's verdict (picked / under the line floor / under the price floor / no stored price / his game already used / lower than the
// pick), the skipped slots' words, and who the cooldown held out. Insert-only, written beside the lock, NEVER read by the picker and never able to stop a lock:
// a failed or missing table is swallowed. Answers "why him and not the other guy" after the fact (scripts/card-why.mjs).
export const AUDIT_TABLE = 'card_lock_audit'

/** The row for one window's lock. Pure. */
export function lockAuditRow({ sport, win, plan, version, inputs = null }) {
  return {
    sport, card_date: win.card_date, slate_key: win.slate_key || '', model_version: version,
    window_games: plan.games ?? win.games ?? null,
    plays: { straights: plan.plays?.straights ?? null, twoMan: plan.plays?.twoMan ?? null, picked: (plan.rows || []).map((r) => ({ product: r.product, slot: r.slot, market: r.market, player_id: r.legs?.[0]?.player_id ?? null, name: r.legs?.[0]?.name ?? null, rule: r.rule })) },
    audit: plan.audit || [],
    skipped: plan.skipped || [],
    note: [inputs?.cooledNote, inputs?.warn?.length ? `could not read: ${inputs.warn.join('; ')}` : null].filter(Boolean).join(' · ') || null,
  }
}

/** Save it (insert once per sport, day, slate and version). Returns '' on success, else a short note; never throws. */
export async function writeLockAudit(db, row) {
  try {
    const { error } = await db.from(AUDIT_TABLE).upsert([row], { onConflict: 'sport,card_date,slate_key,model_version', ignoreDuplicates: true })
    return error ? `audit: ${error.message}` : ''
  } catch (e) { return `audit: ${e?.message || e}` }
}
