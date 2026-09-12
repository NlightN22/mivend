import {
    DashboardAlertDefinition,
    api,
    defineDashboardExtension,
    graphql,
} from '@vendure/dashboard';

// See ../system-health/index.ts's own doc comment for why this file lives directly under
// apps/server/src rather than in a packages/plugins/* package (the same pnpm-workspace-symlink
// dashboard-discovery limitation applies here) — mirrors that same shape exactly.
//
// Native @vendure/dashboard counterpart of the manager portal's own warning (packages/manager's
// DefaultLayout.vue/auth.ts isDefaultSuperadminAccount) — every contour ships with only one
// administrator (superadmin/superadmin, SUPERADMIN_USERNAME/PASSWORD, identical literal value in
// every apps/server/.env.* file), and this is the very first login on a fresh instance (before
// any manager-portal account exists), so the native dashboard needs its own copy of the same
// warning rather than relying on the manager portal ever being visited at all.
const activeAdministratorIdentifierDocument = graphql(`
    query ActiveAdministratorIdentifierForDefaultAccountAlert {
        activeAdministrator {
            id
            user {
                identifier
            }
        }
    }
`);

const DEFAULT_SUPERADMIN_IDENTIFIER = 'superadmin';

export const defaultSuperadminAccountAlert: DashboardAlertDefinition<string | null> = {
    id: 'default-superadmin-account',
    check: async () => {
        try {
            const data = await api.query(activeAdministratorIdentifierDocument);
            return data.activeAdministrator?.user.identifier ?? null;
        } catch {
            // A transient network error must not crash the dashboard shell — fail closed to
            // "nothing to report", same guard as system-health's own check().
            return null;
        }
    },
    shouldShow: identifier => identifier === DEFAULT_SUPERADMIN_IDENTIFIER,
    severity: 'warning',
    title: 'Default superadmin account in use',
    description:
        "You're signed in with the default superadmin account and its default password — change it now.",
    actions: [
        {
            label: 'Change password',
            onClick: ({ dismiss }) => {
                dismiss();
                window.location.href = '/profile';
            },
        },
    ],
    recheckInterval: 60_000,
};

defineDashboardExtension({
    alerts: [defaultSuperadminAccountAlert],
});
