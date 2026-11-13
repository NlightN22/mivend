import type { FilterCondition } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';

const DAY_MS = 24 * 60 * 60 * 1000;
const dayStart = (day: string): number => new Date(`${day}T00:00:00`).getTime();

export interface DateRange {
    from?: string;
    to?: string;
}

// Lower bound is inclusive, upper bound exclusive; a day condition covers the whole local day.
export function dateConditionRange(conditions: FilterCondition[], columnKey: string): DateRange {
    const range: DateRange = {};
    for (const c of conditions) {
        if (c.columnKey !== columnKey) continue;
        if (c.operator === 'between' && Array.isArray(c.value) && c.value.length === 2) {
            range.from = new Date(dayStart(c.value[0])).toISOString();
            range.to = new Date(dayStart(c.value[1]) + DAY_MS).toISOString();
        } else if (c.operator === 'before' && typeof c.value === 'string') {
            range.to = new Date(dayStart(c.value)).toISOString();
        } else if (c.operator === 'after' && typeof c.value === 'string') {
            range.from = new Date(dayStart(c.value) + DAY_MS).toISOString();
        }
    }
    return range;
}

export function selectConditionValue(
    conditions: FilterCondition[],
    columnKey: string,
): string | undefined {
    const c = conditions.find(x => x.columnKey === columnKey && x.operator === 'eq');
    return typeof c?.value === 'string' && c.value ? c.value : undefined;
}
