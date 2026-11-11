import { defineDashboardExtension } from '@vendure/dashboard';

import { LegalNameAbbreviationsPage } from './legal-name-abbreviations-page.js';

// Under apps/server/src, not packages/plugins/*: pnpm workspace symlinks break dashboard discovery.
// Gated on the native ReadSettings permission, same as the legalNameAbbreviations query.
defineDashboardExtension({
    routes: [
        {
            path: '/legal-name-abbreviations',
            component: route => LegalNameAbbreviationsPage({ route }),
            navMenuItem: {
                sectionId: 'settings',
                id: 'legal-name-abbreviations',
                title: 'Legal name abbreviations',
                url: '/legal-name-abbreviations',
                order: 360,
                requiresPermission: 'ReadSettings',
            },
        },
    ],
});
