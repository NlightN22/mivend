import { defineDashboardExtension } from '@vendure/dashboard';

import { NotificationRetentionPage } from './notification-retention-page.js';

// Under apps/server/src, not packages/plugins/*: pnpm workspace symlinks break dashboard discovery.
// Gated on the native ReadSettings permission, same as the notificationRetentionRules query.
defineDashboardExtension({
    routes: [
        {
            path: '/notification-retention',
            component: route => NotificationRetentionPage({ route }),
            navMenuItem: {
                sectionId: 'settings',
                id: 'notification-retention',
                title: 'Notification retention',
                url: '/notification-retention',
                order: 370,
                requiresPermission: 'ReadSettings',
            },
        },
    ],
});
