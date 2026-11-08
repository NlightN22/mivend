import {
    conditionsFromQuery,
    conditionsToQuery,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import {
    BLANK_PAYMENTS_FILTERS,
    DEFAULT_PAYMENTS_SORT,
    PAYMENTS_SORT_FIELDS,
    isPaymentsView,
    type PaymentsListFilters,
    type PaymentsSort,
} from '../api/paymentsList';
import { PAYMENTS_FILTER_COLUMNS } from '../api/paymentsFilter';

export interface PaymentsUrlState {
    [key: string]: string;
    search: string;
    view: string;
    filters: string;
    sortField: string;
    sortDir: string;
    counterpartyId: string;
    pageSize: string;
}

export const PAYMENTS_URL_DEFAULTS: PaymentsUrlState = {
    search: '',
    view: 'all',
    filters: '',
    sortField: DEFAULT_PAYMENTS_SORT.field,
    sortDir: DEFAULT_PAYMENTS_SORT.dir,
    counterpartyId: '',
    pageSize: '10',
};

export function toPaymentsUrlState(
    filters: PaymentsListFilters,
    counterpartyId: string,
    sort: PaymentsSort,
    pageSize: number,
): PaymentsUrlState {
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

export function fromPaymentsUrlState(url: PaymentsUrlState): {
    filters: PaymentsListFilters;
    sort: PaymentsSort;
    counterpartyId: string;
    pageSize: number;
} {
    const pageSize = Number(url.pageSize);
    return {
        filters: {
            ...BLANK_PAYMENTS_FILTERS,
            search: url.search,
            view: isPaymentsView(url.view) ? url.view : 'all',
            conditions: conditionsFromQuery(url.filters, PAYMENTS_FILTER_COLUMNS),
        },
        sort: {
            field:
                PAYMENTS_SORT_FIELDS.find(f => f === url.sortField) ?? DEFAULT_PAYMENTS_SORT.field,
            dir: url.sortDir === 'ASC' ? 'ASC' : 'DESC',
        },
        counterpartyId: url.counterpartyId,
        pageSize: pageSize > 0 ? pageSize : 10,
    };
}
