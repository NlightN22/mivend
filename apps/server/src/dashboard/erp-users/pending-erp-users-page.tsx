import { AnyRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { api, Button, graphql, ListPage, toast } from '@vendure/dashboard';

// Issue #119 Phase 1 — "Pending" section of the "ERP users" Dashboard surface: 1C users
// (UserChanged) not yet linked to any Administrator (ErpUserService's own candidate list,
// filtered to status: 'unlinked' — see its own doc comment), awaiting a human decision to
// create a real login for them. Built on ListPage per
// dashboard-extension-rules — a hand-rolled table/fetch loop here (like the pre-existing
// branches-page.tsx/erp-reconciliation-page.tsx) is exactly what that rule now forbids for a
// new page.
const pendingErpUsersListDocument = graphql(`
    query PendingErpUsersForDashboard($options: ErpUserListOptions) {
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

// erpId -> Department.name, for the departmentId column below — the raw erpId alone means
// nothing to a human reviewing this list. Same resolution the manager-portal's own Settings >
// Users > Pending tab already does (UsersPage.vue's departmentName()); this page had no
// equivalent (a real, reported gap — the column just showed the raw id).
const departmentsDocument = graphql(`
    query DepartmentsForErpUsersDashboard {
        departments {
            erpId
            name
        }
    }
`);

export function PendingErpUsersPage({ route }: { route: AnyRoute }) {
    const refreshRef = useRef<() => void>(() => {});
    const [departmentNames, setDepartmentNames] = useState<Record<string, string>>({});

    useEffect(() => {
        void api.query(departmentsDocument).then(data => {
            setDepartmentNames(
                Object.fromEntries(data.departments.map(d => [d.erpId, d.name])),
            );
        });
    }, []);

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
            customizeColumns={{
                // Overrides the auto-generated "Department Id" column in place — additionalColumns
                // would add a second, duplicate-keyed column instead (real incident: shipped that
                // way first, React warned "two children with the same key, `departmentId`" and the
                // page rendered both the raw id and the resolved name as separate columns).
                departmentId: {
                    header: 'Department',
                    cell: ({ row }) =>
                        row.original.departmentId
                            ? (departmentNames[row.original.departmentId] ?? row.original.departmentId)
                            : '—',
                },
            }}
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
