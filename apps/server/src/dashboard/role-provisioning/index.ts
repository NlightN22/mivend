import {
    DashboardAlertDefinition,
    api,
    defineDashboardExtension,
    graphql,
} from '@vendure/dashboard';

// See ../system-health/index.ts's own doc comment for why this file sits under apps/server/src
// instead of a packages/plugins/* package (pnpm-workspace-symlink dashboard-discovery
// limitation).
//
// Issue #134 Part 2: defense in depth for RoleProvisioningService's bootstrap-time
// self-provisioning (packages/plugins/access-control/src/role-provisioning.service.ts) — that
// runs the real fix (idempotent upsert on every server boot), this alert only catches the case
// where scope config is deleted/corrupted after boot, or a role is added to DEFAULT_ROLES before
// a running deploy has rebooted to provision it. A separate DashboardAlertDefinition rather than
// a third item type folded into system-health's checklist (../system-health/index.ts) — that one
// is Vendure's own base configuration (zones/tax/shipping/payment), this is mivend's own RBAC
// data; conflating the two "config incomplete" concepts under one alert would misreport which
// system needs attention and to whom (portal-admin/general-director, not necessarily whoever
// manages payment methods).
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
