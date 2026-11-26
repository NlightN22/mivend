import type { AdvancedDataTableColumn, FilterOption, StatusBadgeVariant } from '@mivend/ui-kit';
import { i18n } from '../../i18n';
import {
    INBOX_STATUS_VARIANT,
    OUTBOX_STATUS_VARIANT,
    REPORT_STATUS_VARIANT,
    severityVariant,
} from '../../api/exchangeHealthView';

const NOT_FILTERED = { type: 'none' } as const;
const t = (key: string): string => i18n.global.t(key);

export type CellSpec =
    | { kind: 'date' }
    | { kind: 'code' }
    | { kind: 'wrap' }
    | { kind: 'entity' }
    | { kind: 'badge'; variant: (value: string) => StatusBadgeVariant };

export interface ExchangeListDefinition {
    columns: AdvancedDataTableColumn[];
    cells: Record<string, CellSpec>;
    hidden: string[];
}

function col(
    list: string,
    field: string,
    width: number,
    extra: Partial<AdvancedDataTableColumn> = {},
): AdvancedDataTableColumn {
    return {
        field,
        header: t(`exchangeHealth.columns.${list}.${field}`),
        width,
        minWidth: Math.min(width, 110),
        filterConfig: NOT_FILTERED,
        ...extra,
    };
}

const statusOptions = (list: string, values: string[]): FilterOption[] =>
    values.map(value => ({ value, label: t(`exchangeHealth.status.${list}.${value}`) }));

const TEXT_OPERATORS = ['eq', 'notEq', 'contains', 'notContains'] as const;

export function inboxDefinition(): ExchangeListDefinition {
    const l = 'inbox';
    return {
        columns: [
            col(l, 'entityId', 240, {
                required: true,
                priority: 10,
                sortField: 'entityId',
                mobile: { primary: true },
            }),
            col(l, 'updatedAt', 160, { priority: 8, sortField: 'updatedAt' }),
            col(l, 'stream', 190, {
                priority: 9,
                sortField: 'stream',
                filterType: 'string',
                filterOperators: [...TEXT_OPERATORS],
            }),
            col(l, 'status', 150, {
                priority: 9,
                sortField: 'status',
                filterType: 'select',
                filterOptions: statusOptions(l, [
                    'failed',
                    'replay_requested',
                    'dependency_missing',
                ]),
                filterOperators: ['eq', 'notEq'],
                mobile: { badge: true },
            }),
            col(l, 'attempts', 90, { sortField: 'attempts', align: 'end', priority: 6 }),
            col(l, 'lastError', 320, {
                priority: 5,
                filterType: 'string',
                filterOperators: [...TEXT_OPERATORS],
            }),
            col(l, 'outcomeReason', 220, { priority: 3 }),
            col(l, 'firstFailedAt', 160, { priority: 4, sortField: 'firstFailedAt' }),
        ],
        cells: {
            entityId: { kind: 'code' },
            updatedAt: { kind: 'date' },
            firstFailedAt: { kind: 'date' },
            lastError: { kind: 'wrap' },
            outcomeReason: { kind: 'wrap' },
            status: { kind: 'badge', variant: v => INBOX_STATUS_VARIANT[v] ?? 'neutral' },
        },
        hidden: ['outcomeReason', 'firstFailedAt'],
    };
}

export function outboxDefinition(): ExchangeListDefinition {
    const l = 'outbox';
    return {
        columns: [
            col(l, 'eventId', 240, { required: true, priority: 10, mobile: { primary: true } }),
            col(l, 'createdAt', 160, { priority: 8, sortField: 'createdAt' }),
            col(l, 'eventType', 190, {
                priority: 9,
                sortField: 'eventType',
                filterType: 'string',
                filterOperators: [...TEXT_OPERATORS],
            }),
            col(l, 'status', 120, {
                priority: 9,
                sortField: 'status',
                filterType: 'select',
                filterOptions: statusOptions(l, ['failed', 'skipped']),
                filterOperators: ['eq', 'notEq'],
                mobile: { badge: true },
            }),
            col(l, 'subjectId', 220, { priority: 4 }),
            col(l, 'retryCount', 90, { sortField: 'retryCount', align: 'end', priority: 6 }),
            col(l, 'lastError', 320, {
                priority: 5,
                filterType: 'string',
                filterOperators: [...TEXT_OPERATORS],
            }),
            col(l, 'lastErrorAt', 160, { priority: 3, sortField: 'lastErrorAt' }),
        ],
        cells: {
            eventId: { kind: 'code' },
            subjectId: { kind: 'code' },
            createdAt: { kind: 'date' },
            lastErrorAt: { kind: 'date' },
            lastError: { kind: 'wrap' },
            status: { kind: 'badge', variant: v => OUTBOX_STATUS_VARIANT[v] ?? 'neutral' },
        },
        hidden: ['subjectId', 'lastErrorAt'],
    };
}

export function reportsDefinition(): ExchangeListDefinition {
    const l = 'reports';
    return {
        columns: [
            col(l, 'number', 90, {
                required: true,
                priority: 10,
                minWidth: 90,
                mobile: { primary: true },
            }),
            col(l, 'lastDetectedAt', 160, { priority: 8 }),
            col(l, 'status', 110, { priority: 9, minWidth: 100, mobile: { badge: true } }),
            col(l, 'severity', 110, {
                priority: 9,
                minWidth: 100,
                filterType: 'select',
                filterOptions: statusOptions(l, ['critical', 'warning']),
                filterOperators: ['eq'],
            }),
            col(l, 'type', 200, { priority: 7, filterType: 'string', filterOperators: ['eq'] }),
            col(l, 'entity', 230, { priority: 6 }),
            col(l, 'figures', 150, { priority: 5 }),
            col(l, 'details', 320, { priority: 4 }),
            col(l, 'source', 140, { priority: 2, filterType: 'string', filterOperators: ['eq'] }),
            col(l, 'occurrences', 100, { priority: 2, align: 'end' }),
        ],
        cells: {
            lastDetectedAt: { kind: 'date' },
            entity: { kind: 'entity' },
            details: { kind: 'wrap' },
            status: { kind: 'badge', variant: v => REPORT_STATUS_VARIANT[v] ?? 'neutral' },
            severity: { kind: 'badge', variant: severityVariant },
        },
        hidden: ['source', 'occurrences'],
    };
}

export function reconciliationDefinition(): ExchangeListDefinition {
    const l = 'reconciliation';
    return {
        columns: [
            col(l, 'aggregateType', 180, {
                required: true,
                priority: 10,
                mobile: { primary: true },
            }),
            col(l, 'detectedAt', 160, { priority: 8 }),
            col(l, 'issue', 360, { priority: 9 }),
            col(l, 'ourCount', 130, { align: 'end', priority: 7 }),
            col(l, 'theirActiveCount', 170, { align: 'end', priority: 7 }),
            col(l, 'triggeredBy', 130, { priority: 3, mobile: { hidden: true } }),
        ],
        cells: { detectedAt: { kind: 'date' }, issue: { kind: 'wrap' } },
        hidden: [],
    };
}
