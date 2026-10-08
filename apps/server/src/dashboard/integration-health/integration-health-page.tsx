import { useCallback, useEffect, useState } from 'react';
import {
    Badge,
    Button,
    Page,
    PageActionBar,
    PageActionBarRight,
    PageBlock,
    PageLayout,
    PageTitle,
    ResultOf,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    api,
    graphql,
} from '@vendure/dashboard';

import { DRIFT_MESSAGES, formatAge, isLagOverThreshold } from './stream-health-view.js';

const streamHealthDocument = graphql(`
    query IntegrationStreamHealthForDashboard {
        integrationStreamHealth {
            contractVersion
            streams {
                stream
                topic
                inContract
                consumed
                ignoredReason
                drift
                pending
                processing
                failed
                oldestPendingAt
                lag {
                    totalLag
                    polledAt
                    partitions {
                        partition
                        committedOffset
                        endOffset
                        lag
                    }
                }
            }
        }
    }
`);

type StreamHealthReport = ResultOf<typeof streamHealthDocument>['integrationStreamHealth'];

export function IntegrationHealthPage() {
    const [report, setReport] = useState<StreamHealthReport | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const load = useCallback(async (): Promise<void> => {
        setLoading(true);
        try {
            const data = await api.query(streamHealthDocument);
            setReport(data.integrationStreamHealth);
            setError('');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load integration health data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const streams = report?.streams ?? [];
    const now = Date.now();

    return (
        <Page pageId="integration-health">
            <PageTitle>Integration health</PageTitle>
            <PageActionBar>
                <PageActionBarRight>
                    <Button variant="outline" disabled={loading} onClick={() => void load()}>
                        {loading ? 'Refreshing…' : 'Refresh'}
                    </Button>
                </PageActionBarRight>
            </PageActionBar>
            <PageLayout>
                <PageBlock column="full" blockId="streams">
                    <p className="text-muted-foreground mb-4">
                        One row per stream (central hub only): the event contract
                        {report ? ` (v${report.contractVersion})` : ''}, Kafka consumer lag as of
                        the last scheduled poll, and mivend's own inbox backlog. Lag and backlog
                        measure different things and are expected to disagree.
                    </p>
                    {error && <p className="text-destructive mb-3">{error}</p>}
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Stream</TableHead>
                                <TableHead>Topic</TableHead>
                                <TableHead>Contract</TableHead>
                                <TableHead>Consumed</TableHead>
                                <TableHead>Kafka lag</TableHead>
                                <TableHead>Pending</TableHead>
                                <TableHead>Processing</TableHead>
                                <TableHead>Failed</TableHead>
                                <TableHead title="Age of the oldest pending inbox row">
                                    Oldest
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {streams.flatMap(s => [
                                <TableRow
                                    key={s.stream}
                                    className={s.drift ? 'bg-destructive/5' : ''}
                                >
                                    <TableCell className="font-medium">{s.stream}</TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {s.topic ?? '—'}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={s.inContract ? 'secondary' : 'outline'}>
                                            {s.inContract ? 'Yes' : 'No'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell title={s.ignoredReason ?? undefined}>
                                        <Badge variant={s.consumed ? 'secondary' : 'outline'}>
                                            {s.consumed
                                                ? 'Yes'
                                                : s.ignoredReason
                                                  ? 'Ignored'
                                                  : 'No'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell
                                        className={
                                            isLagOverThreshold(s.lag?.totalLag ?? null)
                                                ? 'font-semibold text-destructive'
                                                : ''
                                        }
                                    >
                                        {s.lag ? (
                                            <button
                                                type="button"
                                                title={`polled ${new Date(s.lag.polledAt).toLocaleString()}`}
                                                onClick={() =>
                                                    setExpanded(
                                                        expanded === s.stream ? null : s.stream,
                                                    )
                                                }
                                            >
                                                {s.lag.totalLag ?? 'unknown'} ▾
                                            </button>
                                        ) : (
                                            '—'
                                        )}
                                    </TableCell>
                                    <TableCell>{s.pending}</TableCell>
                                    <TableCell>{s.processing}</TableCell>
                                    <TableCell>
                                        {s.failed > 0 ? (
                                            <Badge variant="destructive">{s.failed}</Badge>
                                        ) : (
                                            0
                                        )}
                                    </TableCell>
                                    <TableCell>{formatAge(s.oldestPendingAt, now)}</TableCell>
                                </TableRow>,
                                s.drift && (
                                    <TableRow
                                        key={`${s.stream}-drift`}
                                        className="bg-destructive/5"
                                    >
                                        <TableCell colSpan={9} className="text-destructive">
                                            {DRIFT_MESSAGES[s.drift] ?? s.drift}
                                        </TableCell>
                                    </TableRow>
                                ),
                                expanded === s.stream && s.lag && (
                                    <TableRow key={`${s.stream}-parts`}>
                                        <TableCell colSpan={9} className="text-muted-foreground">
                                            {s.lag.partitions.map(p => (
                                                <div key={p.partition}>
                                                    partition {p.partition}: committed{' '}
                                                    {p.committedOffset ?? 'never'} / end{' '}
                                                    {p.endOffset} / lag {p.lag ?? 'unknown'}
                                                </div>
                                            ))}
                                        </TableCell>
                                    </TableRow>
                                ),
                            ])}
                        </TableBody>
                    </Table>
                </PageBlock>
            </PageLayout>
        </Page>
    );
}
