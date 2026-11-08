import {
    conditionsFromQuery,
    conditionsToQuery,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import {
    BLANK_PROFORMA_INVOICES_FILTERS,
    DEFAULT_PROFORMA_INVOICES_SORT,
    PROFORMA_INVOICES_SORT_FIELDS,
    isProformaInvoicesView,
    type ProformaInvoicesListFilters,
    type ProformaInvoicesSort,
} from '../api/proformaInvoicesList';
import { PROFORMA_INVOICES_FILTER_COLUMNS } from '../api/proformaInvoicesFilter';

export interface ProformaInvoicesUrlState {
    [key: string]: string;
    search: string;
    view: string;
    filters: string;
    sortField: string;
    sortDir: string;
    counterpartyId: string;
    pageSize: string;
}

export const PROFORMA_INVOICES_URL_DEFAULTS: ProformaInvoicesUrlState = {
    search: '',
    view: 'all',
    filters: '',
    sortField: DEFAULT_PROFORMA_INVOICES_SORT.field,
    sortDir: DEFAULT_PROFORMA_INVOICES_SORT.dir,
    counterpartyId: '',
    pageSize: '10',
};

export function toProformaInvoicesUrlState(
    filters: ProformaInvoicesListFilters,
    counterpartyId: string,
    sort: ProformaInvoicesSort,
    pageSize: number,
): ProformaInvoicesUrlState {
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

export function fromProformaInvoicesUrlState(url: ProformaInvoicesUrlState): {
    filters: ProformaInvoicesListFilters;
    sort: ProformaInvoicesSort;
    counterpartyId: string;
    pageSize: number;
} {
    const pageSize = Number(url.pageSize);
    return {
        filters: {
            ...BLANK_PROFORMA_INVOICES_FILTERS,
            search: url.search,
            view: isProformaInvoicesView(url.view) ? url.view : 'all',
            conditions: conditionsFromQuery(url.filters, PROFORMA_INVOICES_FILTER_COLUMNS),
        },
        sort: {
            field:
                PROFORMA_INVOICES_SORT_FIELDS.find(f => f === url.sortField) ??
                DEFAULT_PROFORMA_INVOICES_SORT.field,
            dir: url.sortDir === 'ASC' ? 'ASC' : 'DESC',
        },
        counterpartyId: url.counterpartyId,
        pageSize: pageSize > 0 ? pageSize : 10,
    };
}
