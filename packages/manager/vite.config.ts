import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// Issue #68 follow-up: see packages/storefront/vite.config.ts for why the proxy target comes
// from plain VITE_API_TARGET/VITE_PORT env vars instead of being hardcoded.
export default defineConfig(() => {
    const apiTarget = process.env.VITE_API_TARGET ?? 'http://localhost:3000';

    return {
        plugins: [vue()],
        resolve: {
            alias: {
                '@': fileURLToPath(new URL('./src', import.meta.url)),
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
