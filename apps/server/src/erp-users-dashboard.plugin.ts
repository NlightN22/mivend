import { PluginCommonModule, VendurePlugin } from '@vendure/core';

// Must mirror system-health-dashboard.plugin.ts exactly; keep this plugin logic-free.
// Only points @vendure/dashboard at src/dashboard/erp-users/index.ts, which registers routes.
@VendurePlugin({
    imports: [PluginCommonModule],
    dashboard: './dashboard/erp-users/index.ts',
    compatibility: '^3.0.0',
})
export class ErpUsersDashboardPlugin {}
