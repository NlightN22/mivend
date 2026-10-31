import { defineDashboardExtension } from '@vendure/dashboard';

import { ConsistencyReportsPage } from './consistency-reports-page.js';
import { SourcesPanel } from './sources-panel.js';

// Not under packages/plugins/*: pnpm workspace symlinks break dashboard discovery.
// Gated like the backend queries (ManageErpIntegration); read-only, no actions.
defineDashboardExtension({
    routes: [
        {
            path: '/consistency-reports',
            component: route => ConsistencyReportsPage({ route }),
            navMenuItem: {
                sectionId: 'system',
                id: 'consistency-reports',
                title: 'Data drift reports',
                url: '/consistency-reports',
                requiresPermission: 'ManageErpIntegration',
            },
        },
    ],
    pageBlocks: [
        {
            id: 'consistency-sources',
            location: {
                pageId: 'consistency-report-list',
                position: { blockId: 'list-table', order: 'before' },
                column: 'full',
            },
            component: () => SourcesPanel(),
        },
    ],
});
