import {
    DashboardAlertDefinition,
    api,
    defineDashboardExtension,
    graphql,
} from '@vendure/dashboard';

// Lives under apps/server/src, not packages/plugins/*: pnpm symlinks break dashboard discovery.
// First login on a fresh instance: superadmin/superadmin is shared by every env, so warn here too.
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
