import { useState } from 'react';
import { api, Badge, DetailPageButton, ListPage } from '@vendure/dashboard';
import { AnyRoute } from '@tanstack/react-router';

import {
    counterpartyListDocument,
    administratorNamesForCounterpartyDocument,
    pendingErpUsersForCounterpartyDocument,
} from './counterparty.graphql.js';
import { formatBranch, formatLinkStatus, formatManager } from './counterparty-display.js';
import { AssignManagerBulkAction } from './components/counterparty-bulk-actions.js';

// Issue #133 Phase 2 — native ListPage-based Counterparty list, replacing the hand-rolled table
// in the reviewed concept. ERP Manager names are resolved client-side against two lightweight
// lookups (administrators-by-erpId, unlinked ErpUsers — see counterparty.graphql.ts and
// counterparty-display.ts's formatManager) rather than a server-side field resolver — small,
// rarely-changing lists, loaded once for the small page of rows currently on screen.
export function CounterpartyListPage({ route }: Readonly<{ route: AnyRoute }>) {
    const [administrators, setAdministrators] = useState<
        Array<{ id: string; name: string; erpId: string | null }>
    >([]);
    const [erpUsers, setErpUsers] = useState<Array<{ erpId: string; fullName: string | null }>>([]);

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

    if (administrators.length === 0) {
        void loadAdministrators();
    }
    if (erpUsers.length === 0) {
        void loadErpUsers();
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
            // The Status facetedFilter and ERP Manager's own auto-generated scalar-field filter
            // (managerErpId, enabled below) both land here as columnFilters entries under
            // `options.filter._and` (PaginatedListDataTable's own shape: one `{ [columnId]:
            // value }` object per active filter) — pulled out and translated into
            // CounterpartyListOptions' real fields.
            transformVariables={variables => {
                const filter = variables.options?.filter as
                    | { __search?: string; _and?: Array<Record<string, unknown>> }
                    | undefined;
                const search = filter?.__search;
                const facet = (id: string): unknown => {
                    const entry = filter?._and?.find(f => id in f);
                    const raw = entry?.[id];
                    // Checkbox-style faceted filters (e.g. a String column) always send an
                    // array, even for a single selection. A Boolean column's facetedFilter
                    // renders as radio buttons instead (@vendure/dashboard's own
                    // DataTableFacetedFilter branches on fieldInfo.type === 'Boolean') and calls
                    // `column.setFilterValue({ eq: value })`. The generic "add filter" funnel
                    // menu's own text filter on a String column (managerErpId) sends
                    // `{ contains: value }` instead. Sending either operator object straight to
                    // the resolver as-is is a real, live bug caught here — first the isActive
                    // filter silently only half-applied (`{"status":{"eq":"active"}}` sent to a
                    // plain `status: String` arg), then the managerErpId text filter did the
                    // same with `{ contains: ... }` — so both operator shapes need unwrapping,
                    // not just one.
                    if (Array.isArray(raw)) return raw[0];
                    if (raw && typeof raw === 'object') {
                        if ('eq' in raw) return (raw as { eq: unknown }).eq;
                        if ('contains' in raw) return (raw as { contains: unknown }).contains;
                    }
                    return raw;
                };
                const status = facet('isActive') as 'active' | 'inactive' | undefined;
                const managerErpId = facet('managerErpId') as string | undefined;
                return {
                    options: {
                        take: variables.options?.take,
                        skip: variables.options?.skip,
                        search: search || undefined,
                        status: status || undefined,
                        managerErpId: managerErpId || undefined,
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
                    // erpId has no column of its own (disabled below) — without this dependency
                    // declaration, ListPage prunes erpId out of the actual GraphQL selection
                    // entirely once nothing else references it, silently emptying the "ERP ID:"
                    // line below (a real regression caught live: erpId disappeared from the raw
                    // network response, not just the screen, the moment its own column was
                    // disabled).
                    meta: { dependencies: ['erpId'] },
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
                // "ERP Manager" — kept as the REAL scalar column (not a synthetic
                // additionalColumns entry) specifically so it gets ListPage's standard
                // scalar-field filter for free (same equalsString text filter INN/Price Type
                // already have, visible in the funnel menu). Entirely about managerErpId, per an
                // explicit product decision: Counterparty.assignedManagerId (a separate,
                // operational concept — mivend's own current owner, changeable independently of
                // whatever 1C last reported) plays no part in this column at all, neither for
                // display nor filtering. The displayed cell resolves a name for managerErpId
                // itself (see formatManager) rather than showing the raw id whenever possible.
                managerErpId: {
                    header: 'ERP Manager',
                    cell: ({ row }) => formatManager(row.original.managerErpId, administrators, erpUsers),
                },
                // isActive is deliberately NOT disabled, unlike the other raw fields below — it
                // needs a real, fieldInfo-bearing generated column for the Status facetedFilter
                // to attach to (see the facetedFilters comment). @vendure/dashboard's own
                // DataTableFacetedFilter reads `column.columnDef.meta.fieldInfo.type` with no
                // null-check on fieldInfo itself — attaching a facetedFilter to a synthetic
                // additionalColumns key (meta has no fieldInfo at all) crashes the whole page
                // with "can't access property 'type', ... fieldInfo is undefined" (confirmed
                // live). Hidden from the default view via defaultVisibility below — the "Status"
                // badge column already covers everything a viewer needs to see.
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
            // Backend only filters Status on the ERP isActive flag (CounterpartyListOptions'
            // status: "active"|"inactive") — a different, narrower dimension than the Status
            // *column*'s own Linked/Unlinked/ERP inactive badge (which also folds in
            // linkedCustomerId). There is no backend filter for the Linked/Unlinked distinction
            // yet; labelling these options plainly as "Active (ERP)"/"Inactive (ERP)" so the
            // filter doesn't imply it can narrow by link status too.
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
            // Link to Customer / Unlink from Customer (#120's own activation/deactivation
            // mutations) are deliberately not wired up here at all, not even as a disabled
            // placeholder — a prior attempt shipped them as visually-enabled-looking bulk actions
            // whose label leaked the internal issue number ("coming with #120") straight into the
            // product UI, which is not something a real user should ever see. #133 explicitly
            // allows hiding this affordance entirely until #120 ships; add it back as one real
            // bulk action once that mutation exists, not as a stub.
            bulkActions={[{ component: AssignManagerBulkAction }]}
        />
    );
}
