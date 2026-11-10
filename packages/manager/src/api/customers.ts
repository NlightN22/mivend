import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { adminApi } from './client';
import {
    AcceptTradingPointChangeDocument,
    ActiveDiscountCountsDocument,
    CounterpartyShortNameDocument,
    CreditByCounterpartyIdDocument,
    CreditForCounterpartyDocument,
    CreditLimitExceededCounterpartyIdsDocument,
    CustomerByIdDocument,
    CustomerDocumentsPageDocument,
    CustomerDocumentTypesDocument,
    CustomerIdForCounterpartyDocument,
    CustomerOrdersDocument,
    CustomersPageDocument,
    CustomersSummaryDocument,
    HighUsageCustomersDocument,
    LastOrderDatesDocument,
    PendingTradingPointChangesDocument,
    ReassignCounterpartyManagerDocument,
    RejectTradingPointChangeDocument,
    SetTradingPointActiveDocument,
    UnassignedCounterpartyCountDocument,
    UpdateTradingPointDetailsDocument,
    type CounterpartyFilterParameter,
    type CounterpartySortParameter,
    type CustomerListItemFieldsFragment,
    type CustomerOrderItemFieldsFragment,
    type PendingTradingPointChangeFieldsFragment,
} from './generated/graphql';

export type ContactPersonInfo =
    CustomerListItemFieldsFragment['tradingPoints'][number]['contacts'][number];
export type TradingPointInfo = CustomerListItemFieldsFragment['tradingPoints'][number];
export type CustomerListItem = CustomerListItemFieldsFragment & { contacts: ContactPersonInfo[] };

function toCustomerListItem(c: CustomerListItemFieldsFragment): CustomerListItem {
    return { ...c, contacts: c.tradingPoints.flatMap(tp => tp.contacts) };
}

export interface CustomersListOptions {
    take?: number;
    skip?: number;
    search?: string;
    status?: 'active' | 'inactive';
    managerId?: string;
    branchId?: string;
    // Free-text, exact match against the ERP-sourced group/segment label — see
    // Counterparty.erpGroupLabel's doc comment for why this isn't a fixed enum/dropdown.
    groupLabel?: string;
    // Overrides managerId — see CounterpartyService.findVisiblePage's doc comment.
    unassignedOnly?: boolean;
    innStatus?: 'missing' | 'duplicate';
    filter?: CounterpartyFilterParameter;
    sort?: CounterpartySortParameter;
}

// Server-side paginated (see issue #39) — search/status/manager/branch/group/unassigned are all
// pushed down to CounterpartyListOptions, never filtered client-side over a partial page.
export async function fetchCustomersPage(
    options: CustomersListOptions,
): Promise<{ items: CustomerListItem[]; totalItems: number }> {
    const result = await adminApi(CustomersPageDocument, { options });
    return {
        items: result.counterparties.items.map(toCustomerListItem),
        totalItems: result.counterparties.totalItems,
    };
}

export async function fetchUnassignedCounterpartyCount(): Promise<number> {
    const result = await adminApi(UnassignedCounterpartyCountDocument);
    return result.unassignedCounterpartyCount;
}

export interface CustomersSummary {
    totalCount: number;
    activeCount: number;
    // Null for a caller without ReadCounterpartyCredit — see CounterpartyResolver.counterpartySummary.
    totalCreditBalance: number | null;
    highUsageCount: number | null;
}

export async function fetchCustomersSummary(): Promise<CustomersSummary> {
    const result = await adminApi(CustomersSummaryDocument);
    return result.counterpartySummary;
}

export interface HighUsageCustomer extends CustomerListItem {
    creditLimit: number;
    creditBalance: number;
}

// Isolated request: a permission-gated credit failure must not null unrelated page data
// Wrapped in try/catch because callers without ReadCounterpartyCredit would otherwise throw
export async function fetchHighUsageCustomers(limit: number): Promise<HighUsageCustomer[]> {
    try {
        const result = await adminApi(HighUsageCustomersDocument, { limit });
        return result.highUsageCounterparties.map(c => ({
            ...toCustomerListItem(c),
            creditLimit: c.creditLimit ?? 0,
            creditBalance: c.creditBalance ?? 0,
        }));
    } catch {
        return [];
    }
}

export async function fetchCreditLimitExceededCounterpartyIds(): Promise<string[]> {
    try {
        const result = await adminApi(CreditLimitExceededCounterpartyIdsDocument);
        return result.creditLimitExceededCounterpartyIds;
    } catch {
        return [];
    }
}

