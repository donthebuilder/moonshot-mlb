import LeagueMobileNav from './LeagueMobileNav'

export default async function LeagueLayout({children,params}) {
  const {leagueId}=await params
  return <>{children}<LeagueMobileNav leagueId={leagueId}/></>
}
