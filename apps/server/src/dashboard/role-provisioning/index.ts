import {
    DashboardAlertDefinition,
    api,
    defineDashboardExtension,
    graphql,
} from '@vendure/dashboard';

// Lives here, not in packages/plugins/*: pnpm workspace symlinks break dashboard discovery.
// Separate from system-health: RBAC gaps must route to portal-admin, not payment-config owners.
const roleProvisioningStatusDocument = graphql(`
    query RoleAccessScopeProvisioningStatusForAlert {
        roleAccessScopeProvisioningStatus {
            roleCode
            missing
        }
    }
`);

export const roleProvisioningAlert: DashboardAlertDefinition<string[]> = {
    id: 'role-access-scope-provisioning-missing',
    check: async () => {
        try {
            const data = await api.query(roleProvisioningStatusDocument);
            return (data.roleAccessScopeProvisioningStatus ?? [])
                .filter(item => item.missing)
                .map(item => item.roleCode);
        } catch {
            // A viewer lacking ManageAccessControl (or a transient network error) must not
            // crash the dashboard shell — same fail-closed guard as system-health's own check().
            return [];
        }
    },
    shouldShow: missingCodes => (missingCodes?.length ?? 0) > 0,
    severity: 'error',
    title: missingCodes =>
        `${(missingCodes ?? []).length} manager-portal role(s) missing scope configuration`,
    description: missingCodes => (missingCodes ?? []).join(', '),
    recheckInterval: 60_000,
};

defineDashboardExtension({
    alerts: [roleProvisioningAlert],
});
