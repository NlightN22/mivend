import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// Issue #68 follow-up: see packages/storefront/vite.config.ts for why the proxy target comes
// from plain VITE_API_TARGET/VITE_PORT env vars instead of being hardcoded.
export default defineConfig(() => {
    const apiTarget = process.env.VITE_API_TARGET ?? 'http://localhost:3000';

    return {
        // Default cacheDir is shared per package; concurrent dev servers (different ports/modes)
        // race on the optimizeDeps cache and corrupt each other's pre-bundled chunks.
        cacheDir: `node_modules/.vite-${process.env.VITE_PORT ?? '5174'}`,
        plugins: [vue()],
        resolve: {
            alias: {
                '@': fileURLToPath(new URL('./src', import.meta.url)),
            },
        },
        build: {
            // Build outDir must not be `assets/`: it collides with the `/assets` proxy rule
            // for Vendure's product-image assetUrlPrefix.
            assetsDir: '_app',
            // Vendor code goes in its own chunk so app-only deploys don't invalidate its browser cache;
            // the vendor set changes rarely, unlike app code.
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
                // Authorized document PDFs (#263): same-origin, so the portal's session cookie is sent.
                '/document-pdf': {
                    target: apiTarget,
                    changeOrigin: true,
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
