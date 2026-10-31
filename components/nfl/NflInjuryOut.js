'use client'
// TUDDY's "Out this week" list: the shared InjuryOut, plus "NEXT UP" behind each OUT man from ESPN's own depth chart (lib/nfl/depthChart.js, /api/nfl/depth). A hook cannot
// sit inside the slate's panel closure, so the call sits here.
import InjuryOut from '../injuries/InjuryOut'
import { useNflDepth } from '../../lib/nfl/useDepth'

export default function NflInjuryOut(props) {
  const nextUpOf = useNflDepth(props.clubs)
  return <InjuryOut {...props} nextUpOf={nextUpOf} />
}
