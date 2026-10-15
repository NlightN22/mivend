import { defineDashboardExtension } from '@vendure/dashboard';

import { ErpReconciliationPage } from './erp-reconciliation-page.js';

// Not under packages/plugins/*: pnpm workspace symlinks break dashboard discovery.
// Gets its own nav item and route, not a third section on the integration-health page.
defineDashboardExtension({
    routes: [
        {
            path: '/erp-reconciliation',
            component: ErpReconciliationPage,
            navMenuItem: {
                sectionId: 'system',
                id: 'erp-reconciliation',
                title: 'ERP reconciliation',
                url: '/erp-reconciliation',
            },
        },
    ],
});
