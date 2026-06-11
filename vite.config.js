import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

const pagesBase =
  process.env.GITHUB_PAGES === 'true' ? '/Stellar-dev-dashboard/' : '/'

// https://vitejs.dev/config/
export default defineConfig({
  base: pagesBase,
  plugins: [
    react(),
    // Bundle analysis: run `ANALYZE=1 npm run build` to generate dist/stats.html
    process.env.ANALYZE &&
      visualizer({
        open: false,
        filename: 'dist/stats.html',
        title: 'Stellar Dev Dashboard — Bundle Analysis',
        gzipSize: true,
        brotliSize: true,
        template: 'treemap', // 'treemap' | 'sunburst' | 'network'
      }),
    // Security headers plugin (#106): injects HTTP security headers in dev server
    {
      name: 'copy-sw',
      // During build, Vite processes public/ automatically — sw.js placed in
      // public/ is already handled. This plugin just confirms it's included.
      generateBundle() {
        // sw.js lives in /public and is emitted by Vite's publicDir handling.
        // Nothing extra needed; this hook serves as documentation.
      },
    },
  ],

  build: {
    // Produce a sourcemap so Lighthouse and DevTools can audit the SW
    sourcemap: true,

    rollupOptions: {
      output: {
        // Deterministic chunk names for subresource integrity (#106)
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        // Manual chunks keep large libraries and feature areas cacheable while
        // route-level dynamic imports keep the app shell small.
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            if (id.includes('/src/components/charts/')) return 'charts'
            if (id.includes('/src/components/assets/')) return 'assets'
            if (id.includes('/src/components/multisig/')) return 'multisig'
            if (id.includes('/src/components/deployment/')) return 'deployment'
            return undefined
          }

          if (id.includes('@stellar/stellar-sdk')) return 'stellar-sdk'
          if (id.includes('recharts')) return 'charts-vendor'
          if (id.includes('lucide-react')) return 'icons-vendor'
          if (id.includes('i18next')) return 'i18n'
          if (id.includes('react')) return 'react-vendor'
          if (id.includes('date-fns')) return 'date-vendor'

          return 'vendor'
        },
      },
    },
  },

  // Allow the dev server to serve sw.js at the root scope
  server: {
    headers: {
      // Required for SharedArrayBuffer (not needed here) and to allow the SW
      // to intercept all requests under origin.
      'Service-Worker-Allowed': '/',
    },
  },

  // Optimise deps that are CommonJS
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
});
