import { PluginCommonModule, VendurePlugin } from '@vendure/core';

// Kept outside packages/plugins/*: vendure-config.ts registers it by this path.
// Keep logic-free: it only points @vendure/dashboard at system-health/index.ts.
@VendurePlugin({
    imports: [PluginCommonModule],
    dashboard: './dashboard/system-health/index.ts',
    compatibility: '^3.0.0',
})
export class SystemHealthDashboardPlugin {}
