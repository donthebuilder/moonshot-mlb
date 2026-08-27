import LeagueMobileNav from './LeagueMobileNav'

export default function LeagueLayout({children,params}) {
  return <>{children}<LeagueMobileNav leagueId={params.leagueId}/></>
}
