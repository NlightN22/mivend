import { defineConfig } from 'vite';
import { vendureDashboardPlugin } from '@vendure/dashboard/vite';
import { resolve } from 'node:path';

// Issue #77: the Dashboard is deployed as a fully standalone Vite app (not mounted on the
// server via DashboardPlugin.init()), same shape as packages/storefront and packages/manager.
//
// `api.host`/`api.port: 'auto'` make the dashboard runtime derive the admin-api origin from
// `window.location` at request time (see @vendure/dashboard's use-job-queue-polling chunk),
// instead of baking a literal host:port into the served bundle. That literal-host approach
// (an earlier version of this file used `apiTarget.hostname`/`.port` directly) broke for any
// viewer whose "localhost" isn't this box — e.g. anyone reaching the dashboard through its
// published external port (see docs/environments.md) got a browser trying to fetch its own
// local machine's `localhost:3000`. 'auto' + the `/admin-api` dev proxy below (same pattern as
// packages/manager/vite.config.ts) means every viewer's request lands back on whichever origin
// they're actually looking at, same-origin, no CORS needed at all.
export default defineConfig(() => {
    const apiTarget = process.env.VITE_API_TARGET ?? 'http://localhost:3000';

    return {
        // Vite's default cacheDir (node_modules/.vite) is per-package, not per dev-server
        // instance — this package is started twice concurrently on this box under different
        // VITE_PORT/mode (local contour's `make dev` on 5175, staging-integration's `make
        // dev-staging-integration` on 5185, see docs/environments.md). Without this, both
        // processes race on the same optimizeDeps cache directory, corrupting each other's
        // pre-bundled chunks — observed live as "Loading failed for the module" for
        // useExperimentalBundle's chunk files on whichever contour restarted more recently.
        cacheDir: `node_modules/.vite-${process.env.VITE_PORT ?? '5175'}`,
        build: {
            // Vite's default build output dir is `assets/`, which collides with the `/assets`
            // proxy rule below (Vendure's own product-image assetUrlPrefix) — see
            // packages/storefront/vite.config.ts for the full explanation (issue #115).
            assetsDir: '_app',
        },
        server: {
            port: parseInt(process.env.VITE_PORT ?? '5175'),
            host: '0.0.0.0',
            allowedHosts: true as const,
            proxy: {
                '/admin-api': {
                    target: apiTarget,
                    changeOrigin: true,
                },
                '/assets': {
                    target: apiTarget,
                    changeOrigin: true,
                },
            },
        },
        plugins: [
            vendureDashboardPlugin({
                vendureConfigPath: resolve(__dirname, '../../apps/server/src/vendure-config.ts'),
                api: {
                    host: 'auto',
                    port: 'auto',
                    adminApiPath: 'admin-api',
                    tokenMethod: 'bearer',
                },
                gqlOutputPath: resolve(__dirname, './gql'),
                // Default dev mode ships ~3000 unbundled ES module requests per page load —
                // fine over localhost, but over the real internet (this app is reachable
                // externally via nginx, see docs/environments.md) it's slow enough that some
                // requests outright fail (net::ERR_FAILED) and the page never finishes loading.
                // This pre-bundles the dashboard into ~40 chunks instead (still marked
                // experimental upstream, but exactly the documented fix for this).
                useExperimentalBundle: true,
            }),
        ],
    };
});
