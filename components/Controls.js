'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { teamOf } from '../lib/player'
import {
  useSpotlight, SPOT_FIELDS, SPOT_GROUPS, SPOT_COLORS,
  spotColor, ruleText, lightCount,
} from '../lib/spotlight'

// SEARCH + TEAM FILTER, dressed up (2026-08-08, "make the dropdown and
// search bar cooler"). The search wears a 🔍, glows ember on focus (rules in
// MobileCSS — inline styles can't do :focus), clears with one ✕, and the
// "/" key focuses it from anywhere. The team dropdown loses the native-grey
// look: appearance none, custom ▾, and it lights orange while a team is
// actually filtering so an active filter can't hide.

export default function Controls({ query, setQuery, team, setTeam, players }) {
  const inputRef = useRef(null)

  const teams = useMemo(() => {
    const s = new Set()
    players.forEach((p) => {
      const t = teamOf(p)
      if (t) s.add(t)
    })
    return Array.from(s).sort()
  }, [players])

  // "/" focuses search from anywhere (ignored while typing in any field)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const filtering = !!team

  return (
    <div
      className="dash-controls"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 170px auto',
        gap: 8,
        margin: '14px 0 14px',
      }}
    >
      {/* search */}
      <div style={{ position: 'relative', minWidth: 0 }}>
        <span style={{
          position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
          fontSize: 13, opacity: 0.55, pointerEvents: 'none',
        }}>🔍</span>
        <input
          ref={inputRef}
          type="search"
          className="moon-search"
          placeholder="Search player, team, or pitcher…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            background: C.bg3,
            border: `1px solid ${query ? 'rgba(249,115,22,.45)' : C.border2}`,
            color: C.text,
            borderRadius: 999,
            padding: '9px 64px 9px 34px',
            fontSize: 12,
            outline: 'none',
            width: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
            transition: 'border-color .15s, box-shadow .15s',
          }}
        />
        {query ? (
          <button
            onClick={() => { setQuery(''); inputRef.current?.focus() }}
            title="Clear search"
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(249,115,22,.14)', border: '1px solid rgba(249,115,22,.4)',
              color: C.orange, borderRadius: 999, width: 20, height: 20, lineHeight: 1,
              fontSize: 11, fontWeight: 800, cursor: 'pointer', padding: 0,
            }}
          >✕</button>
        ) : (
          <span className="l5col" style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            fontSize: 9, fontFamily: NUM_FONT, color: C.text3,
            border: `1px solid ${C.border2}`, borderRadius: 5, padding: '1px 6px',
            pointerEvents: 'none',
          }}>/</span>
        )}
      </div>

      {/* team dropdown */}
      <div style={{ position: 'relative', minWidth: 0 }}>
        <select
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          className="moon-select"
          title={filtering ? `Showing ${team} only — pick "All teams" to release` : 'Filter every board to one team'}
          style={{
            appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
            background: filtering
              ? 'linear-gradient(135deg, rgba(249,115,22,.16), rgba(249,115,22,.05))'
              : C.bg3,
            border: `1px solid ${filtering ? 'rgba(249,115,22,.55)' : C.border2}`,
            color: filtering ? C.orange : C.text,
            fontWeight: filtering ? 800 : 500,
            borderRadius: 999,
            padding: '9px 30px 9px 14px',
            fontSize: 12,
            fontFamily: NUM_FONT,
            outline: 'none',
            width: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
            cursor: 'pointer',
            transition: 'border-color .15s, background .15s',
          }}
        >
          <option value="">⚾ All teams</option>
          {teams.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <span style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          fontSize: 10, color: filtering ? C.orange : C.text3, pointerEvents: 'none',
        }}>▾</span>
      </div>

      {/* ✨ third cell — was wrongly nested inside the select's wrapper, where
          it rendered squashed under the dropdown. Own column now. */}
      <SpotlightControl players={players} />
    </div>
  )
}

// ✨ THE SPOTLIGHT MANAGER (v2, 2026-08-15). Donovan sent the highlight
// editor he wants the feel of: named rule sets, a color each, "1 = top"
// priority, All/Any, rich criteria. This is that idea in the site's own
// language — a small manager pill on every board, and an editor that shows
// LIVE how many hitters a light would wash before you save it (the one
// thing his screenshots' version can't do).
function Field({ label, children, width }) {
  return (
    <label style={{ display: 'block', minWidth: 0, width }}>
      <span style={{ fontSize: 8.5, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 800, display: 'block', marginBottom: 3 }}>{label}</span>
      {children}
    </label>
  )
}

// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const inputStyle = () => ({
  width: '100%', boxSizing: 'border-box', background: C.bg, color: C.text,
  border: `1px solid ${C.border2}`, borderRadius: 8, fontSize: 11.5,
  padding: '7px 9px', outline: 'none', fontFamily: NUM_FONT,
})

function LightEditor({ draft, setDraft, players, onSave, onCancel, onDelete }) {
  const col = spotColor(draft.color)
  const nOn = lightCount(draft, players)
  const setRule = (i, patch) => setDraft({ ...draft, rules: draft.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) })
  const unitOf = (key) => SPOT_FIELDS.find((f) => f.key === key)?.unit || ''

  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,.72)',
      backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 16,
        width: 400, maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto', padding: '16px 18px 14px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 900 }}>✨ {draft.id ? 'Edit highlight' : 'New highlight'}</span>
          <button onClick={onCancel} aria-label="Close" style={{ background: 'none', border: 'none', color: C.text3, fontSize: 18, cursor: 'pointer', padding: '2px 6px' }}>✕</button>
        </div>

        {/* name + priority */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <Field label="Name" width="100%">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Pure power" style={{ ...inputStyle(), fontFamily: 'inherit' }} />
          </Field>
          <Field label="Priority" width={74}>
            <input value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value.replace(/[^0-9]/g, '') })}
              inputMode="numeric" style={inputStyle()} />
            <span style={{ fontSize: 8, color: C.text3 }}>1 = top</span>
          </Field>
        </div>

        {/* color */}
        <Field label="Color">
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
            {SPOT_COLORS.map((c) => (
              <button key={c} onClick={() => setDraft({ ...draft, color: c })} aria-label={`color ${c}`} style={{
                width: 22, height: 22, borderRadius: 999, cursor: 'pointer', background: c,
                border: c === col ? '2px solid #fff' : '2px solid transparent',
                boxShadow: c === col ? `0 0 8px ${c}` : 'none', padding: 0,
              }} />
            ))}
            <span style={{ width: 20, height: 20, borderRadius: 5, background: col, border: `1px solid ${C.border2}`, marginLeft: 6 }} />
            <input value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value.trim() })}
              placeholder="#FCD34D" style={{ ...inputStyle(), width: 90 }} />
          </div>
        </Field>

        {/* criteria */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 4px' }}>
          <span style={{ fontSize: 8.5, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 800 }}>Criteria</span>
          <label style={{ fontSize: 9.5, color: C.text3, display: 'flex', gap: 5, alignItems: 'center' }}>
            Require
            <select value={draft.mode} onChange={(e) => {
              const mode = e.target.value
              setDraft({ ...draft, mode, min: mode === 'atLeast' ? String(draft.min || Math.max(1, draft.rules.length - 1)) : draft.min })
            }} style={{
              background: C.bg, color: C.text, border: `1px solid ${C.border2}`, borderRadius: 7, fontSize: 10, padding: '3px 5px',
            }}>
              <option value="all">All {draft.rules.length || ''}</option>
              <option value="any">Any</option>
              <option value="atLeast">At least…</option>
            </select>
            {draft.mode === 'atLeast' && (
              <>
                <input value={draft.min ?? ''} onChange={(e) => setDraft({ ...draft, min: e.target.value.replace(/[^0-9]/g, '') })}
                  inputMode="numeric" style={{
                    width: 28, background: C.bg, color: C.text, border: `1px solid ${C.border2}`, borderRadius: 7,
                    fontSize: 10, padding: '3px 4px', textAlign: 'center', fontFamily: NUM_FONT,
                  }} />
                <span>of {draft.rules.length}</span>
              </>
            )}
          </label>
        </div>
        <div style={{ fontSize: 9, color: C.text3, marginBottom: 7, lineHeight: 1.5 }}>
          A hitter lights up when he meets{' '}
          {draft.mode === 'any'
            ? <b>any one</b>
            : draft.mode === 'atLeast'
              ? <b>at least {Math.max(1, Math.min(draft.rules.length, Number(draft.min) || 1))} of {draft.rules.length}</b>
              : <b>all</b>} of these. A missing stat never counts as a pass.
        </div>
        {draft.rules.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
            <select value={r.field} onChange={(e) => setRule(i, { field: e.target.value })} style={{ ...inputStyle(), fontFamily: 'inherit', fontSize: 10.5, flex: 1, minWidth: 0, padding: '6px 6px' }}>
              {SPOT_GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {SPOT_FIELDS.filter((f) => f.group === g).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </optgroup>
              ))}
            </select>
            <select value={r.op} onChange={(e) => setRule(i, { op: e.target.value })} style={{ ...inputStyle(), width: 74, fontSize: 10.5, padding: '6px 4px', fontFamily: 'inherit' }}>
              <option value=">=">higher</option>
              <option value="<=">lower</option>
            </select>
            <div style={{ position: 'relative', width: 78, flexShrink: 0 }}>
              <input value={r.val} onChange={(e) => setRule(i, { val: e.target.value })} inputMode="decimal"
                style={{ ...inputStyle(), paddingRight: unitOf(r.field) && unitOf(r.field) !== 'avg' ? 28 : 9 }} />
              {unitOf(r.field) && unitOf(r.field) !== 'avg' && (
                <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 8.5, color: C.text3, pointerEvents: 'none' }}>{unitOf(r.field)}</span>
              )}
            </div>
            <button onClick={() => setDraft({ ...draft, rules: draft.rules.filter((_, j) => j !== i) })}
              title="Remove this criterion" style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', fontSize: 12, padding: '2px 4px' }}>🗑</button>
          </div>
        ))}
        <button onClick={() => setDraft({ ...draft, rules: [...draft.rules, { field: 'hr_score', op: '>=', val: 70 }] })}
          style={{ background: 'none', border: 'none', color: C.text2, cursor: 'pointer', fontSize: 10, fontWeight: 800, letterSpacing: '.05em', padding: '4px 0 2px' }}>
          ＋ ADD CRITERION
        </button>

        {/* live preview — the editor tells you what the wash will catch BEFORE saving */}
        <div style={{
          marginTop: 10, padding: '7px 11px', borderRadius: 9, fontSize: 10.5, lineHeight: 1.5,
          background: 'rgba(255,255,255,.03)', border: `1px solid ${C.border}`,
        }}>
          {draft.rules.length === 0 ? (
            <span style={{ color: C.text3 }}>Add a criterion to see who this would light up.</span>
          ) : (
            <>Right now this washes <b style={{ color: col, fontFamily: NUM_FONT }}>{nOn}</b> of the{' '}
              <b style={{ fontFamily: NUM_FONT }}>{players?.length || 0}</b> hitters on this board.</>
          )}
        </div>

        {/* footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 13 }}>
          {draft.id ? (
            <button onClick={onDelete} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 10, fontWeight: 800, letterSpacing: '.04em' }}>🗑 DELETE</button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onCancel} style={{
              background: 'transparent', border: `1px solid ${C.border2}`, color: C.text2, cursor: 'pointer',
              fontSize: 10.5, fontWeight: 800, borderRadius: 8, padding: '7px 14px',
            }}>Cancel</button>
            <button onClick={onSave} disabled={!draft.rules.length} style={{
              background: draft.rules.length ? col : C.bg3, border: 'none', color: '#0b0b10', cursor: draft.rules.length ? 'pointer' : 'default',
              opacity: draft.rules.length ? 1 : 0.5, fontSize: 10.5, fontWeight: 900, borderRadius: 8, padding: '7px 16px',
            }}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SpotlightControl({ players = [] }) {
  const { conf, update } = useSpotlight()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(null)

  const live = conf.lights.filter((l) => l.on && l.rules?.length)
  const active = conf.on && live.length > 0
  const btnCol = active ? spotColor(live[0]?.color) : C.text3

  const newLight = () => setDraft({
    id: '', name: '', color: SPOT_COLORS[(conf.lights.length) % SPOT_COLORS.length],
    priority: String(conf.lights.length + 1), mode: 'all', min: 1, on: true,
    rules: [{ field: 'hr_score', op: '>=', val: 70 }],
  })

  const saveDraft = () => {
    const clean = {
      ...draft,
      id: draft.id || `l${Date.now().toString(36)}`,
      name: draft.name.trim() || 'Highlight',
      color: spotColor(draft.color),
      priority: Math.max(1, Number(draft.priority) || 1),
      min: draft.mode === 'atLeast' ? Math.max(1, Math.min(draft.rules.length, Number(draft.min) || 1)) : undefined,
      rules: draft.rules
        .map((r) => ({ ...r, val: Number(r.val) }))
        .filter((r) => Number.isFinite(r.val)),
    }
    const exists = conf.lights.some((l) => l.id === clean.id)
    update({
      ...conf,
      on: true,
      lights: exists ? conf.lights.map((l) => (l.id === clean.id ? clean : l)) : [...conf.lights, clean],
    })
    setDraft(null)
  }

  const deleteDraft = () => {
    update({ ...conf, lights: conf.lights.filter((l) => l.id !== draft.id) })
    setDraft(null)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((v) => !v)} title={active
        ? `Highlights on: ${live.map((l) => l.name).join(', ')} — matches wash in their colors on every board`
        : 'Build named highlights (e.g. "Pure power": Barrel% ≥ 10 and LD% ≥ 30) — matches wash in that color, site-wide'}
        style={{
          fontFamily: NUM_FONT, fontSize: 10, fontWeight: 800, cursor: 'pointer',
          padding: '9px 13px', borderRadius: 999, whiteSpace: 'nowrap',
          border: `1px solid ${active ? btnCol : C.border2}`,
          background: active ? `${btnCol}1f` : C.bg3,
          color: active ? btnCol : C.text3, height: '100%', boxSizing: 'border-box',
        }}>
        ✨{active ? ` ${live.length}` : ''}
      </button>

      {open && !draft && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, zIndex: 70, marginTop: 5,
          background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: '10px 12px', width: 262, boxShadow: '0 12px 30px rgba(0,0,0,.5)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 900 }}>✨ Highlights</span>
            {conf.lights.length > 0 && (
              <button onClick={() => update({ ...conf, on: !conf.on })} style={{
                fontFamily: NUM_FONT, fontSize: 9, fontWeight: 800, cursor: 'pointer',
                border: `1px solid ${conf.on ? '#FCD34D' : C.border}`, borderRadius: 999, padding: '2px 9px',
                background: conf.on ? 'rgba(252,211,77,.12)' : 'transparent',
                color: conf.on ? '#FCD34D' : C.text3,
              }}>{conf.on ? 'all on' : 'all off'}</button>
            )}
          </div>
          <div style={{ fontSize: 9, color: C.text3, lineHeight: 1.5, marginBottom: 7 }}>
            Named rule sets — matching hitters wash in the highlight&apos;s color on every board.
            When two match, the lower priority number wins. Saved on this device.
          </div>
          {[...conf.lights].sort((a, b) => (Number(a.priority) || 99) - (Number(b.priority) || 99)).map((l) => (
            <div key={l.id} style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 5, minWidth: 0 }}>
              <button onClick={() => update({ ...conf, lights: conf.lights.map((x) => (x.id === l.id ? { ...x, on: !x.on } : x)) })}
                title={l.on ? 'On — tap to switch this highlight off' : 'Off — tap to switch on'}
                style={{
                  width: 14, height: 14, borderRadius: 999, cursor: 'pointer', flexShrink: 0, padding: 0,
                  background: l.on ? spotColor(l.color) : 'transparent',
                  border: `2px solid ${l.on ? spotColor(l.color) : C.border2}`,
                  boxShadow: l.on ? `0 0 7px ${spotColor(l.color)}66` : 'none',
                }} />
              <button onClick={() => setDraft({ ...l, priority: String(l.priority) })} className="tap-row"
                title={l.rules.map(ruleText).join(' · ')}
                style={{
                  flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                  color: l.on ? C.text : C.text3, fontSize: 10.5, fontWeight: 700, padding: '3px 2px',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                {l.name}
                <span style={{ fontFamily: NUM_FONT, fontSize: 8, color: C.text3, marginLeft: 5 }}>
                  P{l.priority} · {l.mode === 'atLeast' ? `${l.min || 1} of ${l.rules.length}` : l.mode === 'any' ? `any ${l.rules.length}` : `all ${l.rules.length}`}
                </span>
              </button>
              <span style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3, flexShrink: 0 }}
                title="How many hitters on this board it washes right now">{lightCount(l, players)}</span>
            </div>
          ))}
          <button onClick={newLight} style={{
            width: '100%', marginTop: 4, background: 'rgba(255,255,255,.03)', border: `1px dashed ${C.border2}`,
            color: C.text2, cursor: 'pointer', fontSize: 10, fontWeight: 800, borderRadius: 8, padding: '6px 0',
          }}>＋ New highlight</button>
        </div>
      )}

      {draft && (
        <LightEditor draft={draft} setDraft={setDraft} players={players}
          onSave={saveDraft} onCancel={() => setDraft(null)} onDelete={deleteDraft} />
      )}
    </div>
  )
}
