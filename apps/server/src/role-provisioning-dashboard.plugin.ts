import { PluginCommonModule, VendurePlugin } from '@vendure/core';

// Keep this file logic-free: it exists only to point @vendure/dashboard at the alert registration entry.
@VendurePlugin({
    imports: [PluginCommonModule],
    dashboard: './dashboard/role-provisioning/index.ts',
    compatibility: '^3.0.0',
})
export class RoleProvisioningDashboardPlugin {}
