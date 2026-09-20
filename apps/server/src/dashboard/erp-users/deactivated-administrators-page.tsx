import { AnyRoute } from '@tanstack/react-router';
import { useRef } from 'react';
import { api, Button, graphql, ListPage } from '@vendure/dashboard';
import { toast } from 'sonner';

// Issue #119 Phase 1 — "Deactivated" section of the "ERP users" Dashboard surface. Structurally
// unreachable from the native Administrators page: AdministratorService.findAll/findOne
// hard-filter `deletedAt IS NULL` in @vendure/core itself, so a soft-deleted Administrator
// disappears from that list and its detail route 404s — see
// AdministratorActivationService.findDeactivated's own comment. Reuses the native
// AdministratorList/AdministratorListOptions types (backend-plugin-rules skill's mandatory
// pattern for a query returning an existing entity's paginated list).
const deactivatedAdministratorsListDocument = graphql(`
    query DeactivatedAdministratorsForDashboard($options: AdministratorListOptions) {
        deactivatedAdministrators(options: $options) {
            items {
                id
                firstName
                lastName
                emailAddress
            }
            totalItems
        }
    }
`);

const setAdministratorActiveDocument = graphql(`
    mutation ReactivateAdministratorFromDashboard($administratorId: ID!) {
        setAdministratorActive(administratorId: $administratorId, isActive: true)
    }
`);

export function DeactivatedAdministratorsPage({ route }: { route: AnyRoute }) {
    const refreshRef = useRef<() => void>(() => {});

    async function handleReactivate(administratorId: string, label: string): Promise<void> {
        try {
            await api.mutate(setAdministratorActiveDocument, { administratorId });
            toast.success(`${label} reactivated.`);
            refreshRef.current();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not reactivate Administrator');
        }
    }

    return (
        <ListPage
            pageId="deactivated-administrators-list"
            title="Deactivated administrators"
            listQuery={deactivatedAdministratorsListDocument}
            route={route}
            onSearchTermChange={searchTerm =>
                searchTerm
                    ? {
                          firstName: { contains: searchTerm },
                          lastName: { contains: searchTerm },
                          emailAddress: { contains: searchTerm },
                      }
                    : {}
            }
            transformVariables={variables => ({
                options: { ...variables.options, filterOperator: 'OR' },
            })}
            defaultVisibility={{ emailAddress: true, name: true, actions: true }}
            defaultColumnOrder={['name', 'emailAddress', 'actions']}
            additionalColumns={{
                name: {
                    meta: { dependencies: ['id', 'firstName', 'lastName'] },
                    header: 'Name',
                    cell: ({ row }) => `${row.original.firstName} ${row.original.lastName}`,
                },
                actions: {
                    meta: { dependencies: ['id', 'firstName', 'lastName'] },
                    header: 'Actions',
                    cell: ({ row }) => (
                        <Button
                            size="sm"
                            onClick={() =>
                                void handleReactivate(
                                    row.original.id,
                                    `${row.original.firstName} ${row.original.lastName}`,
                                )
                            }
                        >
                            Reactivate
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
