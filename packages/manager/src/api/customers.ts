import { adminApi } from './client';

export interface ContactPersonInfo {
    name: string;
    phone: string | null;
    email: string | null;
    isPrimary: boolean;
}

export interface TradingPointInfo {
    id: string;
    name: string;
    address: string;
    workingHours: string | null;
    deliveryComment: string | null;
    isActive: boolean;
    contacts: ContactPersonInfo[];
}

export interface CustomerListItem {
    id: string;
    shortName: string;
    legalName: string;
    inn: string | null;
    isActive: boolean;
    priceType: string;
    assignedManagerId: string | null;
    branchId: string | null;
    contacts: ContactPersonInfo[];
    tradingPoints: TradingPointInfo[];
}

export async function fetchCustomersList(): Promise<CustomerListItem[]> {
    const result = await adminApi<{
        counterparties: {
            id: string;
            shortName: string;
            legalName: string;
            inn: string | null;
            isActive: boolean;
            priceType: string;
            assignedManagerId: string | null;
            branchId: string | null;
            tradingPoints: TradingPointInfo[];
        }[];
    }>(
        `query {
            counterparties {
                id
                shortName
                legalName
                inn
                isActive
                priceType
                assignedManagerId
                branchId
                tradingPoints {
                    id
                    name
                    address
                    workingHours
                    deliveryComment
                    isActive
                    contacts { name phone email isPrimary }
                }
            }
        }`,
    );
    return result.counterparties.map(c => ({
        id: c.id,
        shortName: c.shortName,
        legalName: c.legalName,
        inn: c.inn,
        isActive: c.isActive,
        priceType: c.priceType,
        assignedManagerId: c.assignedManagerId,
        branchId: c.branchId,
        contacts: c.tradingPoints.flatMap(tp => tp.contacts),
        tradingPoints: c.tradingPoints,
    }));
}

export async function fetchCustomerById(counterpartyId: string): Promise<CustomerListItem | null> {
    const all = await fetchCustomersList();
    return all.find(c => c.id === counterpartyId) ?? null;
}

// Gated on CustomPermission.ReassignCounterpartyManager (department-head within their own
// department, portal-admin unrestricted) — throws for any other caller, see
// CounterpartyService.reassignManager.
export async function reassignCounterpartyManager(
    counterpartyId: string,
    administratorId: string,
): Promise<void> {
    await adminApi(
        `mutation($counterpartyId: ID!, $administratorId: ID!) {
            reassignCounterpartyManager(counterpartyId: $counterpartyId, administratorId: $administratorId) { id }
        }`,
        { counterpartyId, administratorId },
    );
}

export interface TradingPointDetailsPatch {
    name?: string;
    address?: string;
    workingHours?: string | null;
    deliveryComment?: string | null;
    contacts?: {
        name: string;
        phone?: string | null;
        email?: string | null;
        isPrimary?: boolean;
    }[];
}

// Staff patch, distinct from ERP sync — gated on "can see this counterparty" (see
// TradingPointAdminResolver.updateTradingPointDetails). Every successful call is recorded by
// VersioningService for the customer's History tab.
export async function updateTradingPointDetails(
    id: string,
    input: TradingPointDetailsPatch,
): Promise<void> {
    await adminApi(
        `mutation($id: ID!, $input: TradingPointDetailsInput!) {
            updateTradingPointDetails(id: $id, input: $input) { id }
        }`,
        { id, input },
    );
}

// One-click reactivate/deactivate — sets both isActive and customerStatus together (see
// TradingPointService.setActive).
export async function setTradingPointActive(id: string, isActive: boolean): Promise<void> {
    await adminApi(
        `mutation($id: ID!, $isActive: Boolean!) {
            setTradingPointActive(id: $id, isActive: $isActive) { id }
        }`,
        { id, isActive },
    );
}

// Vendure's Customer.id (needed to filter orders/create draft orders) is a different id than
// the Counterparty.id this whole page is keyed by — see CounterpartyService.getForCustomer for
// the reverse direction of this same lookup.
export async function fetchCustomerIdForCounterparty(
    counterpartyId: string,
): Promise<string | null> {
    const result = await adminApi<{
        customers: { items: { id: string; counterparty: { id: string } | null }[] };
    }>(`query { customers(options: { take: 200 }) { items { id counterparty { id } } } }`);
    return result.customers.items.find(c => c.counterparty?.id === counterpartyId)?.id ?? null;
}

export interface CustomerOrderItem {
    code: string;
    state: string;
    totalWithTax: number;
    currencyCode: string;
    orderPlacedAt: string | null;
}

