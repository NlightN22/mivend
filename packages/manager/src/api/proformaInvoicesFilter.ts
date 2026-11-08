import { toVendureFilter } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import type { FilterCondition } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import { toFilterColumns } from '@mivend/ui-kit/src/components/MvAdvancedDataTable/advancedDataTableTypes';
import { PROFORMA_INVOICES_COLUMNS } from '../components/proforma-invoices/proformaInvoicesColumns';
import type { ProformaInvoiceFilterParameter } from './generated/graphql';

export const PROFORMA_INVOICES_FILTER_COLUMNS = toFilterColumns(PROFORMA_INVOICES_COLUMNS);

// The server takes the builder's own shape, so no field needs special handling.
export function conditionsToProformaInvoicesFilter(
    conditions: FilterCondition[],
): ProformaInvoiceFilterParameter | undefined {
    const filter = toVendureFilter(conditions, PROFORMA_INVOICES_FILTER_COLUMNS);
    return Object.keys(filter).length ? (filter as ProformaInvoiceFilterParameter) : undefined;
}
