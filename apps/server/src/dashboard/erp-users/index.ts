import { defineDashboardExtension } from '@vendure/dashboard';

import { DeactivatedAdministratorsPage } from './deactivated-administrators-page.js';
import { PendingErpUsersPage } from './pending-erp-users-page.js';

// Under apps/server/src, not packages/plugins/*: pnpm workspace symlinks break dashboard discovery.
// Two routes, not tabs: each ListPage renders its own page shell, so two lists can't share one.
defineDashboardExtension({
    routes: [
        {
            path: '/deactivated-administrators',
            component: route => DeactivatedAdministratorsPage({ route }),
            navMenuItem: {
                sectionId: 'settings',
                id: 'deactivated-administrators',
                title: 'Deactivated administrators',
                url: '/deactivated-administrators',
                order: 410,
                requiresPermission: 'ManageAdministratorLifecycle',
            },
        },
        {
            path: '/pending-erp-users',
            component: route => PendingErpUsersPage({ route }),
            navMenuItem: {
                sectionId: 'settings',
                id: 'pending-erp-users',
                title: 'Pending ERP users',
                url: '/pending-erp-users',
                order: 420,
                requiresPermission: 'ManageAdministratorLifecycle',
            },
        },
    ],
});