export async function fetchOrdersForCustomer(
    customerId: string,
    take = 20,
): Promise<CustomerOrderItem[]> {
    const result = await adminApi<{
        visibleOrders: { items: CustomerOrderItem[] };
    }>(
        `query($customerId: ID!, $take: Int!) {
            visibleOrders(options: { take: $take, sort: { orderPlacedAt: DESC } }, customerId: $customerId) {
                items { code state totalWithTax currencyCode orderPlacedAt }
            }
        }`,
        { customerId, take },
    );
    return result.visibleOrders.items;
}

export interface CustomerDocument {
    id: string;
    type: string;
    number: string;
    status: string;
    issueDate: string;
}

export async function fetchDocumentsForCounterparty(
    counterpartyId: string,
): Promise<CustomerDocument[]> {
    const result = await adminApi<{
        documents: { items: (CustomerDocument & { counterpartyId: string })[] };
    }>(
        `query { documents(options: { take: 200 }) { items { id type number status issueDate counterpartyId } } }`,
    );
    return result.documents.items.filter(d => d.counterpartyId === counterpartyId);
}

export interface CustomerCredit {
    creditLimit: number;
    creditBalance: number;
}

// Isolated on purpose — see api/orderCreate.ts's fetchCustomerCredit for why creditLimit/
// creditBalance must never share a request with data the page can't do without
// (ReadCounterpartyCredit is Dept-Head/Director/SB/Portal-Admin only).
export async function fetchCreditByCounterpartyId(): Promise<Map<string, CustomerCredit>> {
    try {
        const result = await adminApi<{
            counterparties: { id: string; creditLimit: number; creditBalance: number }[];
        }>(`query { counterparties { id creditLimit creditBalance } }`);
        return new Map(
            result.counterparties.map(c => [
                c.id,
                { creditLimit: c.creditLimit, creditBalance: c.creditBalance },
            ]),
        );
    } catch {
        return new Map();
    }
}

// Discounts apply by price type, not per customer (DiscountRule has no customerId — see
// discount-rule.entity.ts) — "active discounts for this customer" really means "active
// discounts for this customer's price type".
export async function fetchActiveDiscountCountsByPriceType(
    priceTypes: string[],
): Promise<Map<string, number>> {
    const now = Date.now();
    const entries = await Promise.all(
        [...new Set(priceTypes)].map(async priceTypeCode => {
            const result = await adminApi<{
                discountRules: { validFrom: string; validTo: string }[];
            }>(
                `query($priceTypeCode: String!) { discountRules(priceTypeCode: $priceTypeCode) { validFrom validTo } }`,
                {
                    priceTypeCode,
                },
            );
            const activeCount = result.discountRules.filter(
                r => new Date(r.validFrom).getTime() <= now && new Date(r.validTo).getTime() >= now,
            ).length;
            return [priceTypeCode, activeCount] as const;
        }),
    );
    return new Map(entries);
}

export interface DiscountRuleItem {
    id: string;
    percent: number;
    facetValueCode: string | null;
    validTo: string;
}

// Only grants that actually apply to this counterparty (company-wide or scoped to it) — see
// DiscountGrantService.findForCounterparty. Using discountRules(priceTypeCode) here would leak
// grants scoped to a *different* customer that happens to share the same price type.
export async function fetchDiscountGrantsForCounterparty(
    counterpartyId: string,
): Promise<DiscountRuleItem[]> {
    const result = await adminApi<{ discountGrantsForCounterparty: DiscountRuleItem[] }>(
        `query($counterpartyId: ID!) {
            discountGrantsForCounterparty(counterpartyId: $counterpartyId) {
                id
                percent
                facetValueCode
                validTo
            }
        }`,
        { counterpartyId },
    );
    return result.discountGrantsForCounterparty;
}

// Keyed by counterparty id (the "customer" this whole page means) — capped at 500 rows, same
// tradeoff as OrdersSummary's "total amount": there is no per-customer MAX(orderPlacedAt)
// aggregate query yet.
export async function fetchLastOrderDatesByCounterpartyId(): Promise<Map<string, string>> {
    const result = await adminApi<{
        visibleOrders: {
            items: {
                orderPlacedAt: string | null;
                customer: { counterparty: { id: string } | null } | null;
            }[];
        };
    }>(
        `query {
            visibleOrders(options: { take: 500, sort: { orderPlacedAt: DESC } }) {
                items { orderPlacedAt customer { counterparty { id } } }
            }
        }`,
    );
    const map = new Map<string, string>();
    for (const item of result.visibleOrders.items) {
        const counterpartyId = item.customer?.counterparty?.id;
        if (!counterpartyId || !item.orderPlacedAt) continue;
        if (!map.has(counterpartyId)) {
            map.set(counterpartyId, item.orderPlacedAt);
        }
    }
    return map;
}
