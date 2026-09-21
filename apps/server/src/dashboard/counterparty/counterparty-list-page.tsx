import { useState } from 'react';
import { api, Badge, DetailPageButton, ListPage } from '@vendure/dashboard';
import { AnyRoute } from '@tanstack/react-router';

import { counterpartyListDocument, administratorNamesForCounterpartyDocument } from './counterparty.graphql.js';
import { formatBranch, formatLinkStatus, formatManager } from './counterparty-display.js';
import {
    AssignManagerBulkAction,
    LinkToCustomerBulkAction,
    UnlinkFromCustomerBulkAction,
} from './components/counterparty-bulk-actions.js';

// Issue #133 Phase 2 — native ListPage-based Counterparty list, replacing the hand-rolled table
// in the reviewed concept. Manager names are resolved client-side against a lightweight
// administrators lookup (see counterparty.graphql.ts) rather than adding a server-side field
// resolver — the existing assignedManagerId/managerErpId fallback fields already carry
// everything needed, this just turns an id into a display name for the small page of rows
// currently on screen.
export function CounterpartyListPage({ route }: Readonly<{ route: AnyRoute }>) {
    const [administrators, setAdministrators] = useState<Array<{ id: string; name: string }>>([]);

    async function loadAdministrators(): Promise<void> {
        const data = await api.query(administratorNamesForCounterpartyDocument, {
            options: { take: 999 },
        });
        setAdministrators(
            (data.administrators?.items ?? []).map(a => ({
                id: a.id,
                name: `${a.firstName} ${a.lastName}`,
            })),
        );
    }

    if (administrators.length === 0) {
        void loadAdministrators();
    }

    return (
        <ListPage
            pageId="counterparty-list"
            title="Counterparty ERP"
            listQuery={counterpartyListDocument}
            route={route}
            // CounterpartyListOptions (packages/plugins/counterparty) is a small bespoke input,
            // not Vendure's native ListOptions — it has no `sort`/`filter` fields, only a plain
            // `search: String`. ListPage's own PaginatedListDataTable always builds a
            // `{ take, skip, sort, filter }` shape internally; onSearchTermChange lets it stash
            // the raw search term into that filter object, and transformVariables reshapes the
            // whole thing into what this backend query actually accepts before it's sent.
            onSearchTermChange={searchTerm => ({ __search: searchTerm }) as any}
            transformVariables={variables => {
                const search = (variables.options?.filter as { __search?: string } | undefined)
                    ?.__search;
                return {
                    options: {
                        take: variables.options?.take,
                        skip: variables.options?.skip,
                        search: search || undefined,
                    },
                } as typeof variables;
            }}
            additionalColumns={{
                // Counterparty is a plugin-defined GraphQL type, not one of @vendure/dashboard's
                // own native entities — its scalar fields (shortName/inn/priceType) aren't
                // auto-generated into columns the way a native type's fields are, so every
                // displayed field is declared explicitly here rather than mixed with
                // customizeColumns (which only customizes an already auto-generated column).
                shortName: {
                    meta: { dependencies: ['id', 'shortName', 'erpId'] },
                    header: () => 'Counterparty',
                    cell: ({ row }) => (
                        <div>
                            <DetailPageButton id={row.original.id} label={row.original.shortName} />
                            <div className="text-muted-foreground text-xs mt-1">
                                ERP ID: {row.original.erpId}
                            </div>
                        </div>
                    ),
                },
                inn: {
                    meta: { dependencies: ['inn'] },
                    header: () => 'INN',
                    cell: ({ row }) => row.original.inn || '—',
                },
                priceType: {
                    meta: { dependencies: ['priceType'] },
                    header: () => 'Price type',
                    cell: ({ row }) => row.original.priceType,
                },
                branch: {
                    meta: { dependencies: ['branchId'] },
                    header: () => 'Branch',
                    cell: ({ row }) => formatBranch(row.original.branchId),
                },
                manager: {
                    meta: { dependencies: ['assignedManagerId', 'managerErpId'] },
                    header: () => 'Manager',
                    cell: ({ row }) =>
                        formatManager(
                            {
                                assignedManagerId: row.original.assignedManagerId,
                                managerErpId: row.original.managerErpId,
                            },
                            administrators,
                        ),
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
                        const status = formatLinkStatus(row.original.linkedCustomerId, row.original.isActive);
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
            defaultColumnOrder={[
                'shortName',
                'inn',
                'branch',
                'manager',
                'credit',
                'terms',
                'priceType',
                'status',
            ]}
            defaultVisibility={{
                shortName: true,
                inn: true,
                branch: true,
                manager: true,
                credit: true,
                terms: true,
                priceType: true,
                status: true,
            }}
            bulkActions={[
                { component: AssignManagerBulkAction },
                { component: LinkToCustomerBulkAction },
                { component: UnlinkFromCustomerBulkAction },
            ]}
        />
    );
}
