import { AnyRoute } from '@tanstack/react-router';
import { useRef } from 'react';
import { api, Button, graphql, ListPage } from '@vendure/dashboard';
import { toast } from 'sonner';

// Issue #119 Phase 1 — "Pending" section of the "ERP users" Dashboard surface: 1C users
// (UserChanged) not yet linked to any Administrator (PendingErpUserService's own candidate
// list), awaiting a human decision to create a real login for them. Built on ListPage per
// dashboard-extension-rules — a hand-rolled table/fetch loop here (like the pre-existing
// branches-page.tsx/erp-reconciliation-page.tsx) is exactly what that rule now forbids for a
// new page.
const pendingErpUsersListDocument = graphql(`
    query PendingErpUsersForDashboard($options: PendingErpUserListOptions) {
        pendingErpUsers(options: $options) {
            items {
                id
                erpId
                fullName
                email
                departmentId
                firstSeenAt
            }
            totalItems
        }
    }
`);

const createAdministratorFromErpUserDocument = graphql(`
    mutation CreateAdministratorFromErpUserFromDashboard($erpId: String!) {
        createAdministratorFromErpUser(erpId: $erpId) {
            id
            emailAddress
        }
    }
`);

export function PendingErpUsersPage({ route }: { route: AnyRoute }) {
    const refreshRef = useRef<() => void>(() => {});

    async function handleCreate(erpId: string, label: string): Promise<void> {
        try {
            const result = await api.mutate(createAdministratorFromErpUserDocument, { erpId });
            toast.success(
                `Administrator created for ${label} (${result.createAdministratorFromErpUser.emailAddress}) — a password-reset link was emailed.`,
            );
            refreshRef.current();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not create Administrator');
        }
    }

    return (
        <ListPage
            pageId="pending-erp-users-list"
            title="Pending ERP users"
            listQuery={pendingErpUsersListDocument}
            route={route}
            onSearchTermChange={searchTerm =>
                searchTerm
                    ? {
                          fullName: { contains: searchTerm },
                          email: { contains: searchTerm },
                          erpId: { contains: searchTerm },
                      }
                    : {}
            }
            transformVariables={variables => ({
                options: { ...variables.options, filterOperator: 'OR' },
            })}
            defaultSort={[{ id: 'firstSeenAt', desc: false }]}
            defaultVisibility={{
                fullName: true,
                email: true,
                erpId: true,
                departmentId: true,
                firstSeenAt: true,
                actions: true,
            }}
            defaultColumnOrder={['fullName', 'email', 'erpId', 'departmentId', 'firstSeenAt', 'actions']}
            additionalColumns={{
                actions: {
                    meta: { dependencies: ['erpId', 'fullName', 'email'] },
                    header: 'Actions',
                    cell: ({ row }) => (
                        <Button
                            size="sm"
                            onClick={() =>
                                void handleCreate(
                                    row.original.erpId,
                                    row.original.fullName ?? row.original.email ?? row.original.erpId,
                                )
                            }
                        >
                            Create Administrator
                        </Button>
                    ),
                },
            }}
            registerRefresher={refresher => {
                refreshRef.current = refresher;
            }}
            includeSelectionColumn={false}
        />
    );
}
