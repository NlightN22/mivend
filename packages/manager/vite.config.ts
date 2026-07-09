import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    server: {
        port: 5174,
        host: '0.0.0.0',
        allowedHosts: true,
        proxy: {
            '/admin-api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
            // See packages/storefront/vite.config.ts for why this needs to be proxied
            // through the app's own dev origin rather than hit directly.
            '/assets': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
        },
    },
});
