import {
    sanitizeConditions,
    type FilterCondition,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import { adminApi } from './client';
import {
    CustomerClaimsPageDocument,
    OrderCorrectionsPageDocument,
    RelatedErpDocumentCountsDocument,
    SalesCorrectionsPageDocument,
    type ErpDocumentRowFieldsFragment,
    type ErpDocumentSort,
} from './generated/graphql';
import type { ErpDocumentKind } from './erpDocumentKinds';
import { ERP_DOCUMENT_FILTER_COLUMNS, conditionsToErpDocumentFilter } from './erpDocumentsFilter';

export type ErpDocumentRow = ErpDocumentRowFieldsFragment;

export interface ErpDocumentsListFilters {
    search: string;
    view: string;
    conditions: FilterCondition[];
}

// Links from an order or a customer card preset these; they are not Filter builder conditions.
export interface ErpDocumentsPreset {
    orderId: string;
    counterpartyId: string;
}

export type ErpDocumentsSortField = keyof ErpDocumentSort;
export interface ErpDocumentsSort {
    field: ErpDocumentsSortField;
    dir: 'ASC' | 'DESC';
}
export const DEFAULT_ERP_DOCUMENTS_SORT: ErpDocumentsSort = { field: 'date', dir: 'DESC' };
export const ERP_DOCUMENTS_SORT_FIELDS: ErpDocumentsSortField[] = [
    'number',
    'date',
    'amount',
    'customer',
];

export const BLANK_ERP_DOCUMENTS_FILTERS: ErpDocumentsListFilters = {
    search: '',
    view: 'all',
    conditions: [],
};

export function restoreErpDocumentsFilters(raw: unknown): ErpDocumentsListFilters {
    const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
    return {
        search: typeof r.search === 'string' ? r.search : '',
        view: 'all',
        conditions: sanitizeConditions(r.conditions, ERP_DOCUMENT_FILTER_COLUMNS),
    };
}

const PAGE_DOCUMENTS = {
    customerClaim: CustomerClaimsPageDocument,
    salesCorrection: SalesCorrectionsPageDocument,
    orderCorrection: OrderCorrectionsPageDocument,
};

export async function fetchErpDocuments(
    kind: ErpDocumentKind,
    filters: ErpDocumentsListFilters,
    preset: ErpDocumentsPreset,
    page: number,
    pageSize: number,
    sort: ErpDocumentsSort,
): Promise<{ items: ErpDocumentRow[]; totalItems: number }> {
    const filter = {
        ...conditionsToErpDocumentFilter(filters.conditions),
        ...(preset.orderId ? { orderId: { eq: preset.orderId } } : {}),
        ...(preset.counterpartyId ? { counterpartyId: { eq: preset.counterpartyId } } : {}),
    };
    const result = await adminApi(PAGE_DOCUMENTS[kind], {
        list: {
            skip: (page - 1) * pageSize,
            take: pageSize,
            search: filters.search || undefined,
            filter: Object.keys(filter).length ? filter : undefined,
            sort: { [sort.field]: sort.dir },
        },
    });
    return result.page;
}

export async function fetchRelatedErpDocumentCounts(
    orderId: string | null,
    counterpartyId: string | null,
): Promise<Record<ErpDocumentKind, number>> {
    const { counts } = await adminApi(RelatedErpDocumentCountsDocument, {
        orderId: orderId ?? undefined,
        counterpartyId: counterpartyId ?? undefined,
    });
    return {
        customerClaim: counts.customerClaims,
        salesCorrection: counts.salesCorrections,
        orderCorrection: counts.orderCorrections,
    };
}
