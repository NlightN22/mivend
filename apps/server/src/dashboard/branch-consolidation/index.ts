import {
    DashboardAlertDefinition,
    api,
    defineDashboardExtension,
    graphql,
} from '@vendure/dashboard';

import { BranchesPage } from './branches-page';

// Not in packages/plugins/*: pnpm workspace symlinks break dashboard discovery.
// No Branch rows = every warehouse event silently skipped; only a Logger.warn, nothing queryable.
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
                // Branch gates warehouse-event processing, so it sits near the top of settings.
                // Order 150 keeps it between Vendure's native Sellers (100) and Channels (200).
                sectionId: 'settings',
                id: 'branches',
                title: 'Branches',
                url: '/branches',
                order: 150,
            },
        },
    ],
});
