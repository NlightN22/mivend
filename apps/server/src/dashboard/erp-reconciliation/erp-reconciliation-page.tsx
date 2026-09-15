import { useState } from 'react';
import {
    api,
    graphql,
    Badge,
    Button,
    Input,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@vendure/dashboard';

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
//
// Uses @vendure/dashboard's own themed components (Button/Input/Table/Badge, from
// @vendure-io/ui) rather than raw HTML with inline hex colors — those don't track the admin
// theme's dark/light CSS variables, so a hardcoded `background: '#fff'` button/table look broken
// in dark mode even though it renders. Tailwind utility classes are safe here too: the Dashboard
// ships a dedicated extension-tailwind.css build that generates classes for extension source
// files against the same admin-theme design tokens as the rest of the app.
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
        <div className="p-6">
            <h1 className="text-xl font-semibold mb-1">ERP reconciliation</h1>
            <p className="text-muted-foreground mb-4 max-w-2xl">
                Entity-completeness discrepancies between mivend's own counts and Integration
                Service's reconciliation summary (central hub only). The comparison runs
                automatically when this page loads.
            </p>

            <div className="flex items-center gap-3 mb-5">
                <Button variant="outline" onClick={() => void loadAndRun()} disabled={running}>
                    {running ? 'Running…' : 'Run reconciliation now'}
                </Button>
                {runSummary && <span className="text-muted-foreground text-sm">{runSummary}</span>}
            </div>

            {error && <div className="text-destructive mb-3">{error}</div>}

            {loaded && issues.length === 0 && !error && (
                <p className="text-muted-foreground">No open ERP discrepancies.</p>
            )}

            {issues.length > 0 && (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Aggregate</TableHead>
                            <TableHead>Discrepancy</TableHead>
                            <TableHead>mivend count</TableHead>
                            <TableHead>Integration Service count</TableHead>
                            <TableHead>Detected</TableHead>
                            <TableHead>Resolve</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {issues.map(issue => (
                            <TableRow key={issue.id}>
                                <TableCell className="capitalize">
                                    <Badge variant="secondary">{issue.aggregateType}</Badge>
                                </TableCell>
                                <TableCell>{formatIssueTypeLabel(issue.issueType)}</TableCell>
                                <TableCell>{issue.ourCount}</TableCell>
                                <TableCell>{issue.theirActiveCount}</TableCell>
                                <TableCell className="text-muted-foreground">
                                    {new Date(issue.detectedAt).toLocaleString()}
                                </TableCell>
                                <TableCell>
                                    <div className="flex gap-2">
                                        <Input
                                            type="text"
                                            placeholder="Resolution note"
                                            value={resolutionDrafts[issue.id] ?? ''}
                                            onChange={e =>
                                                setResolutionDrafts(prev => ({
                                                    ...prev,
                                                    [issue.id]: e.target.value,
                                                }))
                                            }
                                            className="h-8 text-xs"
                                        />
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => void handleResolve(issue.id)}
                                            disabled={
                                                resolvingId === issue.id ||
                                                !(resolutionDrafts[issue.id] ?? '').trim()
                                            }
                                        >
                                            {resolvingId === issue.id ? '…' : 'Resolve'}
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </div>
    );
}
