import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// Target comes from VITE_API_TARGET/VITE_PORT env vars: .env.<mode> is gitignored repo-wide.
// Hardcoding localhost:3000 would silently send other contours to local's backend.
export default defineConfig(() => {
    const apiTarget = process.env.VITE_API_TARGET ?? 'http://localhost:3000';

    return {
        // Two dev servers run concurrently on this box; a shared cacheDir races on optimizeDeps.
        // Each instance (different VITE_PORT/mode) needs its own cache dir.
        cacheDir: `node_modules/.vite-${process.env.VITE_PORT ?? '5173'}`,
        plugins: [vue()],
        resolve: {
            alias: {
                '@': fileURLToPath(new URL('./src', import.meta.url)),
            },
        },
        build: {
            // The default outDir `assets/` collides with the `/assets` proxy rule, which intercepts
            // built bundles in vite preview and 404s the app's JS/CSS. A distinct outDir avoids this.
            assetsDir: '_app',
            // Keeps element-plus in a separate vendor chunk so app-code deploys don't re-download it.
            rollupOptions: {
                output: {
                    manualChunks: {
                        vue: ['vue', 'vue-router', 'pinia'],
                        'element-plus': ['element-plus', '@element-plus/icons-vue'],
                    },
                },
            },
        },
        server: {
            port: parseInt(process.env.VITE_PORT ?? '5173'),
            host: '0.0.0.0',
            allowedHosts: true,
            proxy: {
                '/shop-api': {
                    target: apiTarget,
                    changeOrigin: true,
                },
                // WS subscriptions transport (issue #87 part 6) — see
                // apps/server/src/subscriptions.ts's mountNotificationSubscriptions('/shop-api-subscriptions').
                '/shop-api-subscriptions': {
                    target: apiTarget,
                    changeOrigin: true,
                    ws: true,
                },
                // Authorized document PDFs (#263): same-origin, so the portal's session cookie is sent.
                '/document-pdf': {
                    target: apiTarget,
                    changeOrigin: true,
                },
                // Assets use a root-relative assetUrlPrefix so they resolve against the browser's origin.
                // This proxy makes that origin the storefront's own in dev.
                '/assets': {
                    target: apiTarget,
                    changeOrigin: true,
                },
            },
        },
    };
});
