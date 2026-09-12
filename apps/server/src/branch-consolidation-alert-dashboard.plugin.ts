import { PluginCommonModule, VendurePlugin } from '@vendure/core';

// Mirrors system-health-dashboard.plugin.ts exactly (see its own comment) — a tiny, logic-free
// plugin whose only job is pointing @vendure/dashboard at
// src/dashboard/branch-consolidation/index.ts, which registers the alert.
@VendurePlugin({
    imports: [PluginCommonModule],
    dashboard: './dashboard/branch-consolidation/index.ts',
    compatibility: '^3.0.0',
})
export class BranchConsolidationAlertDashboardPlugin {}
