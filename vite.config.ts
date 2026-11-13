import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // own backend (Pages Functions) runs separately: `npm run dev:api` → wrangler on :8788.
    // Host is kept (changeOrigin off) so the functions see the same origin as the browser.
    proxy: { '/api': { target: 'http://127.0.0.1:8788', changeOrigin: false } },
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        // one long-cached vendor chunk; app code changes don't bust it
        manualChunks: (id) => (id.includes('node_modules') ? 'vendor' : undefined),
      },
    },
  },
});
