import type { DataTableSortMeta, AdvancedDataTableColumn } from '@mivend/ui-kit';
import type { CounterpartySortParameter } from '../../api/counterpartyPortalAccess';

// Column key differs from backend sort key (manager -> managerErpId).
// An unknown sort field makes GraphQL reject the whole query, not just that column.
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
