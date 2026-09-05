import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// Issue #68 follow-up: the proxy target used to be hardcoded to the local contour's server
// (localhost:3000), so a storefront instance started against any other contour (e.g.
// staging-integration) would still silently talk to local's backend. VITE_API_TARGET/VITE_PORT
// are plain env vars (set inline by the root package.json's per-contour dev scripts, see
// docs/environments.md's port scheme) — not Vite's own `.env.<mode>` file convention, since
// `.env.*` is repo-wide gitignored (AGENTS.md sync rule territory: no real secrets here, but no
// reason to fight the ignore pattern for two plain URLs). `--mode staging-integration` is still
// passed on the CLI for those contours purely so the process shows up distinguishably in `ps` —
// see infrastructure/scripts/dev-kill-staging-integration.sh.
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
            port: parseInt(process.env.VITE_PORT ?? '5173'),
            host: '0.0.0.0',
            allowedHosts: true,
            proxy: {
                '/shop-api': {
                    target: apiTarget,
                    changeOrigin: true,
                },
                // Assets are served with a root-relative assetUrlPrefix (see
                // apps/server/src/vendure-config.ts) specifically so they resolve
                // against whatever origin the browser is on — this proxy is what
                // makes that origin the storefront's own, in dev.
                '/assets': {
                    target: apiTarget,
                    changeOrigin: true,
                },
                // REST API docs (issue #28) — not a storefront route, forward to
                // the server directly so it's reachable through the same public
                // origin as everything else (the Apache vhost in front of this
                // dev box forwards its whole public domain to this Vite server;
                // only paths listed here get relayed on to the actual backend).
                '/api-docs': {
                    target: apiTarget,
                    changeOrigin: true,
                },
            },
        },
    };
});