// Dedicated single-entity lookup (see counterparty.resolver.ts's `counterparty(id)`) — no longer
// depends on fetching the (now paginated) full list and filtering client-side by id.
export async function fetchCustomerById(counterpartyId: string): Promise<CustomerListItem | null> {
    const result = await adminApi(CustomerByIdDocument, { id: counterpartyId });
    return result.counterparty ? toCustomerListItem(result.counterparty) : null;
}

// Counterparties aren't a small preloadable set, so names are fetched per page by id
export async function fetchCounterpartyNames(ids: string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(ids)];
    const results = await Promise.all(
        uniqueIds.map(id => adminApi(CounterpartyShortNameDocument, { id })),
    );
    return new Map(
        uniqueIds
            .map((id, i) => [id, results[i].counterparty?.shortName] as const)
            .filter((entry): entry is [string, string] => !!entry[1]),
    );
}

// Dept-heads are limited to their own department; portal-admin is unrestricted
// Throws for any other caller; the rule itself lives in CounterpartyService.reassignManager
export async function reassignCounterpartyManager(
    counterpartyId: string,
    administratorId: string,
): Promise<void> {
    await adminApi(ReassignCounterpartyManagerDocument, { counterpartyId, administratorId });
}

export interface TradingPointDetailsPatch {
    name?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    workingHours?: string | null;
    deliveryComment?: string | null;
    contacts?: {
        name: string;
        phone?: string | null;
        email?: string | null;
        isPrimary?: boolean;
    }[];
}

// Distinct from ERP sync. Every successful call is recorded by VersioningService (History tab)
export async function updateTradingPointDetails(
    id: string,
    input: TradingPointDetailsPatch,
): Promise<void> {
    await adminApi(UpdateTradingPointDetailsDocument, { id, input });
}

// One-click reactivate/deactivate — sets both isActive and customerStatus together (see
// TradingPointService.setActive).
export async function setTradingPointActive(id: string, isActive: boolean): Promise<void> {
    await adminApi(SetTradingPointActiveDocument, { id, isActive });
}

export type PendingTradingPointChange = PendingTradingPointChangeFieldsFragment;

export async function fetchPendingTradingPointChanges(): Promise<PendingTradingPointChange[]> {
    const result = await adminApi(PendingTradingPointChangesDocument);
    return result.pendingTradingPointChanges;
}

export async function acceptTradingPointChange(id: string): Promise<void> {
    await adminApi(AcceptTradingPointChangeDocument, { id });
}

export async function rejectTradingPointChange(id: string, comment?: string): Promise<void> {
    await adminApi(RejectTradingPointChangeDocument, { id, comment: comment || null });
}

// Vendure's Customer.id is a different id from Counterparty.id, which this page is keyed by
export async function fetchCustomerIdForCounterparty(
    counterpartyId: string,
): Promise<string | null> {
    // counterpartyId holds an id but is a plain String customField
    // Filter it with StringOperators, not IDOperators (customFields filters are flat)
    const result = await adminApi(CustomerIdForCounterpartyDocument, { counterpartyId });
    return result.customers.items[0]?.id ?? null;
}

export type CustomerOrderItem = Omit<CustomerOrderItemFieldsFragment, 'customFields'> & {
    customFields: NonNullable<CustomerOrderItemFieldsFragment['customFields']>;
};

// Schema says nullable, but Vendure always populates it, so callers may assume it's present
function normalizeOrderItem(item: CustomerOrderItemFieldsFragment): CustomerOrderItem {
    return {
        ...item,
        customFields: item.customFields ?? {
            latestFulfillmentState: null,
            placedByAdministratorId: null,
            reservationState: null,
        },
    };
}

export async function fetchOrdersForCustomer(
    customerId: string,
    take = 20,
): Promise<CustomerOrderItem[]> {
    const result = await adminApi(CustomerOrdersDocument, { customerId, take });
    return result.visibleOrders.items.map(normalizeOrderItem);
}

// Can't be a real admin id: placedByAdministratorId is null for storefront-placed orders
export const PLACED_BY_CUSTOMER_VALUE = '__customer__';

export interface CustomerDocument {
    id: string;
    type: string;
    number: string;
    status: string;
    issueDate: string;
}

