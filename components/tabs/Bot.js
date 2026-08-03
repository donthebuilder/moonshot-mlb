'use client'
import { useState, useMemo, useEffect } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { PanelTitle, Empty, btnStyle } from '../ui'
import { logUrl } from '../../lib/dataSource'

// ── helpers ───────────────────────────────────────────────────────────────────

function hrwEmoji(s) {
  // Aligned to bots/today_bot.py's hrw_zone_label() bands (45/55/70/80), the
  // single source of truth h.hrw_zone is built from. 80+ gets 🌋 instead of
  // 🚀 since hrw_zone_score_value() deliberately treats 80+ as less reliable
  // than 70-80 ("the graded sample favored 55-70 more than extreme 80+").
  const n = Number(s || 0)
  if (n > 80) return '🌋'
  if (n > 70) return '🚀'
  if (n >= 55) return '⚡'
  // Changed 👀→🌤️ to match backend hrw_emoji() and stop colliding with the
  // Power Watch role emoji below (now 🔭, was 👀).
  if (n >= 45) return '🌤️'
  return '🧊'
}

function roleColor(role) {
  const s = String(role || '')
  if (s.includes('🏆')) return '#FB923C'
  if (s.includes('🧨')) return '#FB923C'
  if (s.includes('🔥')) return '#f97316'
  if (s.includes('🏁')) return '#22d3ee'
  if (s.includes('💠')) return '#38bdf8'
  if (s.includes('🔭')) return '#a78bfa'
  if (s.includes('⛔')) return '#ef4444'
  return C.text2
}

// ── Board ─────────────────────────────────────────────────────────────────────

const PICK_TABS = [
  { key:'top',     label:'🏆 Top',     roles:['TOP'] },
  { key:'hr',      label:'🧨 HR',      roles:['HR'] },
  { key:'hrr',     label:'🏁 HRR',     roles:['HRR'] },
  { key:'hit',     label:'💠 Hit',      roles:['HIT'] },
  { key:'contact', label:'⚾ Contact',  roles:['CONTACT'] },
  { key:'all',     label:'All',         roles:null },
]

function BoardRow({ p, i, onPlayerClick }) {
  const role   = p.final_hr_role || ''
  const col    = roleColor(role)
  const pick   = p.game_pick_role || ''
  const pills  = Array.isArray(p.signal_pills) ? p.signal_pills.slice(0, 3) : []
  const pickColors = { TOP:'#FCD34D', HR:'#FB923C', HRR:'#22d3ee', HIT:'#38bdf8', CONTACT:'#a78bfa' }
  const pickCol = pickColors[pick] || C.text3
  const isTrap  = p.trap_flag && !p.got_hr
  const isMatch = p.pitch_type_match_flag
  const isHidden = p.hidden_hr_value

  return (
    <div style={{
      display:'grid', gridTemplateColumns:'28px 1fr auto',
      gap:8, alignItems:'center',
      padding:'9px 14px',
      borderTop:i?`1px solid ${C.border}`:'none',
      background: isTrap ? 'rgba(248,113,113,0.04)' : 'transparent',
      cursor: onPlayerClick ? 'pointer' : 'default',
    }}
      onClick={() => onPlayerClick && onPlayerClick(p)}
    >
      {/* rank */}
      <div style={{ fontFamily:NUM_FONT, fontSize:11, color:C.text3, textAlign:'center' }}>#{i+1}</div>

      {/* name + meta */}
      <div style={{ minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
          <span style={{ fontSize:13, fontWeight:700 }}>{p.name}</span>
          {p.weak_spot_flag && <span style={{ fontSize:11 }}>⭐</span>}
          {isMatch && <span style={{ fontSize:11 }} title={p.pitch_type_match_note||''}>🎯</span>}
          {isHidden && <span style={{ fontSize:11 }}>👻</span>}
          {isTrap && <span style={{ fontSize:11 }} title={p.trap_reason||''}>⚠️</span>}
          <span style={{ fontSize:10, color:C.text3 }}>{p.team}</span>
          <span style={{ fontSize:9, padding:'1px 5px', borderRadius:4, background:`${pickCol}22`, color:pickCol, fontWeight:700, textTransform:'uppercase', fontFamily:NUM_FONT }}>{pick}</span>
        </div>
        <div style={{ fontSize:10, color:C.text3, fontFamily:NUM_FONT, marginTop:1, display:'flex', gap:6, flexWrap:'wrap' }}>
          <span style={{ color:col }}>{role}</span>
          {pills.map((pl,pi)=><span key={pi}>{pl}</span>)}
        </div>
        <div style={{ fontSize:10, color:C.text3, fontFamily:NUM_FONT, marginTop:1 }}>
          vs {p.pitcher_name} ({p.pitcher_throws}) · #{p.lineup_spot} · {p.opponent}
          {p.pitcher_attack_tag ? ` · ${p.pitcher_attack_tag}` : ''}
          {isTrap && p.trap_reason ? <span style={{ color:'#f87171', marginLeft:4 }}>{p.trap_reason}</span> : null}
        </div>
      </div>

      {/* scores */}
      <div style={{ textAlign:'right', flexShrink:0 }}>
        <div style={{ fontFamily:NUM_FONT, fontWeight:800, fontSize:16, color:C.orange }}>{Math.round(p.hr_score||0)}</div>
        <div style={{ fontFamily:NUM_FONT, fontSize:10, color:C.text3 }}>
          HRW {Math.round(p.hrw_score||0)} {hrwEmoji(p.hrw_score||0)}
        </div>
        {(p.last5_hr||0)>0 && (
          <div style={{ fontFamily:NUM_FONT, fontSize:10, color:(p.last5_hr||0)>=2?C.orange:C.text3 }}>
            L5: {p.last5_hr}HR
          </div>
        )}
      </div>
    </div>
  )
}

function Board({ players, onPlayerClick }) {
  const [pickTab, setPickTab] = useState('top')

  const sorted = useMemo(() =>
    [...players].sort((a,b)=>(b.top_board_score_v2||0)-(a.top_board_score_v2||0))
  , [players])

  const tab = PICK_TABS.find(t=>t.key===pickTab) || PICK_TABS[0]
  const rows = tab.roles
    ? sorted.filter(p=>tab.roles.includes(p.game_pick_role||''))
    : sorted.slice(0, 40)

  if (!players.length) return <Empty text="No player data loaded." />

  return (
    <div>
      {/* pick type filter */}
      <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:10 }}>
        {PICK_TABS.map(t=>(
          <button key={t.key} onClick={()=>setPickTab(t.key)} style={btnStyle(C.orange, pickTab===t.key)}>
            {t.label}
            {t.roles ? ` (${sorted.filter(p=>t.roles.includes(p.game_pick_role||'')).length})` : ` (${Math.min(sorted.length,40)})`}
          </button>
        ))}
      </div>

      {/* legend */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:10, fontSize:10, color:C.text3, fontFamily:NUM_FONT }}>
        <span>⭐ weak pitcher spot</span>
        <span>🎯 pitch type match</span>
        <span>👻 hidden value</span>
        <span>⚠️ trap flag</span>
      </div>

      {rows.length===0
        ? <Empty text="No picks in this category." />
        : (
          <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10, overflow:'hidden' }}>
            {rows.map((p,i)=><BoardRow key={p.player_id||i} p={p} i={i} onPlayerClick={onPlayerClick} />)}
          </div>
        )
      }
    </div>
  )
}

