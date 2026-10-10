// PROTOTYPE LOADER (card prototypes only; nothing deploys). Lets plain node import the site's
// extensionless, JSX-in-.js modules (lib/dash/homerCard.js ...) by compiling them with Next's own SWC,
// the same compiler `next build` uses. Usage: node --import ./scripts/proto-cards/_loader.mjs <script>
import { register } from 'node:module'
register('./_hooks.mjs', import.meta.url)
