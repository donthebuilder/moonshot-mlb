// THE RIGHT TAB TITLE FROM THE FIRST PAINT (2026-10-21, Donovan: "fix the title flash"). The server never sees the #sport=&tab=
// half of an /app address, so every deep link showed the route's static title ("MLB, NFL and NHL picks ...") until the product
// mounted, then its Home title for a frame, then the page's own. This writes the page's own title from the address before React
// loads: one small script, the titles made here from the same registry the dashboards use (lib/routes.js pageTitle), so the two
// cannot disagree. usePageTitle keeps holding it after hydration. A hidden product (BUCKETS before it opens) is not in the map.
// Server component: no state, nothing fetched.
import { ALL_SPORT_KEYS, BRAND, MLB_TABS, NFL_TABS, NHL_TABS, NBA_TABS, MLB_ALIASES, NFL_ALIASES, NHL_ALIASES, NBA_ALIASES, resolveTab, pageTitle } from '../lib/routes'

const SITE = ' · DASH Network'

function titleMap() {
  const keys = new Set([...MLB_TABS, ...NFL_TABS, ...NHL_TABS, ...NBA_TABS, ...Object.keys(MLB_ALIASES), ...Object.keys(NFL_ALIASES), ...Object.keys(NHL_ALIASES), ...Object.keys(NBA_ALIASES)].map(String))
  const out = {}
  for (const s of ALL_SPORT_KEYS) {
    if (BRAND[s]?.hidden) continue
    const m = { '': pageTitle(s, 'home') + SITE }
    for (const k of keys) {
      const r = resolveTab(s, k)
      if (r.status === 'ok' || r.status === 'alias') m[k] = pageTitle(s, r.tab) + SITE
    }
    out[s] = m
  }
  return out
}

export default function TitleFromHash() {
  const js = `(function(){try{var T=${JSON.stringify(titleMap())};var h=new URLSearchParams(String(location.hash||'').replace(/^#/,''));var m=T[h.get('sport')];if(!m)return;var t=m[h.get('tab')||'']||m[''];if(t)document.title=t}catch(e){}})()`
  return <script dangerouslySetInnerHTML={{ __html: js }} />
}