// ── Simple Picks list ─────────────────────────────────────────────────────────
// Just names + team + role, nothing else, until you click one. The Board view
// above already shows full detail inline for people who want it; this is the
// lightweight alternative for just scanning who the bot picked.

function PickRow({ p, onPlayerClick }) {
  const role = p.final_hr_role || ''
  const col = roleColor(role)
  return (
    <div
      onClick={() => onPlayerClick && onPlayerClick(p)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '11px 14px',
        cursor: onPlayerClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 14 }}>{role.split(' ')[0] || '•'}</span>
        <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {p.name}
        </span>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0 }}>{p.team}</span>
      </div>
      <span style={{ fontSize: 10, color: col, fontFamily: NUM_FONT, flexShrink: 0, whiteSpace: 'nowrap' }}>
        {role.replace(/^\S+\s*/, '') || '—'}
      </span>
    </div>
  )
}

function PicksTab({ players, onPlayerClick }) {
  const [pickTab, setPickTab] = useState('top')

  const sorted = useMemo(
    () => [...players].sort((a, b) => (b.top_board_score_v2 || 0) - (a.top_board_score_v2 || 0)),
    [players],
  )

  const tab = PICK_TABS.find((t) => t.key === pickTab) || PICK_TABS[0]
  const rows = tab.roles
    ? sorted.filter((p) => tab.roles.includes(p.game_pick_role || ''))
    : sorted.slice(0, 40)

  if (!players.length) return <Empty text="No player data loaded." />

  return (
    <div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
        {PICK_TABS.map((t) => (
          <button key={t.key} onClick={() => setPickTab(t.key)} style={btnStyle(C.orange, pickTab === t.key)}>
            {t.label}
            {t.roles ? ` (${sorted.filter((p) => t.roles.includes(p.game_pick_role || '')).length})` : ` (${Math.min(sorted.length, 40)})`}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty text="No picks in this category." />
      ) : (
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          {rows.map((p, i) => (
            <div key={p.player_id || i} style={{ borderTop: i ? `1px solid ${C.border}` : 'none' }}>
              <PickRow p={p} onPlayerClick={onPlayerClick} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Log viewer ────────────────────────────────────────────────────────────────
// Auto-loads on mount (no click needed), reads like plain text instead of a
// terminal dump, and only colors genuine errors -- the old highlight regex
// matched "score|hr|pick|role" which is most lines in this log, so almost
// everything used to render orange. Now color is reserved for what actually
// needs attention.

// Heuristic player-name highlighter: matches 2-3 consecutive Capitalized
// words (e.g. "Spencer Torkelson", "Vladimir Guerrero Jr") and wraps them in
// a highlighted span. No player list is threaded into this component, so
// this is pattern-based rather than an exact lookup -- it'll occasionally
// highlight a non-name capitalized phrase, but that's a reasonable trade
// for not having to wire a full roster through just for log styling.
const NAME_PATTERN = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+\.?){1,2})\b/g

function highlightNames(line) {
  const parts = []
  let lastIndex = 0
  let match
  let key = 0
  NAME_PATTERN.lastIndex = 0
  while ((match = NAME_PATTERN.exec(line)) !== null) {
    if (match.index > lastIndex) parts.push(line.slice(lastIndex, match.index))
    parts.push(
      <span key={key++} style={{ color: '#FCD34D', fontWeight: 700 }}>{match[0]}</span>
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < line.length) parts.push(line.slice(lastIndex))
  return parts.length ? parts : line
}

function LogViewer({ url, label }) {
  const [text, setText]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(url)
      .then(r => r.ok ? r.text() : Promise.resolve(`Could not load ${url}`))
      .catch(() => 'Error loading log.')
      .then(t => { if (!cancelled) { setText(t); setLoading(false) } })
    return () => { cancelled = true }
  }, [url])

  const lines = useMemo(() => {
    if (!text) return []
    const f = filter.trim().toLowerCase()
    const all = text.split('\n').filter(l => l.trim().length > 0)
    return f ? all.filter(l => l.toLowerCase().includes(f)) : all
  }, [text, filter])

  return (
    <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10, overflow:'hidden' }}>
      {/* header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:C.bg3, borderBottom:`1px solid ${C.border}`, gap:8, flexWrap:'wrap' }}>
        <div style={{ fontSize:13, fontWeight:800 }}>{label}</div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          {text !== null && (
            <input
              type="search"
              placeholder="Filter lines…"
              value={filter}
              onChange={e=>setFilter(e.target.value)}
              style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:6, padding:'4px 9px', fontSize:12, color:C.text, outline:'none', width:180 }}
            />
          )}
          {text !== null && (
            <span style={{ fontSize:10, color:C.text3, fontFamily:NUM_FONT }}>{lines.length} lines{filter?` matching "${filter}"`:''}</span>
          )}
        </div>
      </div>

      {/* content */}
      {loading && (
        <div style={{ padding: '20px 14px', fontSize: 12.5, color: C.text3 }}>Loading log…</div>
      )}
      {!loading && text !== null && (
        <div style={{
          margin:0, padding:'14px 16px',
          fontSize:12.5,
          color:C.text2, overflowX:'hidden',
          whiteSpace:'pre-wrap', wordBreak:'break-word',
          maxHeight:600, overflowY:'auto',
          lineHeight:1.75,
          textAlign:'center',
        }}>
          {lines.map((line, i) => {
            // Color reserved for genuine errors/failures only -- everything
            // else reads as plain, even-toned text so the log is scannable
            // instead of looking like every line matters equally.
            const isError = /\berror\b|\bfail(ed|ure)?\b|exception|traceback/i.test(line)
            const isWarn  = /\bwarn(ing)?\b|⚠/i.test(line)
            return (
              <div key={i} style={{
                color: isError ? '#f87171' : isWarn ? '#fbbf24' : C.text2,
                background: filter && line.toLowerCase().includes(filter.toLowerCase()) ? 'rgba(249,115,22,0.10)' : 'transparent',
                padding: '1px 0',
              }}>
                {highlightNames(line)}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const VIEWS = [
  { key:'picks',    label:'📋 Picks' },
  { key:'board',    label:'🏆 Board' },
  { key:'log',      label:'📄 Today Log' },
  { key:'tomorrow', label:'📄 Tomorrow Log' },
]

export default function Bot({ players = [], onPlayerClick }) {
  const [view, setView] = useState('picks')

  return (
    <div>
      <PanelTitle
        title="Bot Output"
        sub={`${players.length} players on slate`}
        right={
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            {VIEWS.map(v=>(
              <button key={v.key} onClick={()=>setView(v.key)} style={btnStyle(C.orange, view===v.key)}>
                {v.label}
              </button>
            ))}
          </div>
        }
      />

      {view==='picks'    && <PicksTab players={players} onPlayerClick={onPlayerClick} />}
      {view==='board'    && <Board players={players} onPlayerClick={onPlayerClick} />}
      {view==='log'      && <LogViewer url={logUrl('today')}    label="Today's Bot Log" />}
      {view==='tomorrow' && <LogViewer url={logUrl('tomorrow')} label="Tomorrow's Bot Log" />}
    </div>
  )
}
