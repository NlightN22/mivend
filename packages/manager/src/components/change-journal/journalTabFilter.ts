import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import type { FilterCondition } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import type { FilterOption } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterBuilderTypes';
import type { ChangeJournalFilter } from '../../api/changeJournal';
import { dateConditionRange, selectConditionValue } from '../../utils/dateConditionRange';
import { tr } from '../../utils/lazyLabels';

const NOT_FILTERED = { type: 'none' } as const;
const col = (field: string): string => tr(`changeJournal.tab.columns.${field}`);

export interface JournalColumnOptions {
    actions: FilterOption[];
    actors: FilterOption[];
    administrators: FilterOption[];
}

export const NO_JOURNAL_OPTIONS: JournalColumnOptions = {
    actions: [],
    actors: [],
    administrators: [],
};
export const JOURNAL_DEFAULT_SORT = { field: 'occurredAt', dir: 'DESC' } as const;

// Identifying column first, event date second; the server orders by date, newest first, so no column sorts.
// Source is not filtered: it is a free-form route or task name the server cannot match as a set.
export function buildJournalColumns(options: JournalColumnOptions): AdvancedDataTableColumn[] {
    return [
        {
            field: 'summary',
            header: col('summary'),
            width: 300,
            priority: 10,
            minWidth: 200,
            required: true,
            filterConfig: NOT_FILTERED,
            filterType: 'string',
            mobile: { primary: true },
        },
        {
            field: 'occurredAt',
            header: col('occurredAt'),
            width: 170,
            priority: 9,
            minWidth: 160,
            filterConfig: NOT_FILTERED,
            filterType: 'date',
            filterOperators: ['before', 'after', 'between'],
        },
        {
            field: 'action',
            header: col('action'),
            width: 130,
            priority: 8,
            minWidth: 110,
            filterConfig: NOT_FILTERED,
            filterType: 'select',
            filterOptions: options.actions,
            filterOperators: ['eq'],
            mobile: { badge: true },
        },
        {
            field: 'actor',
            header: col('actor'),
            width: 260,
            priority: 6,
            minWidth: 180,
            filterConfig: NOT_FILTERED,
            filterType: 'select',
            filterOptions: options.actors,
            filterOperators: ['eq'],
        },
        {
            field: 'administrator',
            header: col('administrator'),
            width: 180,
            priority: 3,
            minWidth: 140,
            filterConfig: NOT_FILTERED,
            filterType: 'select',
            filterOptions: options.administrators,
            filterOperators: ['eq'],
            mobile: { hidden: true },
        },
        {
            field: 'source',
            header: col('source'),
            width: 220,
            priority: 2,
            minWidth: 160,
            filterConfig: NOT_FILTERED,
            mobile: { hidden: true },
        },
    ];
}

export function toJournalFilter(
    search: string,
    conditions: FilterCondition[],
): ChangeJournalFilter {
    const range = dateConditionRange(conditions, 'occurredAt');
    return {
        search: search.trim() || undefined,
        action: selectConditionValue(conditions, 'action'),
        actorType: selectConditionValue(conditions, 'actor'),
        administratorId: selectConditionValue(conditions, 'administrator'),
        occurredAfter: range.from,
        occurredBefore: range.to,
    };
}
