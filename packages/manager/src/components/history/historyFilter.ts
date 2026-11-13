import type { FilterCondition } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import type { EntityVersionListOptions } from '../../api/history';
import { dateConditionRange, selectConditionValue } from '../../utils/dateConditionRange';

export const SYSTEM_CHANGER = 'system';

export function toHistoryOptions(
    search: string,
    conditions: FilterCondition[],
): EntityVersionListOptions {
    const changedBy = selectConditionValue(conditions, 'changedBy');
    const range = dateConditionRange(conditions, 'createdAt');
    return {
        search: search.trim() || undefined,
        action: selectConditionValue(conditions, 'action'),
        entityName: selectConditionValue(conditions, 'entityName'),
        system: changedBy === SYSTEM_CHANGER ? true : undefined,
        administratorId: changedBy && changedBy !== SYSTEM_CHANGER ? changedBy : undefined,
        createdAfter: range.from,
        createdBefore: range.to,
    };
}
