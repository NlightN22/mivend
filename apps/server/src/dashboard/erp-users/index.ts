import { defineDashboardExtension } from '@vendure/dashboard';

import { DeactivatedAdministratorsPage } from './deactivated-administrators-page.js';
import { PendingErpUsersPage } from './pending-erp-users-page.js';

// See ../system-health/index.ts's own doc comment for why this file sits under
// apps/server/src instead of a packages/plugins/* package (pnpm-workspace-symlink
// dashboard-discovery limitation).
//
// Issue #119 Phase 1 — two routes rather than tabs on one page (left open by the issue itself,
// "decide during implementation"): ListPage renders a full Page/PageTitle/PageActionBar/
// PageLayout shell per instance, so combining two independently-paginated ListPage lists under
// one page would fight that shell rather than reuse it. Both nav items sit in "settings" next to
// the native Administrators screen they complement.
// Native Administrators sits at order: 400, Roles at order: 500 (@vendure/dashboard's own
// src/lib/framework/defaults.ts) — 410/420 places these two directly between them:
// Administrators, Deactivated administrators, Pending ERP users, Roles.
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
