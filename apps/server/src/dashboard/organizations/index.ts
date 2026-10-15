import { defineDashboardExtension } from '@vendure/dashboard';

import { OrganizationsPage } from './organizations-page';

// Under apps/server/src, not packages/plugins/*: pnpm workspace symlinks block dashboard discovery.
// Plain data list, not a health signal, so it intentionally raises no alert.
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
