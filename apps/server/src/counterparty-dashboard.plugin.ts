import { PluginCommonModule, VendurePlugin } from '@vendure/core';

// Mirrors organizations-dashboard.plugin.ts exactly (see its own comment) — a tiny, logic-free
// plugin whose only job is pointing @vendure/dashboard at src/dashboard/counterparty/index.ts,
// which registers the /counterparty-erp list+detail routes (issue #133 Phase 2).
@VendurePlugin({
    imports: [PluginCommonModule],
    dashboard: './dashboard/counterparty/index.ts',
    compatibility: '^3.0.0',
})
export class CounterpartyDashboardPlugin {}
