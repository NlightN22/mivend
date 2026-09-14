import { PluginCommonModule, VendurePlugin } from '@vendure/core';

// Mirrors system-health-dashboard.plugin.ts exactly (see its own comment) — a tiny, logic-free
// plugin whose only job is pointing @vendure/dashboard at src/dashboard/integration-health/
// index.ts, which registers the alert and the /integration-health route (issue #91) — Kafka lag
// and inbox backlog together, as two sections of one page.
@VendurePlugin({
    imports: [PluginCommonModule],
    dashboard: './dashboard/integration-health/index.ts',
    compatibility: '^3.0.0',
})
export class IntegrationHealthDashboardPlugin {}
