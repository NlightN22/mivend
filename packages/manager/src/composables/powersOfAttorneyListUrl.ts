import {
    conditionsFromQuery,
    conditionsToQuery,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import {
    BLANK_POWERS_OF_ATTORNEY_FILTERS,
    DEFAULT_POWERS_OF_ATTORNEY_SORT,
    POWERS_OF_ATTORNEY_SORT_FIELDS,
    POWER_OF_ATTORNEY_FILTER_COLUMNS,
    type PowersOfAttorneyListFilters,
    type PowersOfAttorneySort,
} from '../api/powersOfAttorneyList';

export interface PowersOfAttorneyUrlState {
    [key: string]: string;
    search: string;
    filters: string;
    sortField: string;
    sortDir: string;
    counterpartyId: string;
    pageSize: string;
}

export const POWERS_OF_ATTORNEY_URL_DEFAULTS: PowersOfAttorneyUrlState = {
    search: '',
    filters: '',
    sortField: DEFAULT_POWERS_OF_ATTORNEY_SORT.field,
    sortDir: DEFAULT_POWERS_OF_ATTORNEY_SORT.dir,
    counterpartyId: '',
    pageSize: '10',
};

export function toPowersOfAttorneyUrlState(
    filters: PowersOfAttorneyListFilters,
    counterpartyId: string,
    sort: PowersOfAttorneySort,
    pageSize: number,
): PowersOfAttorneyUrlState {
    return {
        search: filters.search,
        filters: conditionsToQuery(filters.conditions),
        sortField: sort.field,
        sortDir: sort.dir,
        counterpartyId,
        pageSize: String(pageSize),
    };
}

export function fromPowersOfAttorneyUrlState(url: PowersOfAttorneyUrlState): {
    filters: PowersOfAttorneyListFilters;
    sort: PowersOfAttorneySort;
    counterpartyId: string;
    pageSize: number;
} {
    const pageSize = Number(url.pageSize);
    return {
        filters: {
            ...BLANK_POWERS_OF_ATTORNEY_FILTERS,
            search: url.search,
            conditions: conditionsFromQuery(url.filters, POWER_OF_ATTORNEY_FILTER_COLUMNS),
        },
        sort: {
            field:
                POWERS_OF_ATTORNEY_SORT_FIELDS.find(f => f === url.sortField) ??
                DEFAULT_POWERS_OF_ATTORNEY_SORT.field,
            dir: url.sortDir === 'ASC' ? 'ASC' : 'DESC',
        },
        counterpartyId: /^\d{1,9}$/.test(url.counterpartyId) ? url.counterpartyId : '',
        pageSize: pageSize > 0 ? pageSize : 10,
    };
}
