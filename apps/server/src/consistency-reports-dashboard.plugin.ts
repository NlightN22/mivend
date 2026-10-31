import { PluginCommonModule, VendurePlugin } from '@vendure/core';

// Must mirror erp-reconciliation-dashboard.plugin.ts exactly; keep this plugin logic-free.
@VendurePlugin({
    imports: [PluginCommonModule],
    dashboard: './dashboard/consistency-reports/index.ts',
    compatibility: '^3.0.0',
})
export class ConsistencyReportsDashboardPlugin {}
