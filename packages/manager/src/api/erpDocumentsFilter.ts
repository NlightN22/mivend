import { toVendureFilter } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import type { FilterCondition } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import { toFilterColumns } from '@mivend/ui-kit/src/components/MvAdvancedDataTable/advancedDataTableTypes';
import { ERP_DOCUMENT_COLUMNS } from '../components/erp-documents/erpDocumentsColumns';
import type { ErpDocumentFilter } from './generated/graphql';

export const ERP_DOCUMENT_FILTER_COLUMNS = toFilterColumns(ERP_DOCUMENT_COLUMNS);

export function conditionsToErpDocumentFilter(
    conditions: FilterCondition[],
): ErpDocumentFilter | undefined {
    const filter = toVendureFilter(conditions, ERP_DOCUMENT_FILTER_COLUMNS);
    return Object.keys(filter).length ? (filter as ErpDocumentFilter) : undefined;
}
