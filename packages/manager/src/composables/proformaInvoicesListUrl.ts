import {
    BLANK_PROFORMA_INVOICES_FILTERS,
    isProformaInvoicesView,
    type ProformaInvoicesListFilters,
} from '../api/proformaInvoicesList';

export interface ProformaInvoicesUrlState {
    [key: string]: string;
    search: string;
    view: string;
    counterpartyId: string;
    pageSize: string;
}

export const PROFORMA_INVOICES_URL_DEFAULTS: ProformaInvoicesUrlState = {
    search: '',
    view: 'all',
    counterpartyId: '',
    pageSize: '10',
};

export function toProformaInvoicesUrlState(
    filters: ProformaInvoicesListFilters,
    counterpartyId: string,
    pageSize: number,
): ProformaInvoicesUrlState {
    return {
        search: filters.search,
        view: filters.view,
        counterpartyId,
        pageSize: String(pageSize),
    };
}

export function fromProformaInvoicesUrlState(url: ProformaInvoicesUrlState): {
    filters: ProformaInvoicesListFilters;
    counterpartyId: string;
    pageSize: number;
} {
    const pageSize = Number(url.pageSize);
    return {
        filters: {
            ...BLANK_PROFORMA_INVOICES_FILTERS,
            search: url.search,
            view: isProformaInvoicesView(url.view) ? url.view : 'all',
        },
        counterpartyId: url.counterpartyId,
        pageSize: pageSize > 0 ? pageSize : 10,
    };
}
