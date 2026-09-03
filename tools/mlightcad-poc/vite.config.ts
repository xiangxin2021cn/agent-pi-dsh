import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    emptyOutDir: true,
    outDir: fileURLToPath(
      new URL('../../bundles/tender-web/lib/cad-viewer', import.meta.url)
    ),
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 5000
  }
})
