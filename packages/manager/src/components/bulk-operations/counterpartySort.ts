import type { DataTableSortMeta, AdvancedDataTableColumn } from '@mivend/ui-kit';
import type { CounterpartySortParameter } from '../../api/counterpartyPortalAccess';

// Extracted from CounterpartyActivationDataTable.vue for direct unit testing (this package has
// no jsdom/happy-dom, so a real @vue/test-utils `mount()` isn't available — see
// useTabSync.test.ts's own doc comment for the same constraint/pattern).
//
// Real bug this guards against: tableState.sort's `field` is the table COLUMN's own key (e.g.
// 'manager'), never the backend sort key — those two only happen to be spelled the same for
// shortName/inn/phone/officialEmail. The "manager" column's `sortField` is 'managerErpId', so
// sending `entry.field` directly sent `{ manager: 'DESC' }`, a field CounterpartySortParameter
// doesn't have — GraphQL then rejected the whole query, wiping every column's data, not just
// Manager's.
export function mapSortToApi(
    meta: DataTableSortMeta[],
    columns: AdvancedDataTableColumn[],
): CounterpartySortParameter {
    const [entry] = meta;
    if (!entry) return {};
    const col = columns.find(c => c.field === entry.field);
    if (!col?.sortField) return {};
    return { [col.sortField]: entry.order === 1 ? 'ASC' : 'DESC' } as CounterpartySortParameter;
}
