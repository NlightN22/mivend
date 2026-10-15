import { PluginCommonModule, VendurePlugin } from '@vendure/core';

// Must mirror organizations-dashboard.plugin.ts exactly; keep this plugin logic-free.
// Its only job is pointing @vendure/dashboard at src/dashboard/counterparty/index.ts.
@VendurePlugin({
    imports: [PluginCommonModule],
    dashboard: './dashboard/counterparty/index.ts',
    compatibility: '^3.0.0',
})
export class CounterpartyDashboardPlugin {}
