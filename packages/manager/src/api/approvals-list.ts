import {
    sanitizeConditions,
    type FilterCondition,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import { toFilterColumns } from '@mivend/ui-kit/src/components/MvAdvancedDataTable/advancedDataTableTypes';
import { ALL_COLUMNS } from '../components/approvals/approvalsColumns';
import { ApprovalsInboxDocument } from './generated/graphql';
import { adminApi } from './client';
import { tr } from '../utils/lazyLabels';
import type { ApprovalRequestPage } from './approvals';

export type ApprovalsView = 'awaiting' | 'mine' | 'all';

const viewLabel = (key: ApprovalsView): string => tr(`approvals.views.${key}`);

export const APPROVALS_VIEWS: { key: ApprovalsView; readonly label: string }[] = [
    {
        key: 'awaiting',
        get label() {
            return viewLabel('awaiting');
        },
    },
    {
        key: 'mine',
        get label() {
            return viewLabel('mine');
        },
    },
    {
        key: 'all',
        get label() {
            return viewLabel('all');
        },
    },
];

export type ApprovalSortField = 'id' | 'requestType' | 'status' | 'createdAt';

export interface ApprovalsSort {
    field: ApprovalSortField;
    dir: 'ASC' | 'DESC';
}

export interface ApprovalsListFilters {
    // Matches the request number on the server.
    search: string;
    view: ApprovalsView;
    conditions: FilterCondition[];
}

export const BLANK_APPROVALS_FILTERS: ApprovalsListFilters = {
    search: '',
    view: 'awaiting',
    conditions: [],
};

export const APPROVALS_FILTER_COLUMNS = toFilterColumns(ALL_COLUMNS);

export interface ApprovalsListOptionsInput {
    take: number;
    skip: number;
    search?: string;
    requestTypes?: string[];
    statuses?: string[];
    requestedByAdministratorId?: string;
    createdFrom?: string;
    createdTo?: string;
    sortField?: string;
    sortDir?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const dayStart = (day: string): number => new Date(`${day}T00:00:00`).getTime();

function asList(value: FilterCondition['value']): string[] {
    return Array.isArray(value) ? value : [value];
}

// A later condition on the same field replaces an earlier one: the server takes one value per field.
export function conditionsToOptions(
    conditions: FilterCondition[],
): Partial<ApprovalsListOptionsInput> {
    const out: Partial<ApprovalsListOptionsInput> = {};
    for (const c of conditions) {
        const values = asList(c.value).filter(Boolean);
        if (!values.length) continue;
        if (c.columnKey === 'type') out.requestTypes = values;
        else if (c.columnKey === 'status') out.statuses = values;
        else if (c.columnKey === 'requestedBy') out.requestedByAdministratorId = values[0];
        else if (c.columnKey === 'createdAt') {
            const [from, to] = values;
            if (c.operator === 'before') out.createdTo = new Date(dayStart(from)).toISOString();
            else if (c.operator === 'after')
                out.createdFrom = new Date(dayStart(from) + DAY_MS).toISOString();
            else if (c.operator === 'between' && to) {
                out.createdFrom = new Date(dayStart(from)).toISOString();
                out.createdTo = new Date(dayStart(to) + DAY_MS).toISOString();
            }
        }
    }
    return out;
}

export interface ApprovalsListResult {
    page: ApprovalRequestPage;
    counts: Record<ApprovalsView, number>;
}

// Counts for all three tabs follow the same filters; only the active tab loads rows.
export async function fetchApprovalsList(
    filters: ApprovalsListFilters,
    sort: ApprovalsSort,
    page: number,
    pageSize: number,
    me: string,
): Promise<ApprovalsListResult> {
    const base = {
        ...conditionsToOptions(filters.conditions),
        ...(filters.search ? { search: filters.search } : {}),
    };
    const rows = {
        ...base,
        take: pageSize,
        skip: (page - 1) * pageSize,
        sortField: sort.field,
        sortDir: sort.dir,
    };
    const countOnly = { ...base, take: 0 };
    const mine = { ...base, requestedByAdministratorId: me };
    const result = await adminApi(ApprovalsInboxDocument, {
        awaitingOptions: filters.view === 'awaiting' ? rows : countOnly,
        allInvolvedOptions: filters.view === 'all' ? rows : countOnly,
        mineOptions: filters.view === 'mine' ? { ...rows, ...mine } : { ...countOnly, ...mine },
    });
    const inbox = result.myApprovalsInbox;
    const active =
        filters.view === 'awaiting'
            ? inbox.awaitingMyDecision
            : filters.view === 'all'
              ? inbox.allInvolved
              : result.mine.allInvolved;
    return {
        page: active,
        counts: {
            awaiting: inbox.awaitingMyDecision.totalItems,
            all: inbox.allInvolved.totalItems,
            mine: result.mine.allInvolved.totalItems,
        },
    };
}

export function restoreApprovalsFilters(raw: unknown): ApprovalsListFilters {
    const restored: ApprovalsListFilters = { ...BLANK_APPROVALS_FILTERS };
    if (typeof raw !== 'object' || raw === null) return restored;
    const r = raw as Record<string, unknown>;
    restored.search = typeof r.search === 'string' ? r.search : '';
    if (APPROVALS_VIEWS.some(v => v.key === r.view)) restored.view = r.view as ApprovalsView;
    restored.conditions = sanitizeConditions(r.conditions, APPROVALS_FILTER_COLUMNS);
    return restored;
}
