import { defineConfig } from 'vite';
import { vendureDashboardPlugin } from '@vendure/dashboard/vite';
import { resolve } from 'node:path';

// api.host/api.port 'auto' derives the admin-api origin from window.location at runtime;
// a baked-in literal host breaks external viewers; the /admin-api proxy keeps requests same-origin.
export default defineConfig(() => {
    const apiTarget = process.env.VITE_API_TARGET ?? 'http://localhost:3000';

    return {
        // Default cacheDir is per-package, but two dev servers run concurrently on this box;
        // their optimizeDeps pre-bundles race and corrupt each other unless each gets its own cacheDir.
        cacheDir: `node_modules/.vite-${process.env.VITE_PORT ?? '5175'}`,
        build: {
            // Default build outDir `assets/` collides with the `/assets` proxy rule (Vendure product images).
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
                // Unbundled dev mode sends ~3000 ES module requests per load; over the public internet some fail
                // (net::ERR_FAILED) and the page never loads, so the dashboard is pre-bundled into chunks.
                useExperimentalBundle: true,
            }),
        ],
    };
});
