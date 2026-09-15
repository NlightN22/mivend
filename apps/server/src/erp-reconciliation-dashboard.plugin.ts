import { PluginCommonModule, VendurePlugin } from '@vendure/core';

// Mirrors system-health-dashboard.plugin.ts exactly (see its own comment) — a tiny, logic-free
// plugin whose only job is pointing @vendure/dashboard at src/dashboard/erp-reconciliation/
// index.ts, which registers the /erp-reconciliation route (issue #97) — its own page rather than
// a third section on integration-health, per that issue's own correction.
@VendurePlugin({
    imports: [PluginCommonModule],
    dashboard: './dashboard/erp-reconciliation/index.ts',
    compatibility: '^3.0.0',
})
export class ErpReconciliationDashboardPlugin {}
