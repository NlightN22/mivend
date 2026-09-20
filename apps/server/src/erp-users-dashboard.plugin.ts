import { PluginCommonModule, VendurePlugin } from '@vendure/core';

// Mirrors system-health-dashboard.plugin.ts exactly (see its own comment) — a tiny, logic-free
// plugin whose only job is pointing @vendure/dashboard at src/dashboard/erp-users/index.ts,
// which registers the /pending-erp-users and /deactivated-administrators routes (issue #119
// Phase 1).
@VendurePlugin({
    imports: [PluginCommonModule],
    dashboard: './dashboard/erp-users/index.ts',
    compatibility: '^3.0.0',
})
export class ErpUsersDashboardPlugin {}
