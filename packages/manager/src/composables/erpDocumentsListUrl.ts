import {
    conditionsFromQuery,
    conditionsToQuery,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import {
    BLANK_ERP_DOCUMENTS_FILTERS,
    DEFAULT_ERP_DOCUMENTS_SORT,
    ERP_DOCUMENTS_SORT_FIELDS,
    type ErpDocumentsListFilters,
    type ErpDocumentsPreset,
    type ErpDocumentsSort,
} from '../api/erpDocumentsList';
import { ERP_DOCUMENT_FILTER_COLUMNS } from '../api/erpDocumentsFilter';

export interface ErpDocumentsUrlState {
    [key: string]: string;
    search: string;
    filters: string;
    sortField: string;
    sortDir: string;
    orderId: string;
    counterpartyId: string;
    pageSize: string;
}

export const ERP_DOCUMENTS_URL_DEFAULTS: ErpDocumentsUrlState = {
    search: '',
    filters: '',
    sortField: DEFAULT_ERP_DOCUMENTS_SORT.field,
    sortDir: DEFAULT_ERP_DOCUMENTS_SORT.dir,
    orderId: '',
    counterpartyId: '',
    pageSize: '10',
};

export function toErpDocumentsUrlState(
    filters: ErpDocumentsListFilters,
    preset: ErpDocumentsPreset,
    sort: ErpDocumentsSort,
    pageSize: number,
): ErpDocumentsUrlState {
    return {
        search: filters.search,
        filters: conditionsToQuery(filters.conditions),
        sortField: sort.field,
        sortDir: sort.dir,
        orderId: preset.orderId,
        counterpartyId: preset.counterpartyId,
        pageSize: String(pageSize),
    };
}

const plainId = (value: string): string => (/^\d{1,9}$/.test(value) ? value : '');

export function fromErpDocumentsUrlState(url: ErpDocumentsUrlState): {
    filters: ErpDocumentsListFilters;
    sort: ErpDocumentsSort;
    preset: ErpDocumentsPreset;
    pageSize: number;
} {
    const pageSize = Number(url.pageSize);
    return {
        filters: {
            ...BLANK_ERP_DOCUMENTS_FILTERS,
            search: url.search,
            conditions: conditionsFromQuery(url.filters, ERP_DOCUMENT_FILTER_COLUMNS),
        },
        sort: {
            field:
                ERP_DOCUMENTS_SORT_FIELDS.find(f => f === url.sortField) ??
                DEFAULT_ERP_DOCUMENTS_SORT.field,
            dir: url.sortDir === 'ASC' ? 'ASC' : 'DESC',
        },
        preset: { orderId: plainId(url.orderId), counterpartyId: plainId(url.counterpartyId) },
        pageSize: pageSize > 0 ? pageSize : 10,
    };
}
