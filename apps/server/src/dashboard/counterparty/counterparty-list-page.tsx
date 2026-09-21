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
            // Counterparty implements Node (required for ListPage to read the list response at
            // all, see counterparty.plugin.ts's own comment) — that also makes ListPage
            // auto-generate a column for every plain scalar field, including shortName/inn/
            // priceType. Those three MUST go in customizeColumns (overrides the auto-generated
            // column in place), never additionalColumns (adds a second, same-keyed column) — real
            // incident: shipped via additionalColumns first, React warned "two children with the
            // same key" and the list rendered duplicate Short Name/Inn/Price Type columns
            // alongside the intended ones. Same documented pitfall as
            // pending-erp-users-page.tsx's departmentId column.
            customizeColumns={{
                shortName: {
                    header: 'Counterparty',
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
                    header: 'INN',
                    cell: ({ row }) => row.original.inn || '—',
                },
                priceType: {
                    header: 'Price type',
                    cell: ({ row }) => row.original.priceType,
                },
                // These are real scalar fields on Counterparty, so ListPage generates a column
                // for each of them too (see the Node comment above) even though every one is
                // already surfaced through a curated column above/below (erpId inline under
                // "Counterparty", creditLimit/creditBalance combined into "credit", etc). Left
                // enabled, the column-visibility picker fills up with a dozen raw duplicate
                // fields the reviewed concept (docs/ai — Counterparty ERP list concept) never
                // had — `meta.disabled` is the only way to stop the column from being generated
                // at all, not just hidden from the default view.
                erpId: { meta: { disabled: true } },
                legalName: { meta: { disabled: true } },
                creditLimit: { meta: { disabled: true } },
                creditBalance: { meta: { disabled: true } },
                paymentDelayDays: { meta: { disabled: true } },
                isActive: { meta: { disabled: true } },
                assignedManagerId: { meta: { disabled: true } },
                managerErpId: { meta: { disabled: true } },
                linkedCustomerId: { meta: { disabled: true } },
                branchId: { meta: { disabled: true } },
            }}
            additionalColumns={{
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
