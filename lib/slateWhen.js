// WHICH NIGHT A SLATE IS (F-03). The hero's count line names the slate's OWN
// date against the Eastern day it is read on: a slate dated after today is
// "tomorrow" (or its weekday, further out), anything else is "tonight". Pure,
// so a node check can hold it with fixed dates.
const YMD = /^\d{4}-\d{2}-\d{2}$/
const DAY = 86400000
const at = (ymd) => Date.parse(`${ymd}T12:00:00Z`)
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function slateWhen(slateDate, today) {
  if (!YMD.test(String(slateDate || '')) || !YMD.test(String(today || '')) || slateDate <= today) return 'tonight'
  const gap = Math.round((at(slateDate) - at(today)) / DAY)
  if (gap === 1) return 'tomorrow'
  return `on ${WEEKDAYS[new Date(at(slateDate)).getUTCDay()]}`
}
