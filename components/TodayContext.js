'use client'
import { createContext } from 'react'

// THE DAY, FOR EVERY PAGE (2026-09-28, DAY-AWARE-OPENERS-PLAN). Each product's
// shell provides its day's games -- { sport, date, games, next } -- once;
// PageHeader reads it and prints lib/dayLine.js todayLine() under the title,
// so ~40 tabs say the day without 40 edits. No provider (login pages) -> no line.
export const TodayContext = createContext(null)
