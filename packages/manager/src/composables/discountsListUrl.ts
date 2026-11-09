import {
    conditionsFromQuery,
    conditionsToQuery,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import {
    BLANK_DISCOUNTS_FILTERS,
    DEFAULT_DISCOUNTS_SORT,
    DISCOUNTS_SORT_FIELDS,
    isDiscountsView,
    type DiscountsListFilters,
    type DiscountsSort,
} from '../api/discountsList';
import { DISCOUNTS_FILTER_COLUMNS } from '../api/discountsFilter';

export interface DiscountsUrlState {
    [key: string]: string;
    search: string;
    view: string;
    filters: string;
    sortField: string;
    sortDir: string;
    pageSize: string;
}

export const DISCOUNTS_URL_DEFAULTS: DiscountsUrlState = {
    search: '',
    view: 'all',
    filters: '',
    sortField: DEFAULT_DISCOUNTS_SORT.field,
    sortDir: DEFAULT_DISCOUNTS_SORT.dir,
    pageSize: '10',
};

export function toDiscountsUrlState(
    filters: DiscountsListFilters,
    sort: DiscountsSort,
    pageSize: number,
): DiscountsUrlState {
    return {
        search: filters.search,
        view: filters.view,
        filters: conditionsToQuery(filters.conditions),
        sortField: sort.field,
        sortDir: sort.dir,
        pageSize: String(pageSize),
    };
}

export function fromDiscountsUrlState(url: DiscountsUrlState): {
    filters: DiscountsListFilters;
    sort: DiscountsSort;
    pageSize: number;
} {
    const pageSize = Number(url.pageSize);
    return {
        filters: {
            ...BLANK_DISCOUNTS_FILTERS,
            search: url.search,
            view: isDiscountsView(url.view) ? url.view : 'all',
            conditions: conditionsFromQuery(url.filters, DISCOUNTS_FILTER_COLUMNS),
        },
        sort: {
            field:
                DISCOUNTS_SORT_FIELDS.find(f => f === url.sortField) ??
                DEFAULT_DISCOUNTS_SORT.field,
            dir: url.sortDir === 'ASC' ? 'ASC' : 'DESC',
        },
        pageSize: pageSize > 0 ? pageSize : 10,
    };
}
