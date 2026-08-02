// Single source of truth for where slate data comes from.
// moonshot-mlb is READ-ONLY: it never writes, never runs a bot.
// Data is published by MLB-HR-DASHBOARD-STREAMLIT to its `data` branch.

const REPO = 'donthebuilder/MLB-HR-DASHBOARD-STREAMLIT'
const BRANCH = 'data'

export const DATA_BASE =
    process.env.NEXT_PUBLIC_DATA_BASE ||
    `https://raw.githubusercontent.com/${REPO}/${BRANCH}/public/data`

export const dataUrl = (p) => `${DATA_BASE}/${String(p).replace(/^\/+/, '')}`
