import { useState } from 'react';
import { api, graphql } from '@vendure/dashboard';

import { formatIssueTypeLabel, formatRunSummary } from './erp-reconciliation-format.js';

// Issue #97 — native Dashboard surface for the same reconciliation capability the manager
// portal's own ErpReconciliationPanel.vue exposes (issue #87), moved to Settings > System Health
// there (issue #98). Its own page/route here rather than a third section on integration-health-
// page.tsx per this issue's own correction: that page is already dense (Kafka lag + inbox
// backlog), and @vendure/dashboard has no existing tabbed-page pattern in this codebase to build
// on cleanly — same shape as integration-health/system-health: its own nav MenuItem under
// "system".
//
// One explicit behavior difference from the manager-portal panel: the comparison auto-runs on
// page load (not just on the manual button), so a viewer sees a fresh result without an extra
// click — see loadAndRun below.
const openIssuesDocument = graphql(`
    query OpenErpReconciliationIssuesForDashboard($options: OpenErpReconciliationIssueListOptions) {
        openErpReconciliationIssues(options: $options) {
            items {
                id
                issueType
                aggregateType
                ourCount
                theirActiveCount
                detectedAt
                status
                triggeredBy
            }
            totalItems
        }
    }
`);

const runReconciliationDocument = graphql(`
    mutation RunErpReconciliationFromDashboard {
        runErpReconciliation {
            checked
            issuesFound
            skipped
        }
    }
`);

const resolveIssueDocument = graphql(`
    mutation ResolveErpReconciliationIssueFromDashboard($id: ID!, $resolution: String!) {
        resolveErpReconciliationIssue(id: $id, resolution: $resolution) {
            id
        }
    }
`);

interface OpenIssue {
    id: string;
    issueType: string;
    aggregateType: string;
    ourCount: number;
    theirActiveCount: number;
    detectedAt: string;
    status: string;
    triggeredBy: string;
}

const ISSUE_LIST_TAKE = 50;

export function ErpReconciliationPage() {
    const [issues, setIssues] = useState<OpenIssue[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState('');
    const [runSummary, setRunSummary] = useState('');
    const [resolutionDrafts, setResolutionDrafts] = useState<Record<string, string>>({});
    const [resolvingId, setResolvingId] = useState<string | null>(null);

    async function loadIssues(): Promise<void> {
        const data = await api.query(openIssuesDocument, { options: { take: ISSUE_LIST_TAKE } });
        setIssues(data.openErpReconciliationIssues.items);
    }

    async function loadAndRun(): Promise<void> {
        setRunning(true);
        setError('');
        try {
            // api.mutate curries into (variables) => Promise when called with no second
            // argument at all (see @vendure/dashboard's own api.mutate implementation) — an
            // explicit {} is required even for a parameterless mutation, same pattern as
            // reindexDocument's own `api.mutate(reindexDocument, {})` call elsewhere in the
            // Dashboard bundle.
            const result = await api.mutate(runReconciliationDocument, {});
            setRunSummary(formatRunSummary(result.runErpReconciliation));
            await loadIssues();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not run ERP reconciliation');
        } finally {
            setRunning(false);
            setLoaded(true);
        }
    }

    if (!loaded && !running) {
        void loadAndRun();
    }

    async function handleResolve(issueId: string): Promise<void> {
        const resolution = (resolutionDrafts[issueId] ?? '').trim();
        if (!resolution) return;
        setResolvingId(issueId);
        setError('');
        try {
            await api.mutate(resolveIssueDocument, { id: issueId, resolution });
            await loadIssues();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not resolve issue');
        } finally {
            setResolvingId(null);
        }
    }

    return (
        <div style={{ padding: 24, maxWidth: 960 }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>ERP reconciliation</h1>
            <p style={{ color: '#666', marginBottom: 16 }}>
                Entity-completeness discrepancies between mivend's own counts and Integration
                Service's reconciliation summary (central hub only). The comparison runs
                automatically when this page loads.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <button
                    type="button"
                    onClick={() => void loadAndRun()}
                    disabled={running}
                    style={{
                        padding: '6px 14px',
                        borderRadius: 6,
                        border: '1px solid #d1d5db',
                        background: running ? '#f3f4f6' : '#fff',
                        cursor: running ? 'default' : 'pointer',
                    }}
                >
                    {running ? 'Running…' : 'Run reconciliation now'}
                </button>
                {runSummary && <span style={{ color: '#6b7280', fontSize: 13 }}>{runSummary}</span>}
            </div>

            {error && <div style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</div>}

            {loaded && issues.length === 0 && !error && (
                <p style={{ color: '#6b7280' }}>No open ERP discrepancies.</p>
            )}

            {issues.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                            <th style={{ padding: '4px 8px' }}>Aggregate</th>
                            <th style={{ padding: '4px 8px' }}>Discrepancy</th>
                            <th style={{ padding: '4px 8px' }}>mivend count</th>
                            <th style={{ padding: '4px 8px' }}>Integration Service count</th>
                            <th style={{ padding: '4px 8px' }}>Detected</th>
                            <th style={{ padding: '4px 8px' }}>Resolve</th>
                        </tr>
                    </thead>
                    <tbody>
                        {issues.map(issue => (
                            <tr key={issue.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '4px 8px', textTransform: 'capitalize' }}>
                                    {issue.aggregateType}
                                </td>
                                <td style={{ padding: '4px 8px' }}>{formatIssueTypeLabel(issue.issueType)}</td>
                                <td style={{ padding: '4px 8px' }}>{issue.ourCount}</td>
                                <td style={{ padding: '4px 8px' }}>{issue.theirActiveCount}</td>
                                <td style={{ padding: '4px 8px', color: '#6b7280' }}>
                                    {new Date(issue.detectedAt).toLocaleString()}
                                </td>
                                <td style={{ padding: '4px 8px' }}>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <input
                                            type="text"
                                            placeholder="Resolution note"
                                            value={resolutionDrafts[issue.id] ?? ''}
                                            onChange={e =>
                                                setResolutionDrafts(prev => ({
                                                    ...prev,
                                                    [issue.id]: e.target.value,
                                                }))
                                            }
                                            style={{
                                                padding: '2px 6px',
                                                border: '1px solid #d1d5db',
                                                borderRadius: 4,
                                                fontSize: 12,
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => void handleResolve(issue.id)}
                                            disabled={
                                                resolvingId === issue.id ||
                                                !(resolutionDrafts[issue.id] ?? '').trim()
                                            }
                                            style={{
                                                padding: '2px 10px',
                                                borderRadius: 4,
                                                border: '1px solid #d1d5db',
                                                fontSize: 12,
                                                cursor: resolvingId === issue.id ? 'default' : 'pointer',
                                            }}
                                        >
                                            {resolvingId === issue.id ? '…' : 'Resolve'}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
