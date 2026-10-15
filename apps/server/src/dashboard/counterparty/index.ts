import { defineDashboardExtension } from '@vendure/dashboard';

import { CounterpartyListPage } from './counterparty-list-page.js';
import { CounterpartyDetailPage } from './counterparty-detail-page.js';

// Under apps/server/src, not packages/plugins/*: pnpm workspace symlinks break dashboard discovery.
// Gated on CustomPermission.ReadCounterparty, same as the counterparty queries; no new permission.
defineDashboardExtension({
    routes: [
        {
            path: '/counterparty-erp',
            component: route => CounterpartyListPage({ route }),
            navMenuItem: {
                sectionId: 'customers',
                id: 'counterparty-erp',
                title: 'Counterparty ERP',
                url: '/counterparty-erp',
                // Between native "Customers" (100) and "Customer Groups" (200, @vendure/
                // dashboard's own defaults.ts) — near the top of the section, not appended.
                order: 150,
                requiresPermission: 'ReadCounterparty',
            },
        },
        {
            path: '/counterparty-erp/$id',
            component: route => CounterpartyDetailPage({ route }),
            authenticated: true,
        },
    ],
});
