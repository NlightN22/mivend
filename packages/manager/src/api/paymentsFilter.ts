import { toVendureFilter } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import type { FilterCondition } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import { toFilterColumns } from '@mivend/ui-kit/src/components/MvAdvancedDataTable/advancedDataTableTypes';
import { PAYMENTS_COLUMNS } from '../components/payments/paymentsColumns';
import type { PaymentFilterParameter } from './generated/graphql';

export const PAYMENTS_FILTER_COLUMNS = toFilterColumns(PAYMENTS_COLUMNS);

// The server takes the builder's own shape, so no field needs special handling.
export function conditionsToPaymentsFilter(
    conditions: FilterCondition[],
): PaymentFilterParameter | undefined {
    const filter = toVendureFilter(conditions, PAYMENTS_FILTER_COLUMNS);
    return Object.keys(filter).length ? (filter as PaymentFilterParameter) : undefined;
}
