#!/bin/bash
# One command, both repos, bot first (the site reads what the bot publishes).
#   bash ~/Desktop/moonshot-push/SHIP-ALL.sh
set -uo pipefail
echo "════ 1/2  BOT ════"
bash "$HOME/MLB-HR-DASHBOARD-STREAMLIT/SHIP-BOT.sh" || { echo; echo "Bot ship failed — site NOT pushed."; exit 1; }
echo
echo "════ 2/2  SITE ════"
bash "$HOME/Desktop/moonshot-push/SHIP.sh" || { echo; echo "Site ship failed (see above)."; exit 1; }
echo
echo "Both pushed. Merge the 'new-bots' PR on GitHub; the next Actions run publishes team names, the live race fields, and the first OBP/SLG out-of-sample number."
