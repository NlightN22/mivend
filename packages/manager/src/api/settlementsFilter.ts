import { toVendureFilter } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import type { FilterCondition } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import { toFilterColumns } from '@mivend/ui-kit/src/components/MvAdvancedDataTable/advancedDataTableTypes';
import { SETTLEMENTS_COLUMNS } from '../components/settlements/settlementsColumns';
import type { SettlementFilterParameter } from './generated/graphql';

export const SETTLEMENTS_FILTER_COLUMNS = toFilterColumns(SETTLEMENTS_COLUMNS);

// The server takes the builder's own shape, so no field needs special handling.
export function conditionsToSettlementsFilter(
    conditions: FilterCondition[],
): SettlementFilterParameter | undefined {
    const filter = toVendureFilter(conditions, SETTLEMENTS_FILTER_COLUMNS);
    return Object.keys(filter).length ? (filter as SettlementFilterParameter) : undefined;
}
