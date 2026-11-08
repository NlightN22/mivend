import {
    conditionsFromQuery,
    conditionsToQuery,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import {
    ALL_SETTLEMENT_TYPES,
    BLANK_SETTLEMENTS_FILTERS,
    DEFAULT_SETTLEMENTS_SORT,
    SETTLEMENTS_SORT_FIELDS,
    type SettlementsListFilters,
    type SettlementsSort,
} from '../api/settlementsList';
import { SETTLEMENTS_FILTER_COLUMNS } from '../api/settlementsFilter';

export interface SettlementsUrlState {
    [key: string]: string;
    search: string;
    view: string;
    filters: string;
    sortField: string;
    sortDir: string;
    counterpartyId: string;
    pageSize: string;
}

export const SETTLEMENTS_URL_DEFAULTS: SettlementsUrlState = {
    search: '',
    view: ALL_SETTLEMENT_TYPES,
    filters: '',
    sortField: DEFAULT_SETTLEMENTS_SORT.field,
    sortDir: DEFAULT_SETTLEMENTS_SORT.dir,
    counterpartyId: '',
    pageSize: '10',
};

export function toSettlementsUrlState(
    filters: SettlementsListFilters,
    counterpartyId: string,
    sort: SettlementsSort,
    pageSize: number,
): SettlementsUrlState {
    return {
        search: filters.search,
        view: filters.view,
        filters: conditionsToQuery(filters.conditions),
        sortField: sort.field,
        sortDir: sort.dir,
        counterpartyId,
        pageSize: String(pageSize),
    };
}

export function fromSettlementsUrlState(url: SettlementsUrlState): {
    filters: SettlementsListFilters;
    sort: SettlementsSort;
    counterpartyId: string;
    pageSize: number;
} {
    const pageSize = Number(url.pageSize);
    return {
        filters: {
            ...BLANK_SETTLEMENTS_FILTERS,
            search: url.search,
            view: url.view || ALL_SETTLEMENT_TYPES,
            conditions: conditionsFromQuery(url.filters, SETTLEMENTS_FILTER_COLUMNS),
        },
        sort: {
            field:
                SETTLEMENTS_SORT_FIELDS.find(f => f === url.sortField) ??
                DEFAULT_SETTLEMENTS_SORT.field,
            dir: url.sortDir === 'ASC' ? 'ASC' : 'DESC',
        },
        counterpartyId: url.counterpartyId,
        pageSize: pageSize > 0 ? pageSize : 10,
    };
}
