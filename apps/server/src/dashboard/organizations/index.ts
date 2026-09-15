import { defineDashboardExtension } from '@vendure/dashboard';

import { OrganizationsPage } from './organizations-page';

// See ../branch-consolidation/index.ts's own comment for why this file sits under
// apps/server/src instead of a packages/plugins/* package (pnpm-workspace-symlink
// dashboard-discovery limitation).
//
// Companion to packages/manager's Settings → Organizations page (issue #88 part 2, commit
// 3894048) — this is the native Vendure Dashboard's own read-only view of the same
// `organizationRequisites` query. No alert: unlike system-health/branch-consolidation/
// integration-health, this is a plain data list, not a health/consolidation gap signal.
defineDashboardExtension({
    routes: [
        {
            path: '/organizations',
            component: OrganizationsPage,
            navMenuItem: {
                sectionId: 'settings',
                id: 'organizations',
                title: 'Organizations',
                url: '/organizations',
                // Between the native "Stock locations" (300) and "Administrators" (400) items —
                // see @vendure/dashboard's own defaults.ts for that section's full order range.
                order: 350,
            },
        },
    ],
});
