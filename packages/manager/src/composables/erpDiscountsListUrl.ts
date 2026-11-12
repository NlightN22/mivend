import {
    DEFAULT_ERP_DISCOUNTS_SORT,
    ERP_DISCOUNTS_SORT_FIELDS,
    isErpDiscountsView,
    type ErpDiscountsListFilters,
    type ErpDiscountsSort,
} from '../api/erpDiscountsList';

export interface ErpDiscountsUrlState {
    [key: string]: string;
    search: string;
    view: string;
    sortField: string;
    sortDir: string;
    pageSize: string;
}

export const ERP_DISCOUNTS_URL_DEFAULTS: ErpDiscountsUrlState = {
    search: '',
    view: 'all',
    sortField: DEFAULT_ERP_DISCOUNTS_SORT.field,
    sortDir: DEFAULT_ERP_DISCOUNTS_SORT.dir,
    pageSize: '10',
};

// The keys sit under their own prefix so they never collide with the requests list on the same page.
export const ERP_URL_PREFIX = 'erp.';

export function toErpDiscountsUrlState(
    filters: ErpDiscountsListFilters,
    sort: ErpDiscountsSort,
    pageSize: number,
): ErpDiscountsUrlState {
    return {
        search: filters.search,
        view: filters.view,
        sortField: sort.field,
        sortDir: sort.dir,
        pageSize: String(pageSize),
    };
}

export function fromErpDiscountsUrlState(url: ErpDiscountsUrlState): {
    filters: ErpDiscountsListFilters;
    sort: ErpDiscountsSort;
    pageSize: number;
} {
    const pageSize = Number(url.pageSize);
    return {
        filters: {
            search: url.search,
            view: isErpDiscountsView(url.view) ? url.view : 'all',
        },
        sort: {
            field:
                ERP_DISCOUNTS_SORT_FIELDS.find(f => f === url.sortField) ??
                DEFAULT_ERP_DISCOUNTS_SORT.field,
            dir: url.sortDir === 'ASC' ? 'ASC' : 'DESC',
        },
        pageSize: pageSize > 0 ? pageSize : 10,
    };
}
