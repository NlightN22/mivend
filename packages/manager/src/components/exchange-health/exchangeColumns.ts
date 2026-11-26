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
            col(l, 'entityId', 160, {
                required: true,
                priority: 10,
                sortField: 'entityId',
                mobile: { primary: true },
            }),
            col(l, 'updatedAt', 110, { priority: 8, sortField: 'updatedAt' }),
            col(l, 'stream', 120, {
                priority: 9,
                sortField: 'stream',
                filterType: 'string',
                filterOperators: [...TEXT_OPERATORS],
            }),
            col(l, 'status', 110, {
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
            col(l, 'attempts', 110, { sortField: 'attempts', align: 'end', priority: 6 }),
            col(l, 'lastError', 200, {
                priority: 5,
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
        hidden: ['attempts', 'outcomeReason', 'firstFailedAt'],
    };
}

export function outboxDefinition(): ExchangeListDefinition {
    const l = 'outbox';
    return {
        columns: [
            col(l, 'eventId', 160, { required: true, priority: 10, mobile: { primary: true } }),
            col(l, 'createdAt', 110, { priority: 8, sortField: 'createdAt' }),
            col(l, 'eventType', 130, {
                priority: 9,
                sortField: 'eventType',
                filterType: 'string',
                filterOperators: [...TEXT_OPERATORS],
            }),
            col(l, 'status', 110, {
                priority: 9,
                sortField: 'status',
                filterType: 'select',
                filterOptions: statusOptions(l, ['failed', 'skipped']),
                filterOperators: ['eq', 'notEq'],
                mobile: { badge: true },
            }),
            col(l, 'subjectId', 220, { priority: 4 }),
            col(l, 'retryCount', 110, { sortField: 'retryCount', align: 'end', priority: 6 }),
            col(l, 'lastError', 190, {
                priority: 5,
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
        hidden: ['subjectId', 'retryCount', 'lastErrorAt'],
    };
}

export function reportsDefinition(): ExchangeListDefinition {
    const l = 'reports';
    return {
        columns: [
            col(l, 'number', 80, {
                required: true,
                priority: 10,
                minWidth: 80,
                mobile: { primary: true },
            }),
            col(l, 'lastDetectedAt', 110, { priority: 8 }),
            col(l, 'status', 90, { priority: 9, minWidth: 80, mobile: { badge: true } }),
            col(l, 'severity', 100, {
                priority: 9,
                minWidth: 80,
                filterType: 'select',
                filterOptions: statusOptions(l, ['critical', 'warning']),
                filterOperators: ['eq'],
            }),
            col(l, 'type', 140, { priority: 7, filterType: 'string', filterOperators: ['eq'] }),
            col(l, 'entity', 230, { priority: 6 }),
            col(l, 'figures', 150, { priority: 5 }),
            col(l, 'details', 180, { priority: 4 }),
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
        hidden: ['entity', 'figures', 'source', 'occurrences'],
    };
}

export function reconciliationDefinition(): ExchangeListDefinition {
    const l = 'reconciliation';
    return {
        columns: [
            col(l, 'aggregateType', 120, {
                required: true,
                priority: 10,
                mobile: { primary: true },
            }),
            col(l, 'detectedAt', 110, { priority: 8 }),
            col(l, 'issue', 210, { priority: 9 }),
            col(l, 'ourCount', 100, { align: 'end', priority: 7 }),
            col(l, 'theirActiveCount', 160, { align: 'end', priority: 7 }),
            col(l, 'triggeredBy', 130, { priority: 3 }),
        ],
        cells: { detectedAt: { kind: 'date' }, issue: { kind: 'wrap' } },
        hidden: ['triggeredBy'],
    };
}
