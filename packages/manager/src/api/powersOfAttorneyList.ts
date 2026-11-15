import {
    sanitizeConditions,
    toVendureFilter,
    type FilterCondition,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import { toFilterColumns } from '@mivend/ui-kit/src/components/MvAdvancedDataTable/advancedDataTableTypes';
import { adminApi } from './client';
import {
    PowersOfAttorneyPageDocument,
    type PowerOfAttorneyFilter,
    type PowerOfAttorneyRowFieldsFragment,
    type PowerOfAttorneySort,
} from './generated/graphql';
import { POWER_OF_ATTORNEY_COLUMNS } from '../components/erp-documents/powersOfAttorneyColumns';

export type PowerOfAttorneyRow = PowerOfAttorneyRowFieldsFragment;

export const POWER_OF_ATTORNEY_FILTER_COLUMNS = toFilterColumns(POWER_OF_ATTORNEY_COLUMNS);

export interface PowersOfAttorneyListFilters {
    search: string;
    view: string;
    conditions: FilterCondition[];
}

export type PowersOfAttorneySortField = keyof PowerOfAttorneySort;
export interface PowersOfAttorneySort {
    field: PowersOfAttorneySortField;
    dir: 'ASC' | 'DESC';
}
export const DEFAULT_POWERS_OF_ATTORNEY_SORT: PowersOfAttorneySort = {
    field: 'validUntil',
    dir: 'DESC',
};
export const POWERS_OF_ATTORNEY_SORT_FIELDS: PowersOfAttorneySortField[] = [
    'number',
    'holder',
    'validFrom',
    'validUntil',
    'customer',
];

export const BLANK_POWERS_OF_ATTORNEY_FILTERS: PowersOfAttorneyListFilters = {
    search: '',
    view: 'all',
    conditions: [],
};

export function restorePowersOfAttorneyFilters(raw: unknown): PowersOfAttorneyListFilters {
    const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
    return {
        search: typeof r.search === 'string' ? r.search : '',
        view: 'all',
        conditions: sanitizeConditions(r.conditions, POWER_OF_ATTORNEY_FILTER_COLUMNS),
    };
}

export async function fetchPowersOfAttorney(
    filters: PowersOfAttorneyListFilters,
    counterpartyId: string,
    page: number,
    pageSize: number,
    sort: PowersOfAttorneySort,
): Promise<{ items: PowerOfAttorneyRow[]; totalItems: number }> {
    const filter = {
        ...toVendureFilter(filters.conditions, POWER_OF_ATTORNEY_FILTER_COLUMNS),
        ...(counterpartyId ? { counterpartyId: { eq: counterpartyId } } : {}),
    } as PowerOfAttorneyFilter;
    const result = await adminApi(PowersOfAttorneyPageDocument, {
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
