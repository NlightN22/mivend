import { PluginCommonModule, VendurePlugin } from '@vendure/core';

// Kept outside packages/plugins/*: vendure-config.ts registers it by this path.
// Keep logic-free: it only points @vendure/dashboard at two-factor-sign-in/index.ts.
@VendurePlugin({
    imports: [PluginCommonModule],
    dashboard: './dashboard/two-factor-sign-in/index.ts',
    compatibility: '^3.0.0',
})
export class TwoFactorSignInDashboardPlugin {}
