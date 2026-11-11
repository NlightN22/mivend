import { PluginCommonModule, VendurePlugin } from '@vendure/core';

// Logic-free: exists only so @vendure/dashboard loads src/dashboard/notification-settings/index.ts.
@VendurePlugin({
    imports: [PluginCommonModule],
    dashboard: './dashboard/notification-settings/index.ts',
    compatibility: '^3.0.0',
})
export class NotificationSettingsDashboardPlugin {}
