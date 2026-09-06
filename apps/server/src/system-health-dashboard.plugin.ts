import { PluginCommonModule, VendurePlugin } from '@vendure/core';

// Issue #76 follow-up (see vendure-config.ts's registration comment for why this lives here,
// not under packages/plugins/*): a tiny, logic-free plugin whose only job is pointing
// @vendure/dashboard at src/dashboard/system-health/index.ts, which registers the alert.
@VendurePlugin({
    imports: [PluginCommonModule],
    dashboard: './dashboard/system-health/index.ts',
    compatibility: '^3.0.0',
})
export class SystemHealthDashboardPlugin {}
