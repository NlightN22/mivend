import { PluginCommonModule, VendurePlugin } from '@vendure/core';

// Same shape/reasoning as system-health-dashboard.plugin.ts (issue #134 Part 2) — a tiny,
// logic-free plugin whose only job is pointing @vendure/dashboard at
// src/dashboard/role-provisioning/index.ts, which registers the alert.
@VendurePlugin({
    imports: [PluginCommonModule],
    dashboard: './dashboard/role-provisioning/index.ts',
    compatibility: '^3.0.0',
})
export class RoleProvisioningDashboardPlugin {}
