import { adminApi } from './client';
import {
    ExchangeConsistencyReportsDocument,
    ExchangeConsistencySourcesDocument,
    ExchangeHealthSnapshotDocument,
    ExchangeInboxIssuesDocument,
    ExchangeOutboxHealthDocument,
    ExchangeOutboxProblemsDocument,
    ExchangeReconciliationIssuesDocument,
    ExchangeReconciliationStatesDocument,
    ExchangeStreamHealthDocument,
    type ExchangeConsistencyReportsQuery,
    type ExchangeConsistencySourcesQuery,
    type ExchangeHealthSnapshotQuery,
    type ExchangeInboxIssuesQuery,
    type ExchangeOutboxHealthQuery,
    type ExchangeOutboxProblemsQuery,
    type ExchangeReconciliationIssuesQuery,
    type ExchangeReconciliationStatesQuery,
    type ExchangeStreamHealthQuery,
    type ConsistencyReportListOptions,
    type IntegrationInboxIssueListOptions,
    type IntegrationOutboxProblemListOptions,
    type OpenErpReconciliationIssueListOptions,
} from './generated/graphql';

export type ConsistencyReportRow =
    ExchangeConsistencyReportsQuery['consistencyReports']['items'][number];
export type ConsistencySourceRow = ExchangeConsistencySourcesQuery['consistencySources'][number];
export type ReconciliationIssueRow =
    ExchangeReconciliationIssuesQuery['openErpReconciliationIssues']['items'][number];
export type ReconciliationStateRow =
    ExchangeReconciliationStatesQuery['erpReconciliationStates'][number];
export type InboxIssueRow = ExchangeInboxIssuesQuery['integrationInboxIssues']['items'][number];
export type OutboxProblemRow =
    ExchangeOutboxProblemsQuery['integrationOutboxProblems']['items'][number];
export type StreamHealthReport = ExchangeStreamHealthQuery;
export type OutboxHealthReport = ExchangeOutboxHealthQuery;
export type ExchangeSnapshot = ExchangeHealthSnapshotQuery['exchangeHealth'];

export interface Page<T> {
    items: T[];
    totalItems: number;
    totalItemsCapped?: boolean;
}

export async function fetchConsistencyReports(
    options: ConsistencyReportListOptions,
): Promise<Page<ConsistencyReportRow>> {
    return (await adminApi(ExchangeConsistencyReportsDocument, { options })).consistencyReports;
}

export async function fetchConsistencySources(): Promise<ConsistencySourceRow[]> {
    return (await adminApi(ExchangeConsistencySourcesDocument)).consistencySources;
}

export async function fetchReconciliationIssues(
    options: OpenErpReconciliationIssueListOptions,
): Promise<Page<ReconciliationIssueRow>> {
    return (await adminApi(ExchangeReconciliationIssuesDocument, { options }))
        .openErpReconciliationIssues;
}

export async function fetchReconciliationStates(): Promise<ReconciliationStateRow[]> {
    return (await adminApi(ExchangeReconciliationStatesDocument)).erpReconciliationStates;
}

export async function fetchInboxIssues(
    options: IntegrationInboxIssueListOptions,
): Promise<Page<InboxIssueRow>> {
    return (await adminApi(ExchangeInboxIssuesDocument, { options })).integrationInboxIssues;
}

export async function fetchOutboxProblems(
    options: IntegrationOutboxProblemListOptions,
): Promise<Page<OutboxProblemRow>> {
    return (await adminApi(ExchangeOutboxProblemsDocument, { options })).integrationOutboxProblems;
}

export async function fetchStreamHealth(): Promise<StreamHealthReport> {
    return adminApi(ExchangeStreamHealthDocument);
}

export async function fetchOutboxHealth(): Promise<OutboxHealthReport> {
    return adminApi(ExchangeOutboxHealthDocument);
}

export async function fetchExchangeSnapshot(): Promise<ExchangeSnapshot> {
    return (await adminApi(ExchangeHealthSnapshotDocument)).exchangeHealth;
}
