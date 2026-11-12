import type { StatusBadgeVariant } from '@mivend/ui-kit';
import { adminApi } from './client';
import {
    DiscountCounterpartySearchDocument,
    DiscountFacetsDocument,
    ExpiringDiscountGrantsDocument,
    PriceTypeCodesDocument,
    RequestDiscountGrantDocument,
} from './generated/graphql';

export type DiscountStatus = 'active' | 'expiring-soon' | 'expired' | 'pending' | 'rejected';

export const DISCOUNT_STATUS_OPTIONS: { value: DiscountStatus; label: string }[] = [
    { value: 'active', label: 'Active' },
    { value: 'expiring-soon', label: 'Expiring soon' },
    { value: 'expired', label: 'Expired' },
    { value: 'pending', label: 'Pending approval' },
    { value: 'rejected', label: 'Rejected' },
];

// Single source of truth for the row badges and the chips that stand for the same status.
export const DISCOUNT_STATUS_BADGE_VARIANT: Record<DiscountStatus, StatusBadgeVariant> = {
    active: 'success',
    'expiring-soon': 'warning',
    expired: 'neutral',
    pending: 'info',
    rejected: 'danger',
};

export interface DiscountGrantInput {
    priceTypeCode: string;
    facetCode?: string | null;
    facetValueCode?: string | null;
    percent: number;
    validFrom: string;
    validTo: string;
    justification: string;
    supersedesDiscountRuleId?: string | null;
    counterpartyIds?: string[] | null;
}

export async function fetchPriceTypeCodes(): Promise<string[]> {
    const result = await adminApi(PriceTypeCodesDocument);
    return result.priceTypeCodes;
}

export interface FacetOption {
    code: string;
    name: string;
    values: { code: string; name: string }[];
}

export async function fetchFacets(): Promise<FacetOption[]> {
    const { discountFacetOptions } = await adminApi(DiscountFacetsDocument);
    return discountFacetOptions;
}

export async function requestDiscountGrant(input: DiscountGrantInput): Promise<{ id: string }> {
    const result = await adminApi(RequestDiscountGrantDocument, { input });
    return result.requestDiscountGrant;
}

export interface ExpiringDiscountGrant {
    id: string;
    validTo: string;
    counterparties: { id: string; legalName: string }[];
}

export async function fetchExpiringDiscountGrants(
    withinDays: number,
): Promise<ExpiringDiscountGrant[]> {
    const result = await adminApi(ExpiringDiscountGrantsDocument, { withinDays });
    return result.expiringDiscountGrants;
}

export interface CounterpartyOption {
    value: string;
    label: string;
}

export async function searchDiscountCounterparties(term: string): Promise<CounterpartyOption[]> {
    const result = await adminApi(DiscountCounterpartySearchDocument, { search: term.trim() });
    return result.counterparties.items.map(c => ({ value: c.id, label: c.legalName }));
}
