# Getting this onto Replit

Skip GitHub. Drag the folder in directly — it avoids the web upload form,
which strips folder paths and would flatten the project.

## 1. Delete the placeholder first

In your Repl's file pane, delete:

- `streamlit_app.py`
- `dashboard_theme.py`
- `requirements.txt`   ← the Python one
- `.replit`            ← replaced by the one in this folder

If `streamlit_app.py` survives, Replit may keep booting Streamlit and you'll
think the port failed when it never ran.

## 2. Drag the contents in

Drag everything **inside** `moonshot-mlb/` into the Repl root — not the folder
itself, or you'll end up with `moonshot-mlb/moonshot-mlb/`.

The root should end up looking like:

```
.replit  replit.nix  package.json  next.config.js  README.md
app/  components/  lib/  scripts/  public/  docs/
```

Confirm `components/tabs/` has 15 files. If it has 0 and those files landed at
the root instead, the drag flattened them — undo and drag the folder itself,
then move its contents up one level.

## 3. Run

Press Run. First boot takes a couple of minutes: `npm install`, then
`next build`, then the server starts. You want to see:

```
✓ Compiled successfully
▲ Next.js 14.2.35
- Network: http://0.0.0.0:8080
✓ Ready
```

## 4. If the page is blank or empty

Run this in the Replit Shell before assuming the UI is broken:

```bash
npm run smoke
```

It checks each published data file and runs the real slate through the
normalizer. It tells you in one step whether the problem is the data feed or
the interface.

Note the slate on the data branch was last built **July 26** — the boards will
render week-old games until the bot runs again. That's the feed, not the port.

## 5. Push to GitHub from Replit

Use Replit's **Git** pane (left sidebar) rather than the GitHub website. It
preserves directory structure. Connect it to
`github.com/donthebuilder/moonshot-mlb`, commit, push.

Then verify what's actually deployed:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  https://api.github.com/repos/donthebuilder/moonshot-mlb/contents/.github
```

`404` is correct — that repo must never run a bot.

## What you should see

The Next.js UI (`Dashboard.js` / `ui.js`) with every Streamlit section:

| Streamlit | Here |
|---|---|
| Board | HR Board |
| Games | Games |
| Pairs | Pairs |
| Pools | Pools |
| Results | Results |
| Bot Report | Bot |

Plus Pitchers, Scoreboard, Leaders, Watchlist, Spray, Hits & HRR, Guide.

Hot-zone heatmaps will be empty until `make_slim.py` publishes the per-batter
files — see `publish-pitch-files.patch.md`. Nothing else depends on them.
