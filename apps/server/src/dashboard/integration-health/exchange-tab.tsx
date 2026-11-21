import { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    AlertDescription,
    AlertTitle,
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

import { formatAgeSeconds, stateBadgeVariant, unknownReasonText } from './exchange-health-view.js';
import { RefreshIconButton } from './refresh-button.js';
import { formatAge } from './stream-health-view.js';

const exchangeHealthDocument = graphql(`
    query ExchangeHealthForDashboard {
        exchangeHealth {
            state
            reason
            polledAt
            health {
                generatedAt
                status
                channels {
                    channel
                    status
                    lastActivityAt
                    streams {
                        stream
                        entityType
                        status
                        lastActivityAt
                        pending
                        oldestAgeSeconds
                        failedLast24h
                    }
                }
                failures {
                    status
                    inboxFailedLast24h
                    outboxFailedLast24h
                    outboundRejectedLast24h
                }
                resync {
                    pending
                    delivered
                    acknowledgedLast24h
                    rejectedLast24h
                    open {
                        id
                        stream
                        dryRun
                        status
                        createdAt
                    }
                }
            }
        }
    }
`);

type Report = ResultOf<typeof exchangeHealthDocument>['exchangeHealth'];

const dash = (n: number | null): string | number => (n === null ? '—' : n);

export function ExchangeTab() {
    const [report, setReport] = useState<Report | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const load = useCallback(async (): Promise<void> => {
        setLoading(true);
        try {
            const data = await api.query(exchangeHealthDocument);
            setReport(data.exchangeHealth);
            setError('');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load the exchange health');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const now = Date.now();
    const health = report?.health ?? null;

    return (
        <div className="pt-4 pb-6">
            <p className="text-muted-foreground mb-4">
                The ERP exchange as the Integration Service sees it: ingest (the ERP uploads), pull
                (the ERP collects commands) and ack (the ERP confirms them). Read on a schedule.
            </p>
            {error && <p className="text-destructive mb-3">{error}</p>}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    {report && (
                        <Badge variant={stateBadgeVariant(report.state)}>{report.state}</Badge>
                    )}
                    {report?.polledAt && (
                        <span className="text-muted-foreground">
                            read {formatAge(report.polledAt, now)} ago
                        </span>
                    )}
                </div>
                <RefreshIconButton loading={loading} onRefresh={() => void load()} />
            </div>
            {report?.state === 'UNKNOWN' && (
                <Alert variant="destructive" className="mb-3">
                    <AlertTitle>Exchange health unknown ({report.reason})</AlertTitle>
                    <AlertDescription>{unknownReasonText(report.reason ?? null)}</AlertDescription>
                </Alert>
            )}
            {health && (
                <>
                    <div className="rounded-md border bg-background">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Channel</TableHead>
                                    <TableHead>Stream</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Last activity</TableHead>
                                    <TableHead title="Ingest/pull: pending. Ack: delivered, not acknowledged">
                                        Pending
                                    </TableHead>
                                    <TableHead>Oldest</TableHead>
                                    <TableHead title="Ingest: failed rows. Ack: rejected by the ERP">
                                        Failed 24 h
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {health.channels.map(channel => (
                                    <ChannelRows
                                        key={channel.channel}
                                        channel={channel}
                                        now={now}
                                    />
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <p className="mt-4">
                        <span className="text-muted-foreground">Failures in the last 24 h: </span>
                        inbox {dash(health.failures.inboxFailedLast24h)}, outbox{' '}
                        {dash(health.failures.outboxFailedLast24h)}, rejected by the ERP{' '}
                        {dash(health.failures.outboundRejectedLast24h)}
                    </p>
                    <p className="mt-2">
                        <span className="text-muted-foreground">Resync signals: </span>
                        pending {dash(health.resync.pending)}, delivered{' '}
                        {dash(health.resync.delivered)}, acknowledged 24 h{' '}
                        {dash(health.resync.acknowledgedLast24h)}, rejected 24 h{' '}
                        {dash(health.resync.rejectedLast24h)}
                    </p>
                    {health.resync.open.map(signal => (
                        <p key={signal.id} className="text-muted-foreground">
                            {signal.stream} · {signal.status}
                            {signal.dryRun ? ' · dry run' : ''} · {signal.id}
                        </p>
                    ))}
                </>
            )}
        </div>
    );
}

type Channel = NonNullable<Report['health']>['channels'][number];

function ChannelRows({ channel, now }: Readonly<{ channel: Channel; now: number }>) {
    return (
        <>
            <TableRow>
                <TableCell className="font-medium">{channel.channel}</TableCell>
                <TableCell />
                <TableCell>
                    <Badge variant={stateBadgeVariant(channel.status)}>{channel.status}</Badge>
                </TableCell>
                <TableCell>
                    {channel.lastActivityAt ? `${formatAge(channel.lastActivityAt, now)} ago` : '—'}
                </TableCell>
                <TableCell colSpan={3} />
            </TableRow>
            {channel.streams.map(s => (
                <TableRow key={`${channel.channel}-${s.stream}`}>
                    <TableCell />
                    <TableCell>{s.stream}</TableCell>
                    <TableCell>
                        <Badge variant={stateBadgeVariant(s.status)}>{s.status}</Badge>
                    </TableCell>
                    <TableCell>
                        {s.lastActivityAt ? `${formatAge(s.lastActivityAt, now)} ago` : '—'}
                    </TableCell>
                    <TableCell>{dash(s.pending)}</TableCell>
                    <TableCell>{formatAgeSeconds(s.oldestAgeSeconds)}</TableCell>
                    <TableCell>{dash(s.failedLast24h)}</TableCell>
                </TableRow>
            ))}
        </>
    );
}
