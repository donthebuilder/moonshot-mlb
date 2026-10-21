// THE RIGHT TAB TITLE FROM THE FIRST PAINT (2026-10-21, Donovan: "fix the title flash"). The server never sees the #sport=&tab=
// half of an /app address, so a deep link showed the route's static title ("MLB, NFL, NHL and NBA picks ...") until the product
// mounted, Home's title for a frame, then the page's own. This script sits in the ROOT layout's <head> (a page-level script arrives
// after <title> once the page streams), runs only on /app, writes the page's own title from the address, and holds it against
// Next's static <title> write until the product's own title takes over (usePageTitle), the address changes, or 20 s pass.
// The titles are made here from the same registry the dashboards use (lib/routes.js pageTitle + resolveTab), so the two cannot
// disagree; stored compactly (each tab's words once, aliases as a pointer) -- ~2 KB gzipped on every page. A hidden product is left out.
// Server component: nothing fetched, no state.
import { ALL_SPORT_KEYS, BRAND, MLB_TABS, NFL_TABS, NHL_TABS, NBA_TABS, MLB_ALIASES, NFL_ALIASES, NHL_ALIASES, NBA_ALIASES, resolveTab, pageTitle } from '../lib/routes'

export const SITE_SUFFIX = ' · DASH Network'

function titleMap() {
  const keys = new Set([...MLB_TABS, ...NFL_TABS, ...NHL_TABS, ...NBA_TABS, ...Object.keys(MLB_ALIASES), ...Object.keys(NFL_ALIASES), ...Object.keys(NHL_ALIASES), ...Object.keys(NBA_ALIASES)].map(String))
  const out = {}
  for (const s of ALL_SPORT_KEYS) {
    if (BRAND[s]?.hidden) continue
    const t = {}; const a = {}
    for (const k of ['home', ...keys]) {
      const r = resolveTab(s, k)
      if (r.status !== 'ok' && r.status !== 'alias') continue
      if (r.tab !== k) { a[k] = r.tab; continue }
      t[k] = pageTitle(s, k)
    }
    out[s] = { t, a }
  }
  return out
}

/** The static <title> of /app (app/app/page.js metadata). */
export const appStaticTitle = () => `${BRAND.nba.hidden ? 'MLB, NFL and NHL' : 'MLB, NFL, NHL and NBA'} picks, graded in public${SITE_SUFFIX}`

export default function TitleFromHash() {
  const js = `(function(){try{if(location.pathname!=='/app')return;var M=${JSON.stringify(titleMap())},S=${JSON.stringify(SITE_SUFFIX)},X=${JSON.stringify(appStaticTitle())};`
    + `var h=new URLSearchParams(String(location.hash||'').replace(/^#/,''));var m=M[h.get('sport')];if(!m)return;var k=h.get('tab')||'home';k=m.a[k]||k;var w=m.t[k]||m.t.home;if(!w)return;var want=w+S;`
    + `var put=function(){if(document.title!==want)document.title=want};put();var hash=location.hash,o=new MutationObserver(function(){var c=document.title;if(location.hash!==hash||(c!==want&&c!==X&&c.indexOf('Loading')!==0)){o.disconnect();return}if(c===X)put()});`
    + `o.observe(document.documentElement,{childList:true,subtree:true,characterData:true});setTimeout(function(){o.disconnect()},20000)}catch(e){}})()`
  return <script dangerouslySetInnerHTML={{ __html: js }} />
}
