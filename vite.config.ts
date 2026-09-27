import { defineConfig } from 'vite';
export default defineConfig({
  // npm ci replaces node_modules; keep a running dev server's bundles intact.
  cacheDir: '.cache/vite',
  server: {
    port: 5175,
    strictPort: true,
    proxy: {
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
      '/api': 'http://127.0.0.1:3001',
    },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 850 },
});
