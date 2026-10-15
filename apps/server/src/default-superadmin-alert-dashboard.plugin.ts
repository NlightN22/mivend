import { PluginCommonModule, VendurePlugin } from '@vendure/core';

// Must stay identical to system-health-dashboard.plugin.ts; edit both together.
// Not under packages/plugins/*: @vendure/dashboard's static discovery skips pnpm-symlinked packages.
@VendurePlugin({
    imports: [PluginCommonModule],
    dashboard: './dashboard/default-superadmin-account/index.ts',
    compatibility: '^3.0.0',
})
export class DefaultSuperadminAlertDashboardPlugin {}
