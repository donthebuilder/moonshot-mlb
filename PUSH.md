# Pushing moonshot-mlb

Run these on your Mac. I can't run them — my sandbox has no network route to
GitHub, which is also why the port was verified against local fixtures rather
than a live fetch.

`moonshot-mlb` currently holds a Streamlit app (`streamlit_app.py`,
`dashboard_theme.py`). This **replaces** it. Nothing in it is reused.

## 1. Move this folder somewhere sensible

It was delivered to `~/Desktop/results/moonshot-mlb`, which is your data dump.

```bash
mv ~/Desktop/results/moonshot-mlb ~/Documents/GitHub/moonshot-mlb
cd ~/Documents/GitHub/moonshot-mlb
```

## 2. Sanity-check before touching git

```bash
npm install
npm run build          # must say "Compiled successfully"
node scripts/smoke.mjs # must say "all checks passed"
```

If smoke fails on `pitch/batter_*.json`, that's the known gap — see
`docs/publish-pitch-files.patch.md`. Everything else must pass.

## 3. Push

```bash
git init
git remote add origin https://github.com/donthebuilder/moonshot-mlb.git
git fetch origin main

# replace the placeholder Streamlit app rather than merging with it
git checkout -b main
git add -A
git commit -m "Replace Streamlit placeholder with Next.js dashboard

Reads the published data branch of MLB-HR-DASHBOARD-STREAMLIT.
Read-only: no bot, no workflows, no .github/.
Adds Plotly, Replit config (8080/0.0.0.0), and scripts/smoke.mjs."

git push --force origin main
```

`--force` is correct here and only here: you are deliberately discarding the
3-commit placeholder. Do **not** use `--force` against
`MLB-HR-DASHBOARD-STREAMLIT`.

## 4. Verify against the deployed file, not your disk

A green push is not proof. Check what GitHub actually serves:

```bash
curl -s https://raw.githubusercontent.com/donthebuilder/moonshot-mlb/main/lib/dataSource.js | head -20
curl -s -o /dev/null -w "%{http_code}\n" \
  https://raw.githubusercontent.com/donthebuilder/moonshot-mlb/main/package.json
```

Confirm `.github/` does **not** exist on the remote:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  https://api.github.com/repos/donthebuilder/moonshot-mlb/contents/.github
```

`404` is the correct answer. Anything else means a workflow reached the repo
that must never run a bot.

## 5. Replit

Point the Repl at `donthebuilder/moonshot-mlb`, branch `main`. `.replit`
already sets port 8080 -> 80 and binds `0.0.0.0`. Run, then open a player and
confirm the zone grid draws.

---

## Separately: rotate the OpenWeatherMap key

`8f135bcde3b6e1d859549e8419cc61e8` is in plaintext in `MIGRATION.md` in a
**public** repo, and hardcoded as a fallback in `bots/mlb_dashboard.py`.
It has been public and should be treated as compromised.

1. Rotate at https://home.openweathermap.org/api_keys
2. Put the new key in GitHub -> Settings -> Secrets and variables -> Actions
   as `OWM_API_KEY`
3. Remove the hardcoded fallback from `bots/mlb_dashboard.py` so a missing
   secret fails loudly instead of silently using a dead key
4. Scrub it from `MIGRATION.md`

Deleting it from the current files does not remove it from git history.
Rotating is what actually fixes this.
