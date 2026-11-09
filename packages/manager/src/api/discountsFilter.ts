import { toVendureFilter } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import type { FilterCondition } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import { toFilterColumns } from '@mivend/ui-kit/src/components/MvAdvancedDataTable/advancedDataTableTypes';
import { DISCOUNTS_COLUMNS } from '../components/discounts/discountsColumns';
import type { DiscountRegistryFilterParameter } from './generated/graphql';

export const DISCOUNTS_FILTER_COLUMNS = toFilterColumns(DISCOUNTS_COLUMNS);

// The server takes the builder's own shape, so no field needs special handling.
export function conditionsToDiscountsFilter(
    conditions: FilterCondition[],
): DiscountRegistryFilterParameter | undefined {
    const filter = toVendureFilter(conditions, DISCOUNTS_FILTER_COLUMNS);
    return Object.keys(filter).length ? (filter as DiscountRegistryFilterParameter) : undefined;
}
