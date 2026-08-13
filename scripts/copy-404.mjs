// GitHub Pages has no server-side routing: a hard refresh or direct visit to
// a deep link like /steelflow/mes-station would 404. GitHub Pages serves
// 404.html for any path it can't find, so by copying our built index.html to
// 404.html the single-page app boots there and React Router takes over.
// Runs automatically after `npm run build` (see package.json).
import { copyFileSync, existsSync } from 'node:fs'

const src = 'dist/index.html'
const dest = 'dist/404.html'

if (!existsSync(src)) {
  console.error(`[copy-404] ${src} not found — did the build run?`)
  process.exit(1)
}
copyFileSync(src, dest)
console.log('[copy-404] Created dist/404.html for SPA routing on GitHub Pages')
