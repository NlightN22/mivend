import {
    conditionsFromQuery,
    conditionsToQuery,
    toVendureFilter,
    type FilterCondition,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import { toFilterColumns } from '@mivend/ui-kit/src/components/MvAdvancedDataTable/advancedDataTableTypes';
import {
    buildActivationColumns,
    UNASSIGNED_BRANCH,
} from '../components/bulk-operations/activationColumns';
import { READINESS_VALUES } from '../components/bulk-operations/activationReadiness';
import { mergeFilters } from './orders-filter';
import type { CounterpartyFilterParameter } from './generated/graphql';

export interface ActivationFilters {
    search: string;
    view: string;
    conditions: FilterCondition[];
}

export const BLANK_ACTIVATION_FILTERS: ActivationFilters = {
    search: '',
    view: 'all',
    conditions: [],
};

export const ACTIVATION_VIEWS = [{ key: 'all' }, ...READINESS_VALUES.map(value => ({ key: value }))];

export const ACTIVATION_FILTER_COLUMNS = toFilterColumns(buildActivationColumns([]));

export function readinessOfView(view: string): string | undefined {
    return READINESS_VALUES.find(v => v === view);
}

// "Unassigned" is a null branch, not a value: it becomes an emptiness test on the branch id.
export function conditionsToCounterpartyFilter(
    conditions: FilterCondition[],
): CounterpartyFilterParameter {
    const generic: FilterCondition[] = [];
    let unassigned: Record<string, unknown> | undefined;
    for (const c of conditions) {
        if (c.columnKey === 'branch' && c.value === UNASSIGNED_BRANCH)
            unassigned = { isNull: c.operator === 'eq' };
        else generic.push(c);
    }
    const filter = toVendureFilter(generic, ACTIVATION_FILTER_COLUMNS);
    return (
        unassigned ? mergeFilters(filter, { branchId: unassigned }) : filter
    ) as CounterpartyFilterParameter;
}

export function activationConditionsToUrl(conditions: FilterCondition[]): string {
    return conditionsToQuery(conditions);
}

export function activationConditionsFromUrl(value: string): FilterCondition[] {
    return conditionsFromQuery(value, ACTIVATION_FILTER_COLUMNS);
}
