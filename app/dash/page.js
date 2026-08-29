// /dash was the front door for about a day, and links to it exist in the
// wild (the More drawers shipped pointing here). It is the root now, so this
// forwards rather than 404s or renders a second copy of the same page.
import { redirect } from 'next/navigation'

export default function DashAlias() {
  redirect('/')
}
