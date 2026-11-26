import { toFilterColumns } from '@mivend/ui-kit';
import { i18n } from '../../i18n';
import {
    fetchConsistencyReports,
    type ConsistencyReportRow,
    type ReconciliationIssueRow,
    fetchInboxIssues,
    fetchOutboxProblems,
    fetchReconciliationIssues,
} from '../../api/exchangeHealth';
import { figureText } from '../../api/exchangeHealthView';
import { toInboxOptions, toOutboxOptions, toReportOptions } from '../../api/exchangeListFilters';
import type { ExchangeListSource } from '../../composables/useExchangeList';
import {
    inboxDefinition,
    outboxDefinition,
    reconciliationDefinition,
    reportsDefinition,
    type ExchangeListDefinition,
} from './exchangeColumns';

export interface ExchangeListConfig {
    id: 'inbox' | 'outbox' | 'reports' | 'reconciliation';
    definition: ExchangeListDefinition;
    source: ExchangeListSource;
    searchField: string | null;
    toRow: (item: { id: string }) => Record<string, unknown> & { id: string };
}

const sortFieldsOf = (d: ExchangeListDefinition): string[] =>
    d.columns.flatMap(c => (c.sortField ? [c.sortField] : []));

export function inboxConfig(): ExchangeListConfig {
    const definition = inboxDefinition();
    const filterColumns = toFilterColumns(definition.columns);
    return {
        id: 'inbox',
        definition,
        searchField: 'entityId',
        source: {
            views: ['all', 'failed', 'replay_requested', 'dependency_missing'],
            sortFields: sortFieldsOf(definition),
            defaultSort: { field: 'updatedAt', dir: 'DESC' },
            filterColumns,
            fetch: req => fetchInboxIssues(toInboxOptions(req, filterColumns)),
        },
        toRow: item => ({ ...item }),
    };
}

export function outboxConfig(): ExchangeListConfig {
    const definition = outboxDefinition();
    const filterColumns = toFilterColumns(definition.columns);
    return {
        id: 'outbox',
        definition,
        searchField: 'eventId',
        source: {
            views: ['all', 'failed', 'skipped'],
            sortFields: sortFieldsOf(definition),
            defaultSort: { field: 'createdAt', dir: 'DESC' },
            filterColumns,
            fetch: req => fetchOutboxProblems(toOutboxOptions(req, filterColumns)),
        },
        toRow: item => ({ ...item }),
    };
}

export function reportsConfig(): ExchangeListConfig {
    const definition = reportsDefinition();
    return {
        id: 'reports',
        definition,
        searchField: null,
        source: {
            views: ['open', 'resolved', 'all'],
            sortFields: [],
            defaultSort: { field: 'lastDetectedAt', dir: 'DESC' },
            filterColumns: toFilterColumns(definition.columns),
            fetch: req => fetchConsistencyReports(toReportOptions(req)),
        },
        toRow: item => {
            const r = item as ConsistencyReportRow;
            return {
                ...r,
                entity: `${r.entityType} ${r.entityId}`,
                figures: `${figureText(r.expected, 24)} → ${figureText(r.actual, 24)}`,
            };
        },
    };
}

export function reconciliationConfig(): ExchangeListConfig {
    const definition = reconciliationDefinition();
    const { t, te } = i18n.global;
    return {
        id: 'reconciliation',
        definition,
        searchField: null,
        source: {
            views: ['all'],
            sortFields: [],
            defaultSort: { field: 'detectedAt', dir: 'DESC' },
            filterColumns: [],
            fetch: req => fetchReconciliationIssues({ skip: req.skip, take: req.take }),
        },
        toRow: item => {
            const r = item as ReconciliationIssueRow;
            const key = `exchangeHealth.reconciliation.issueTypes.${r.issueType}`;
            return { ...r, issue: te(key) ? t(key) : r.issueType };
        },
    };
}
