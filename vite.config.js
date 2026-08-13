import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages serves a project site at https://<user>.github.io/<repo>/,
  // so production asset URLs must be prefixed with the repo name. Only applied
  // to `vite build` — local `npm run dev` stays at the root path.
  // Must exactly match the GitHub repo name (case-sensitive). If you rename
  // the repo, change this value to "/<your-repo>/". (Use '/' if you deploy to
  // a <user>.github.io root repo or a custom domain.)
  base: command === 'build' ? '/Production-flow-test/' : '/',
  plugins: [
    tailwindcss(),
    react(),
  ],
  server: {
    // The project lives on a UNC / network share (\\nas01\...). Native file-
    // system watch events don't fire on network drives, so Vite's hot-reload
    // never notices edits and the browser shows stale code. Polling forces
    // Vite to re-check the files on a timer so changes actually hot-reload.
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
}))
