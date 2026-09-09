'use client'
// ⇅ CLICK A HEADER TO SORT — for every table that isn't a DenseTable.
//
// Donovan (2026-09-05): "make those new type of table throughout the site
// sortable, I don't like that you can't sort them." DenseTable has always
// sorted on a header click; the plain <table>s that grew around it on
// 2026-09-03 (Comeback, Moneyline, October odds, the money answer) and the
// older ones (True Price, Season record, box scores) sorted from pills or not
// at all, and their headers were dead. This is the one hook they all share
// now: hand it the rows and an initial column, get back the rows in order
// and a `thProps()` for each header. components/SortTh.js draws the header.
//
// Rules, the same as DenseTable's: numbers sort as numbers, text as text,
// blanks always sink to the bottom whichever way you sort, and the first
// click on a numeric column is DESCENDING (the big number is what you came
// for) while the first click on a text column is ascending.
import { useCallback, useMemo, useState } from 'react'

const isNum = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v))
const blank = (v) => v === '' || v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))

export function compareBy(get, dir) {
  const m = dir === 'asc' ? 1 : -1
  return (a, b) => {
    const va = get(a), vb = get(b)
    const ba = blank(va), bb = blank(vb)
    if (ba && bb) return 0
    if (ba) return 1
    if (bb) return -1
    if (isNum(va) && isNum(vb)) return (Number(va) - Number(vb)) * m
    return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' }) * m
  }
}

/**
 * @param rows      the unsorted rows
 * @param initial   { key, dir } — the column the table opens on
 * @param getters   { [key]: (row) => value } for columns that aren't a plain field
 * @param options   { text: Set of keys whose first click is ascending }
 */
export function useSort(rows, initial = { key: '', dir: 'desc' }, getters = {}, options = {}) {
  const [sort, setSort] = useState({ key: initial.key || '', dir: initial.dir || 'desc' })
  const textKeys = options.text || new Set()

  const toggle = useCallback((key) => {
    setSort((cur) => {
      if (cur.key === key) return { key, dir: cur.dir === 'desc' ? 'asc' : 'desc' }
      return { key, dir: textKeys.has(key) ? 'asc' : 'desc' }
    })
  }, [textKeys])

  const sorted = useMemo(() => {
    const list = Array.isArray(rows) ? [...rows] : []
    if (!sort.key) return list
    const get = getters[sort.key] || ((r) => r?.[sort.key])
    return list.sort(compareBy(get, sort.dir))
  }, [rows, sort, getters])

  const thProps = useCallback((key) => ({
    active: sort.key === key,
    dir: sort.key === key ? sort.dir : null,
    onSort: () => toggle(key),
  }), [sort, toggle])

  return { sorted, sort, setSort, toggle, thProps }
}
