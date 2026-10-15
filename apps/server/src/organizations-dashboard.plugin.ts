import { PluginCommonModule, VendurePlugin } from '@vendure/core';

// Must mirror system-health-dashboard.plugin.ts exactly; keep the two files in sync.
// Logic-free: exists only so @vendure/dashboard loads src/dashboard/organizations/index.ts.
@VendurePlugin({
    imports: [PluginCommonModule],
    dashboard: './dashboard/organizations/index.ts',
    compatibility: '^3.0.0',
})
export class OrganizationsDashboardPlugin {}
