import { PluginCommonModule, VendurePlugin } from '@vendure/core';

// Mirrors system-health-dashboard.plugin.ts exactly (see its own comment, and
// src/dashboard/system-health/index.ts's, for why this lives here rather than under
// packages/plugins/* — a pnpm-workspace-symlinked package's dashboard extension is never
// discovered by @vendure/dashboard's static plugin-discovery step).
@VendurePlugin({
    imports: [PluginCommonModule],
    dashboard: './dashboard/default-superadmin-account/index.ts',
    compatibility: '^3.0.0',
})
export class DefaultSuperadminAlertDashboardPlugin {}
