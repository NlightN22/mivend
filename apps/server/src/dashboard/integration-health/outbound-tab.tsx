import { useCallback, useEffect, useState } from 'react';
import {
    Badge,
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

import { CountLink } from './count-link.js';
import { outboundProblemsLink } from './issue-links.js';
import { RefreshIconButton } from './refresh-button.js';
import { formatAge, schemaSourceBadge } from './stream-health-view.js';

const outboxHealthDocument = graphql(`
    query IntegrationOutboxHealthForDashboard {
        integrationOutboxHealth {
            eventType
            pending
            failed
            skipped
            oldestPendingAt
            lastPublishedAt
            lastError
            lastErrorAt
            lastSkipReason
            schemaSource
        }
    }
`);

type OutboxRows = ResultOf<typeof outboxHealthDocument>['integrationOutboxHealth'];

export function OutboundTab() {
    const [rows, setRows] = useState<OutboxRows>([]);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const load = useCallback(async (): Promise<void> => {
        setLoading(true);
        try {
            const data = await api.query(outboxHealthDocument);
            setRows(data.integrationOutboxHealth);
            setError('');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load outbox health data');
        } finally {
            setLoading(false);
            setLoaded(true);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const now = Date.now();

    return (
        <div className="pt-4 pb-6">
            <p className="text-muted-foreground mb-4">
                Events mivend wrote to its outbox for Integration Service, per event type. Pending
                rows are waiting to be published (failed attempts are retried with backoff for 24
                h); failed rows gave up; skipped rows could not be built and were never sent.
            </p>
            {error && <p className="text-destructive mb-3">{error}</p>}
            <div className="flex justify-end mb-2">
                <RefreshIconButton loading={loading} onRefresh={() => void load()} />
            </div>
            <div className="rounded-md border bg-background">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Event type</TableHead>
                            <TableHead>Schema</TableHead>
                            <TableHead>Pending</TableHead>
                            <TableHead>Failed</TableHead>
                            <TableHead title="Events that could not be built and were never published">
                                Skipped
                            </TableHead>
                            <TableHead title="Age of the oldest pending outbox row">
                                Oldest
                            </TableHead>
                            <TableHead>Last published</TableHead>
                            <TableHead>Last error / skip reason</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loaded && rows.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={8} className="text-muted-foreground">
                                    No outbound events yet.
                                </TableCell>
                            </TableRow>
                        )}
                        {rows.map(r => (
                            <TableRow key={r.eventType}>
                                <TableCell className="font-medium">{r.eventType}</TableCell>
                                <TableCell>
                                    {(() => {
                                        const badge = schemaSourceBadge(r.schemaSource);
                                        return badge ? (
                                            <Badge variant={badge.variant} title={badge.title}>
                                                {badge.label}
                                            </Badge>
                                        ) : (
                                            '—'
                                        );
                                    })()}
                                </TableCell>
                                <TableCell>{r.pending}</TableCell>
                                <TableCell>
                                    <CountLink
                                        count={r.failed}
                                        href={outboundProblemsLink({
                                            eventType: r.eventType,
                                            status: 'failed',
                                        })}
                                        destructive
                                    />
                                </TableCell>
                                <TableCell>
                                    <CountLink
                                        count={r.skipped}
                                        href={outboundProblemsLink({
                                            eventType: r.eventType,
                                            status: 'skipped',
                                        })}
                                        destructive
                                    />
                                </TableCell>
                                <TableCell>{formatAge(r.oldestPendingAt, now)}</TableCell>
                                <TableCell>
                                    {r.lastPublishedAt
                                        ? `${formatAge(r.lastPublishedAt, now)} ago`
                                        : '—'}
                                </TableCell>
                                <TableCell className="max-w-80 whitespace-normal break-words text-destructive">
                                    {r.lastError ?? r.lastSkipReason ?? ''}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
