import { PluginCommonModule, VendurePlugin } from '@vendure/core';

// Must stay identical to system-health-dashboard.plugin.ts; it contains no logic of its own.
// Its only job is pointing @vendure/dashboard at the index that registers this route.
@VendurePlugin({
    imports: [PluginCommonModule],
    dashboard: './dashboard/erp-reconciliation/index.ts',
    compatibility: '^3.0.0',
})
export class ErpReconciliationDashboardPlugin {}
