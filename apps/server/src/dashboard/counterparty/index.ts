import { defineDashboardExtension } from '@vendure/dashboard';

import { CounterpartyListPage } from './counterparty-list-page.js';
import { CounterpartyDetailPage } from './counterparty-detail-page.js';

// See ../system-health/index.ts's own doc comment for why this file sits under
// apps/server/src instead of a packages/plugins/* package (pnpm-workspace-symlink
// dashboard-discovery limitation).
//
// Issue #133 Phase 2 — read-only Dashboard Counterparty list/detail pages under the native
// `customers` section, next to the built-in Customers(100)/Customer Groups(200) items (see
// @vendure/dashboard's own defaults.ts for that section's order range). Gated on
// CustomPermission.ReadCounterparty — the same permission already gating the underlying
// `counterparties`/`counterparty` queries in counterparty.resolver.ts, held today only by
// SuperAdmin (same "SuperAdmin-only for now" convention as Organizations/Branches/ERP users —
// see issue #133's own note to verify this at implementation time rather than assume a new
// permission is needed).
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
