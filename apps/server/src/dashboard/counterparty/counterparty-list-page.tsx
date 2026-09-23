import { useEffect, useRef, useState } from 'react';
import { api, Badge, DetailPageButton, ListPage } from '@vendure/dashboard';
import { AnyRoute } from '@tanstack/react-router';

import {
    counterpartyListDocument,
    administratorNamesForCounterpartyDocument,
    pendingErpUsersForCounterpartyDocument,
} from './counterparty.graphql.js';
import { formatBranch, formatLinkStatus, formatManager } from './counterparty-display.js';
import { CounterpartyListFilterContext } from './counterparty-list-filter-context.js';
import {
    CounterpartyListFilterInput,
    toCounterpartyListFilter,
} from './counterparty-list-variables.js';
import {
    AssignManagerBulkAction,
    LinkToCustomerBulkAction,
    UnlinkFromCustomerBulkAction,
} from './components/counterparty-bulk-actions.js';

// Manager names resolve client-side against two small lookups (see formatManager), not a field resolver.
export function CounterpartyListPage({ route }: Readonly<{ route: AnyRoute }>) {
    const [administrators, setAdministrators] = useState<
        Array<{ id: string; name: string; erpId: string | null }>
    >([]);
    const [erpUsers, setErpUsers] = useState<Array<{ erpId: string; fullName: string | null }>>([]);
    const filterRef = useRef<CounterpartyListFilterInput>({});

    async function loadAdministrators(): Promise<void> {
        const data = await api.query(administratorNamesForCounterpartyDocument, {
            options: { take: 999 },
        });
        setAdministrators(
            (data.administrators?.items ?? []).map(a => ({
                id: a.id,
                name: `${a.firstName} ${a.lastName}`,
                erpId: a.customFields?.erpId ?? null,
            })),
        );
    }

    async function loadErpUsers(): Promise<void> {
        const data = await api.query(pendingErpUsersForCounterpartyDocument, {
            options: { take: 999 },
        });
        setErpUsers(
            (data.pendingErpUsers?.items ?? []).map(u => ({
                erpId: u.erpId,
                fullName: u.fullName ?? null,
            })),
        );
    }

    // Must stay in useEffect: a bare render-body load caused a 10+ request storm (see dashboard-extension-rules).
    useEffect(() => {
        void loadAdministrators();
        void loadErpUsers();
    }, []);

    return (
        <CounterpartyListFilterContext.Provider value={filterRef}>
            <ListPage
                pageId="counterparty-list"
                title="Counterparty ERP"
                listQuery={counterpartyListDocument}
                route={route}
                // CounterpartyListOptions is bespoke (plain `search`, no `filter`) — reshaped in transformVariables.
                onSearchTermChange={searchTerm => ({ __search: searchTerm }) as any}
                // Facet/search unwrapping lives in counterparty-list-variables.ts; the result is also
                // shared via context so "Assign manager" can target every matching row (#136).
                transformVariables={variables => {
                    filterRef.current = toCounterpartyListFilter(
                        variables.options?.filter as Parameters<typeof toCounterpartyListFilter>[0],
                    );
                    return {
                        options: {
                            take: variables.options?.take,
                            skip: variables.options?.skip,
                            ...filterRef.current,
                        },
                    } as typeof variables;
                }}
                // Real scalar fields go in customizeColumns; additionalColumns would duplicate them (same-key clash).
                customizeColumns={{
                    shortName: {
                        header: 'Counterparty',
                        // Keeps erpId in the selection — ListPage prunes fields with no column/dependency.
                        meta: { dependencies: ['erpId'] },
                        cell: ({ row }) => (
                            <div>
                                <DetailPageButton
                                    id={row.original.id}
                                    label={row.original.shortName}
                                />
                                <div className="text-muted-foreground text-xs mt-1">
                                    ERP ID: {row.original.erpId}
                                </div>
                            </div>
                        ),
                    },
                    inn: {
                        header: 'INN',
                        cell: ({ row }) => row.original.inn || '—',
                    },
                    priceType: {
                        header: 'Price type',
                        cell: ({ row }) => row.original.priceType,
                    },
                    // Real scalar column (not synthetic) so it gets the standard text filter; ERP-side manager only.
                    managerErpId: {
                        header: 'ERP Manager',
                        cell: ({ row }) =>
                            formatManager(row.original.managerErpId, administrators, erpUsers),
                    },
                    // Not disabled: the Status facetedFilter needs a fieldInfo-bearing column or the page crashes.
                    isActive: { header: 'Is Active (ERP)' },
                    erpId: { meta: { disabled: true } },
                    legalName: { meta: { disabled: true } },
                    creditLimit: { meta: { disabled: true } },
                    creditBalance: { meta: { disabled: true } },
                    paymentDelayDays: { meta: { disabled: true } },
                    assignedManagerId: { meta: { disabled: true } },
                    linkedCustomerId: { meta: { disabled: true } },
                    branchId: { meta: { disabled: true } },
                }}
                additionalColumns={{
                    branch: {
                        meta: { dependencies: ['branchId'] },
                        header: () => 'Branch',
                        cell: ({ row }) => formatBranch(row.original.branchId),
                    },
                    credit: {
                        meta: { dependencies: ['creditLimit', 'creditBalance'] },
                        header: () => 'Credit',
                        cell: ({ row }) => {
                            const { creditLimit, creditBalance } = row.original;
                            if (creditLimit == null || creditBalance == null) {
                                return <span className="text-muted-foreground">Hidden</span>;
                            }
                            return `${creditLimit.toLocaleString()} / ${creditBalance.toLocaleString()}`;
                        },
                    },
                    terms: {
                        meta: { dependencies: ['paymentDelayDays'] },
                        header: () => 'Terms',
                        cell: ({ row }) => `${row.original.paymentDelayDays} days`,
                    },
                    status: {
                        meta: { dependencies: ['linkedCustomerId', 'isActive'] },
                        header: () => 'Status',
                        cell: ({ row }) => {
                            const status = formatLinkStatus(
                                row.original.linkedCustomerId,
                                row.original.isActive,
                            );
                            if (status === 'erp-inactive') {
                                return <Badge variant="destructive">ERP inactive</Badge>;
                            }
                            return (
                                <Badge variant={status === 'linked' ? 'secondary' : 'outline'}>
                                    {status === 'linked' ? 'Linked' : 'Unlinked'}
                                </Badge>
                            );
                        },
                    },
                }}
                // Backend filters only on ERP isActive, not Linked/Unlinked — labels say "(ERP)" to match.
                facetedFilters={{
                    isActive: {
                        title: 'Status',
                        options: [
                            { label: 'Active (ERP)', value: 'active' },
                            { label: 'Inactive (ERP)', value: 'inactive' },
                        ],
                    },
                }}
                defaultColumnOrder={[
                    'shortName',
                    'inn',
                    'branch',
                    'managerErpId',
                    'credit',
                    'terms',
                    'priceType',
                    'status',
                ]}
                defaultVisibility={{
                    shortName: true,
                    inn: true,
                    branch: true,
                    managerErpId: true,
                    credit: true,
                    terms: true,
                    priceType: true,
                    status: true,
                    isActive: false,
                }}
                bulkActions={[
                    { component: AssignManagerBulkAction },
                    { component: LinkToCustomerBulkAction },
                    { component: UnlinkFromCustomerBulkAction },
                ]}
            />
        </CounterpartyListFilterContext.Provider>
    );
}
