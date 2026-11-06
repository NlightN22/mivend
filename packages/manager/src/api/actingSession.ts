import { adminApi } from './client';
import {
    ActingCounterpartiesDocument,
    ActingCounterpartyDocument,
    StartActingSessionDocument,
    type ActingCounterpartyQuery,
} from './generated/graphql';

export interface CustomerOption {
    counterpartyId: string;
    customerId: string | null;
    shortName: string;
    legalName: string;
    inn: string | null;
    priceType: string | null;
    tradingPoints: { id: string; name: string; address: string }[];
}

export interface CustomerCredit {
    creditLimit: number;
    creditBalance: number;
}

export const PORTAL_NOT_ACTIVATED_REASON = 'Portal access not activated';

type CounterpartyRow = NonNullable<ActingCounterpartyQuery['counterparty']>;

function toCustomerOption(c: CounterpartyRow): CustomerOption {
    return {
        counterpartyId: c.id,
        customerId: c.linkedCustomerId,
        shortName: c.shortName,
        legalName: c.legalName,
        inn: c.inn,
        priceType: c.priceType,
        // Same rule as the server: only active, visible points can be chosen for delivery.
        tradingPoints: c.tradingPoints
            .filter(p => p.isActive && p.customerStatus === 'active')
            .map(({ id, name, address }) => ({ id, name, address })),
    };
}

export interface CustomerSearchResult {
    items: CustomerOption[];
    totalItems: number;
}

export const CUSTOMER_SEARCH_PAGE_SIZE = 20;

export const hasMoreCustomerMatches = (totalItems: number): boolean =>
    totalItems > CUSTOMER_SEARCH_PAGE_SIZE;

export async function searchCustomerOptions(term: string): Promise<CustomerSearchResult> {
    const search = term.trim();
    if (!search) return { items: [], totalItems: 0 };
    const result = await adminApi(ActingCounterpartiesDocument, { search });
    return {
        items: result.counterparties.items.map(toCustomerOption),
        totalItems: result.counterparties.totalItems,
    };
}

export async function fetchCustomerOption(counterpartyId: string): Promise<CustomerOption | null> {
    const result = await adminApi(ActingCounterpartyDocument, { id: counterpartyId });
    return result.counterparty ? toCustomerOption(result.counterparty) : null;
}

// Kept separate: a ForbiddenError on a non-null field (creditLimit/creditBalance need
// ReadCounterpartyCredit) nulls the whole GraphQL response, so don't share a request.
export { fetchCreditForCounterparty as fetchCustomerCredit } from './customers';

export function actingStorefrontUrl(storefrontUrl: string, ticket: string): string {
    return `${storefrontUrl.replace(/\/+$/, '')}/acting#ticket=${encodeURIComponent(ticket)}`;
}

export async function startActingSession(
    counterpartyId: string,
    tradingPointId: string | null,
): Promise<string> {
    const { startActingSession: started } = await adminApi(StartActingSessionDocument, {
        counterpartyId,
        tradingPointId,
    });
    return actingStorefrontUrl(started.storefrontUrl, started.ticket);
}
