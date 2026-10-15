import { PluginCommonModule, VendurePlugin } from '@vendure/core';

// Must mirror system-health-dashboard.plugin.ts exactly, so keep it logic-free.
@VendurePlugin({
    imports: [PluginCommonModule],
    dashboard: './dashboard/integration-health/index.ts',
    compatibility: '^3.0.0',
})
export class IntegrationHealthDashboardPlugin {}
