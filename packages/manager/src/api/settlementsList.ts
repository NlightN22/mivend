import {
    sanitizeConditions,
    type FilterCondition,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import { adminApi } from './client';
import { SettlementsPageDocument, type SettlementSortParameter } from './generated/graphql';
import { SETTLEMENTS_FILTER_COLUMNS, conditionsToSettlementsFilter } from './settlementsFilter';
import type { SettlementListItem } from './settlements';

// 'all' or a document type code; the codes come from the data, so any string is accepted.
export const ALL_SETTLEMENT_TYPES = 'all';

export interface SettlementsListFilters {
    // Matches the document number, the customer name and its INN, and the order codes on the server.
    search: string;
    view: string;
    // Toolbar Filter builder, ANDed with the view.
    conditions: FilterCondition[];
}

export type SettlementsSortField = keyof SettlementSortParameter;
export interface SettlementsSort {
    field: SettlementsSortField;
    dir: 'ASC' | 'DESC';
}
export const DEFAULT_SETTLEMENTS_SORT: SettlementsSort = { field: 'date', dir: 'DESC' };
export const SETTLEMENTS_SORT_FIELDS: SettlementsSortField[] = [
    'typeLabel',
    'number',
    'date',
    'amount',
    'customer',
];

export const BLANK_SETTLEMENTS_FILTERS: SettlementsListFilters = {
    search: '',
    view: ALL_SETTLEMENT_TYPES,
    conditions: [],
};

// Rebuilds list filters from a stored view; anything missing or of the wrong type falls back to blank.
export function restoreSettlementsFilters(raw: unknown): SettlementsListFilters {
    const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
    return {
        search: typeof r.search === 'string' ? r.search : '',
        view: typeof r.view === 'string' && r.view ? r.view : ALL_SETTLEMENT_TYPES,
        conditions: sanitizeConditions(r.conditions, SETTLEMENTS_FILTER_COLUMNS),
    };
}

export async function fetchSettlementsList(
    filters: SettlementsListFilters,
    counterpartyId: string,
    page: number,
    pageSize: number,
    sort: SettlementsSort,
): Promise<{ items: SettlementListItem[]; totalItems: number }> {
    const result = await adminApi(SettlementsPageDocument, {
        options: {
            skip: (page - 1) * pageSize,
            take: pageSize,
            documentType: filters.view === ALL_SETTLEMENT_TYPES ? undefined : filters.view,
            search: filters.search || undefined,
            filter: conditionsToSettlementsFilter(filters.conditions),
            sort: { [sort.field]: sort.dir },
        },
        counterpartyId: counterpartyId || undefined,
    });
    return result.visibleSettlementDocuments;
}
