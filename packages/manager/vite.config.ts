import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// Issue #68 follow-up: see packages/storefront/vite.config.ts for why the proxy target comes
// from plain VITE_API_TARGET/VITE_PORT env vars instead of being hardcoded.
export default defineConfig(() => {
    const apiTarget = process.env.VITE_API_TARGET ?? 'http://localhost:3000';

    return {
        // Vite's default cacheDir (node_modules/.vite) is per-package, not per dev-server
        // instance — this package is started twice concurrently on this box under different
        // VITE_PORT/mode (local contour's `make dev` on 5174, staging-integration's `make
        // dev-staging-integration` on 5184, see docs/environments.md). Without this, both
        // processes race on the same optimizeDeps cache directory, corrupting each other's
        // pre-bundled chunks — same anti-pattern already found and fixed for packages/dashboard
        // (issue #134 follow-up), just never ported here. Observed live as a hard
        // `@vitejs/plugin-vue` transformStyle crash on an unrelated component (MvTableFilters.vue)
        // that doesn't even have a <style> block.
        cacheDir: `node_modules/.vite-${process.env.VITE_PORT ?? '5174'}`,
        plugins: [vue()],
        resolve: {
            alias: {
                '@': fileURLToPath(new URL('./src', import.meta.url)),
            },
        },
        build: {
            // Vite's default build output dir is `assets/`, which collides with the `/assets`
            // proxy rule below (Vendure's own product-image assetUrlPrefix) — see
            // packages/storefront/vite.config.ts for the full explanation (issue #115).
            assetsDir: '_app',
            // Splits the single 1.4 MB/430 KB-gzip monolithic chunk Vite otherwise produces
            // (flagged by its own chunkSizeWarningLimit warning, issue #115) into independently
            // cacheable vendor bundles — these rarely change between our own deploys, so
            // splitting them out means a real app-code deploy doesn't force re-downloading them.
            rollupOptions: {
                output: {
                    manualChunks: {
                        vue: ['vue', 'vue-router', 'pinia'],
                        'element-plus': ['element-plus', '@element-plus/icons-vue'],
                        primevue: ['primevue', '@primevue/themes'],
                    },
                },
            },
        },
        server: {
            port: parseInt(process.env.VITE_PORT ?? '5174'),
            host: '0.0.0.0',
            allowedHosts: true,
            proxy: {
                '/admin-api': {
                    target: apiTarget,
                    changeOrigin: true,
                },
                // WS subscriptions transport (issue #87 part 5) — see
                // apps/server/src/subscriptions.ts for the endpoint this proxies to.
                '/admin-api-subscriptions': {
                    target: apiTarget,
                    changeOrigin: true,
                    ws: true,
                },
                // See packages/storefront/vite.config.ts for why this needs to be proxied
                // through the app's own dev origin rather than hit directly.
                '/assets': {
                    target: apiTarget,
                    changeOrigin: true,
                },
            },
        },
    };
});