// Document.status is an internal pipeline state, so a hardcoded dropdown is fine
// Document.type is ERP-sourced, so it must come from the backend, never be hardcoded
export const DOCUMENT_STATUS_OPTIONS = [
    { value: '', label: 'All statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'generating', label: 'Generating' },
    { value: 'ready', label: 'Ready' },
    { value: 'failed', label: 'Failed' },
] as const;

export const DOCUMENT_STATUS_BADGE_VARIANT: Record<string, StatusBadgeVariant> = {
    pending: 'neutral',
    generating: 'warning',
    ready: 'success',
    failed: 'danger',
};

export interface CustomerDocumentFilters {
    // Real distinct values selected in the checklist filter (see DOCUMENT_STATUS_OPTIONS' own
    // doc comment) — exact match, not the old free-text substring search.
    types: string[];
    status: string;
    // Substring match against the document's own number (ILIKE) — see
    // DocumentsService.findVisible's doc comment.
    search: string;
}

export const DEFAULT_CUSTOMER_DOCUMENT_FILTERS: CustomerDocumentFilters = {
    types: [],
    status: '',
    search: '',
};

// Documents accumulate over a customer's lifetime, so this list must paginate server-side
export async function fetchDocumentsPageForCounterparty(
    counterpartyId: string,
    page: number,
    pageSize: number,
    filters: CustomerDocumentFilters = DEFAULT_CUSTOMER_DOCUMENT_FILTERS,
): Promise<{ items: CustomerDocument[]; totalItems: number }> {
    const result = await adminApi(CustomerDocumentsPageDocument, {
        counterpartyId,
        options: {
            skip: (page - 1) * pageSize,
            take: pageSize,
            types: filters.types.length ? filters.types : undefined,
            status: filters.status || undefined,
            search: filters.search || undefined,
        },
    });
    return result.documents;
}

// Distinct types come from the backend, since Document.type is ERP-sourced and not hardcoded
export async function fetchDocumentTypes(counterpartyId: string): Promise<string[]> {
    const result = await adminApi(CustomerDocumentTypesDocument, { counterpartyId });
    return result.documentTypes;
}

export interface CustomerCredit {
    creditLimit: number;
    creditBalance: number;
    paymentDelayDays: number;
}

// Isolated: creditLimit/creditBalance are permission-gated and must not share a request
// Scoped to the same options as the list query it enriches, so it stays bounded
export async function fetchCreditByCounterpartyId(
    options: CustomersListOptions,
): Promise<Map<string, CustomerCredit>> {
    try {
        const result = await adminApi(CreditByCounterpartyIdDocument, { options });
        return new Map(
            result.counterparties.items.map(c => [
                c.id,
                {
                    creditLimit: c.creditLimit ?? 0,
                    creditBalance: c.creditBalance ?? 0,
                    paymentDelayDays: c.paymentDelayDays ?? 0,
                },
            ]),
        );
    } catch {
        return new Map();
    }
}

// Detail-page variant (Customer Detail, Order Detail) — needs credit for exactly one
// counterparty, not a page of them. Same isolation reasoning as fetchCreditByCounterpartyId.
export async function fetchCreditForCounterparty(
    counterpartyId: string,
): Promise<CustomerCredit | null> {
    try {
        const result = await adminApi(CreditForCounterpartyDocument, { id: counterpartyId });
        return result.counterparty
            ? {
                  creditLimit: result.counterparty.creditLimit ?? 0,
                  creditBalance: result.counterparty.creditBalance ?? 0,
                  paymentDelayDays: result.counterparty.paymentDelayDays ?? 0,
              }
            : null;
    } catch {
        return null;
    }
}

// One request for the whole page; counts only grants applying to each counterparty, not the shared
// price type rules. 'active' is computed server-side, never from validTo here.
export async function fetchActiveDiscountCountsByCustomer(
    counterpartyIds: string[],
): Promise<Map<string, number>> {
    const ids = [...new Set(counterpartyIds)];
    if (ids.length === 0) return new Map();
    const result = await adminApi(ActiveDiscountCountsDocument, { counterpartyIds: ids });
    return new Map(result.activeDiscountCounts.map(row => [row.counterpartyId, row.count]));
}

export async function fetchLastOrderDatesByCounterpartyId(
    counterpartyIds: string[],
): Promise<Map<string, string>> {
    if (counterpartyIds.length === 0) return new Map();
    const result = await adminApi(LastOrderDatesDocument, { counterpartyIds });
    return new Map(result.lastOrderDates.map(r => [r.counterpartyId, r.lastOrderAt]));
}
