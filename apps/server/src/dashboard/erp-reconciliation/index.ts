import { defineDashboardExtension } from '@vendure/dashboard';

import { ErpReconciliationPage } from './erp-reconciliation-page.js';

// See ../system-health/index.ts's own doc comment for why this file sits under
// apps/server/src instead of a packages/plugins/* package (pnpm-workspace-symlink
// dashboard-discovery limitation). Its own nav MenuItem/route rather than a third section on
// integration-health's page — see erp-reconciliation-page.tsx's own comment for why (issue #97).
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
