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
        port: 5173,
        host: '0.0.0.0',
        allowedHosts: true,
        proxy: {
            '/shop-api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
            // Assets are served with a root-relative assetUrlPrefix (see
            // apps/server/src/vendure-config.ts) specifically so they resolve
            // against whatever origin the browser is on — this proxy is what
            // makes that origin the storefront's own, in dev.
            '/assets': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
            // REST API docs (issue #28) — not a storefront route, forward to
            // the server directly so it's reachable through the same public
            // origin as everything else (the Apache vhost in front of this
            // dev box forwards its whole public domain to this Vite server;
            // only paths listed here get relayed on to the actual backend).
            '/api-docs': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
        },
    },
});
