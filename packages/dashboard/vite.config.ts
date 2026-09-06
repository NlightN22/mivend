import { defineConfig } from 'vite';
import { vendureDashboardPlugin } from '@vendure/dashboard/vite';
import { resolve } from 'node:path';

// Issue #77: the Dashboard is deployed as a fully standalone Vite app (not mounted on the
// server via DashboardPlugin.init()), same shape as packages/storefront and packages/manager.
// It calls admin-api directly (cross-origin, see apps/server/src/vendure-config.ts's `cors`
// option) rather than through a same-origin dev proxy, since vendureDashboardPlugin's
// `api.host`/`api.port` bake the target server directly into the served app.
// See packages/storefront/vite.config.ts for why these come from plain env vars rather than a
// hardcoded default or Vite's own `.env.<mode>` files.
export default defineConfig(() => {
    const apiTarget = new URL(process.env.VITE_API_TARGET ?? 'http://localhost:3000');

    return {
        server: {
            port: parseInt(process.env.VITE_PORT ?? '5175'),
            host: '0.0.0.0',
            allowedHosts: true as const,
        },
        plugins: [
            vendureDashboardPlugin({
                vendureConfigPath: resolve(__dirname, '../../apps/server/src/vendure-config.ts'),
                api: {
                    // `api.host` is used verbatim as `scheme://host` by the dashboard runtime
                    // when not 'auto' (see @vendure/dashboard's use-job-queue-polling chunk) —
                    // a bare hostname here breaks every admin-api fetch with
                    // "URL scheme 'localhost' is not supported".
                    host: `${apiTarget.protocol}//${apiTarget.hostname}`,
                    port: Number(apiTarget.port) || undefined,
                    adminApiPath: 'admin-api',
                    tokenMethod: 'bearer',
                },
                gqlOutputPath: resolve(__dirname, './gql'),
            }),
        ],
    };
});
