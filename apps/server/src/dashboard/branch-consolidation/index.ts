import {
    DashboardAlertDefinition,
    api,
    defineDashboardExtension,
    graphql,
} from '@vendure/dashboard';

import { BranchesPage } from './branches-page';

// See ../system-health/index.ts's own doc comment for why this file sits under
// apps/server/src instead of a packages/plugins/* package (pnpm-workspace-symlink
// dashboard-discovery limitation).
//
// Real gap this surfaces (issue #80 follow-up): `Branch` (packages/plugins/access-control) has
// no rows until either erp-import's REST full sync runs (never happens on a Kafka-only contour)
// or staff use the manager portal's new "Add branch" panel (BranchSettingsPage.vue) — until
// then, WarehouseStreamHandler silently skips every incoming warehouse event with no
// queryable/persisted trace of the skip (only a Logger.warn), so a genuinely useful alert can't
// count "how many warehouses are stuck" — only "is the one precondition (at least one Branch
// exists) even met yet."
const branchCountDocument = graphql(`
    query BranchCountForConsolidationAlert {
        branches {
            id
        }
    }
`);

export const branchConsolidationAlert: DashboardAlertDefinition<number> = {
    id: 'branch-consolidation-empty',
    check: async () => {
        try {
            const data = await api.query(branchCountDocument);
            return data.branches?.length ?? 0;
        } catch {
            // A transient network error must not crash the dashboard shell — fail closed to
            // "nothing to report", same guard as system-health's/default-superadmin's own check().
            return -1;
        }
    },
    shouldShow: branchCount => branchCount === 0,
    severity: 'warning',
    title: 'No branches defined yet',
    description:
        'No warehouse can be assigned to a branch until at least one branch exists. ' +
        'Add one in the manager portal — this is a mivend-only grouping, independent of any ' +
        'ERP data, so it never depends on an ERP sync having run.',
    actions: [
        {
            label: 'Add a branch',
            onClick: ({ dismiss }) => {
                dismiss();
                // /branches is this same extension's own route (registered below) — a real
                // in-app navigation, same origin, no port-guessing needed.
                window.location.href = '/branches';
            },
        },
    ],
    recheckInterval: 60_000,
};

defineDashboardExtension({
    alerts: [branchConsolidationAlert],
    routes: [
        {
            path: '/branches',
            component: BranchesPage,
            navMenuItem: {
                sectionId: 'system',
                id: 'branches',
                title: 'Branches',
                url: '/branches',
            },
        },
    ],
});
