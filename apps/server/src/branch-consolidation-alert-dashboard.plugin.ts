import { PluginCommonModule, VendurePlugin } from '@vendure/core';

// Must stay identical to system-health-dashboard.plugin.ts; edit both together.
@VendurePlugin({
    imports: [PluginCommonModule],
    dashboard: './dashboard/branch-consolidation/index.ts',
    compatibility: '^3.0.0',
})
export class BranchConsolidationAlertDashboardPlugin {}
