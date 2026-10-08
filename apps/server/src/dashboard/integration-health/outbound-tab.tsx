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

import { RefreshIconButton } from './refresh-button.js';
import { formatAge } from './stream-health-view.js';

const outboxHealthDocument = graphql(`
    query IntegrationOutboxHealthForDashboard {
        integrationOutboxHealth {
            eventType
            pending
            failed
            oldestPendingAt
            lastPublishedAt
            lastError
            lastErrorAt
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
                rows are waiting to be published to Kafka; failed rows exhausted their retries and
                are not retried again.
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
                            <TableHead>Pending</TableHead>
                            <TableHead>Failed</TableHead>
                            <TableHead title="Age of the oldest pending outbox row">
                                Oldest
                            </TableHead>
                            <TableHead>Last published</TableHead>
                            <TableHead>Last error</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loaded && rows.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-muted-foreground">
                                    No outbound events yet.
                                </TableCell>
                            </TableRow>
                        )}
                        {rows.map(r => (
                            <TableRow key={r.eventType}>
                                <TableCell className="font-medium">{r.eventType}</TableCell>
                                <TableCell>{r.pending}</TableCell>
                                <TableCell>
                                    {r.failed > 0 ? (
                                        <Badge variant="destructive">{r.failed}</Badge>
                                    ) : (
                                        0
                                    )}
                                </TableCell>
                                <TableCell>{formatAge(r.oldestPendingAt, now)}</TableCell>
                                <TableCell>
                                    {r.lastPublishedAt
                                        ? `${formatAge(r.lastPublishedAt, now)} ago`
                                        : '—'}
                                </TableCell>
                                <TableCell className="max-w-80 whitespace-normal break-words text-destructive">
                                    {r.lastError ?? ''}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
