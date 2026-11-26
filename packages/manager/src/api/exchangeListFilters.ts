import {
    toVendureFilter,
    type FilterColumn,
    type FilterCondition,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import type {
    ConsistencyReportListOptions,
    IntegrationInboxIssueListOptions,
    IntegrationOutboxProblemListOptions,
} from './generated/graphql';

export interface ListRequest {
    conditions: FilterCondition[];
    view: string;
    search: string;
    sort: { field: string; dir: 'ASC' | 'DESC' };
    skip: number;
    take: number;
}

type Filter = Record<string, unknown>;

// Builder conditions, the chip and the search term must all hold: the search fields are OR-ed with each other
// at the top level, everything else sits in `_and` groups, which the server ANDs with them.
function toServerFilter(
    conditions: FilterCondition[],
    columns: FilterColumn[],
    fixed: Filter,
    search: string,
    searchFields: string[],
): { filter: Filter; filterOperator: 'AND' | 'OR' } {
    const built = toVendureFilter(conditions, columns);
    const groups: Filter[] = [];
    for (const [field, operators] of Object.entries({ ...built, ...fixed })) {
        if (field === '_and') groups.push(...(operators as Filter[]));
        else groups.push({ [field]: operators });
    }
    const term = search.trim();
    const filter: Filter = groups.length ? { _and: groups } : {};
    if (term) for (const f of searchFields) filter[f] = { contains: term };
    return { filter, filterOperator: term ? 'OR' : 'AND' };
}

function paging(req: ListRequest): { skip: number; take: number } {
    return { skip: req.skip, take: req.take };
}

export function toInboxOptions(
    req: ListRequest,
    columns: FilterColumn[],
): IntegrationInboxIssueListOptions {
    const fixed = req.view === 'all' ? {} : { status: { eq: req.view } };
    return {
        ...paging(req),
        ...toServerFilter(req.conditions, columns, fixed, req.search, ['entityId', 'lastError']),
        sort: { [req.sort.field]: req.sort.dir },
    } as IntegrationInboxIssueListOptions;
}

export function toOutboxOptions(
    req: ListRequest,
    columns: FilterColumn[],
): IntegrationOutboxProblemListOptions {
    const fixed = req.view === 'all' ? {} : { status: { eq: req.view } };
    return {
        ...paging(req),
        ...toServerFilter(req.conditions, columns, fixed, req.search, ['eventId', 'lastError']),
        sort: { [req.sort.field]: req.sort.dir },
    } as IntegrationOutboxProblemListOptions;
}

const REPORT_FILTER_KEYS = ['source', 'type', 'severity', 'entityType'] as const;

// The reports query takes one exact value per field, not the generic filter.
export function toReportOptions(req: ListRequest): ConsistencyReportListOptions {
    const options: ConsistencyReportListOptions = {
        ...paging(req),
        status: req.view === 'all' ? undefined : req.view,
    };
    for (const c of req.conditions) {
        const key = REPORT_FILTER_KEYS.find(k => k === c.columnKey);
        if (key && c.operator === 'eq' && typeof c.value === 'string') options[key] = c.value;
    }
    return options;
}
