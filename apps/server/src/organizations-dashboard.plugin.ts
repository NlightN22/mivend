import { PluginCommonModule, VendurePlugin } from '@vendure/core';

// Mirrors system-health-dashboard.plugin.ts exactly (see its own comment) — a tiny, logic-free
// plugin whose only job is pointing @vendure/dashboard at src/dashboard/organizations/index.ts,
// which registers the /organizations route (issue #88 part 2 continuation).
@VendurePlugin({
    imports: [PluginCommonModule],
    dashboard: './dashboard/organizations/index.ts',
    compatibility: '^3.0.0',
})
export class OrganizationsDashboardPlugin {}
