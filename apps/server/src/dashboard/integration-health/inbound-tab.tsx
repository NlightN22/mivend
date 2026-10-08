import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
    Badge,
    Alert,
    AlertDescription,
    AlertTitle,
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

import { VERSION_DRIFT_MESSAGES } from './stream-health-view.js';
import { CountLink } from './count-link.js';
import { inboxIssuesLink } from './issue-links.js';
import { RefreshIconButton } from './refresh-button.js';
import type { VariantOrganizationHealth, VariantUnitHealth } from './stream-health-view.js';
import {
    DRIFT_MESSAGES,
    formatVariantOrganizationLine,
    formatVariantUnitLine,
    formatAge,
    isLagOverThreshold,
} from './stream-health-view.js';

const streamHealthDocument = graphql(`
    query IntegrationStreamHealthForDashboard {
        integrationStreamHealth {
            contractVersion
            versionDrift {
                installed
                latest
                status
            }
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
                replayPending
                oldestPendingAt
                noop24h
                lastNoopReason
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

const variantUnitDocument = graphql(`
    query VariantUnitHealthForDashboard {
        variantUnitHealth {
            total
            unitMissing
        }
    }
`);

const variantOrganizationDocument = graphql(`
    query VariantOrganizationHealthForDashboard {
        variantOrganizationHealth {
            total
            withoutOrganization
        }
    }
`);

type StreamHealthReport = ResultOf<typeof streamHealthDocument>['integrationStreamHealth'];

function VariantUnitAlert({ health }: Readonly<{ health: VariantUnitHealth }>) {
    const line = formatVariantUnitLine(health);
    return (
        <Alert variant={line.problem ? 'destructive' : 'default'} className="mb-3">
            <AlertDescription>{line.text}</AlertDescription>
        </Alert>
    );
}

function VariantOrganizationAlert({ health }: Readonly<{ health: VariantOrganizationHealth }>) {
    const line = formatVariantOrganizationLine(health);
    return (
        <Alert variant={line.problem ? 'destructive' : 'default'} className="mb-3">
            <AlertDescription>{line.text}</AlertDescription>
        </Alert>
    );
}

function VersionDriftAlert({
    drift,
}: Readonly<{ drift: NonNullable<StreamHealthReport>['versionDrift'] }>) {
    const message = VERSION_DRIFT_MESSAGES[drift.status];
    if (!message) return null;
    return (
        <Alert variant={drift.status === 'BEHIND' ? 'destructive' : 'default'} className="mb-3">
            <AlertTitle>Event contract {message.title}</AlertTitle>
            <AlertDescription>{message.text(drift.installed, drift.latest)}</AlertDescription>
        </Alert>
    );
}

export function InboundTab() {
    const [report, setReport] = useState<StreamHealthReport | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [unitHealth, setUnitHealth] = useState<VariantUnitHealth | null>(null);
    const [variantHealth, setVariantHealth] = useState<VariantOrganizationHealth | null>(null);

    const load = useCallback(async (): Promise<void> => {
        setLoading(true);
        try {
            const data = await api.query(streamHealthDocument);
            setReport(data.integrationStreamHealth);
            setError('');
            api.query(variantUnitDocument)
                .then(r => setUnitHealth(r.variantUnitHealth))
                .catch(() => setUnitHealth(null));
            api.query(variantOrganizationDocument)
                .then(r => setVariantHealth(r.variantOrganizationHealth))
                .catch(() => setVariantHealth(null));
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
        <div className="pt-4 pb-6">
            <div>
                <p className="text-muted-foreground mb-4">
                    One row per stream (central hub only): the event contract
                    {report ? ` (v${report.contractVersion})` : ''}, Kafka consumer lag as of the
                    last scheduled poll, and mivend's own inbox backlog. Lag and backlog measure
                    different things and are expected to disagree.
                </p>
                {error && <p className="text-destructive mb-3">{error}</p>}
                {variantHealth && <VariantOrganizationAlert health={variantHealth} />}
                {unitHealth && <VariantUnitAlert health={unitHealth} />}
                {report && <VersionDriftAlert drift={report.versionDrift} />}
                <div className="flex justify-end mb-2">
                    <RefreshIconButton loading={loading} onRefresh={() => void load()} />
                </div>
                <div className="rounded-md border bg-background">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Stream</TableHead>
                                <TableHead>Contract</TableHead>
                                <TableHead>Consumed</TableHead>
                                <TableHead>Kafka lag</TableHead>
                                <TableHead>Pending</TableHead>
                                <TableHead>Processing</TableHead>
                                <TableHead>Failed</TableHead>
                                <TableHead title="Messages the handler deliberately did nothing for in the last 24 hours">
                                    No-op (24h)
                                </TableHead>
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
                                    <TableCell className="max-w-60 whitespace-normal break-all">
                                        <div className="font-medium">{s.stream}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {s.topic ?? 'no topic'}
                                        </div>
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
                                    <TableCell className="space-x-1">
                                        <CountLink
                                            count={s.failed}
                                            href={inboxIssuesLink({
                                                stream: s.stream,
                                                status: 'failed',
                                            })}
                                            destructive
                                        />
                                        <CountLink
                                            count={s.replayPending}
                                            href={inboxIssuesLink({
                                                stream: s.stream,
                                                status: 'replay_requested',
                                            })}
                                            muted
                                            hideZero
                                            icon={<RefreshCw className="size-3" />}
                                            title="replay requested, waiting for the entity to be processed"
                                        />
                                    </TableCell>
                                    <TableCell title={s.lastNoopReason ?? undefined}>
                                        <CountLink
                                            count={s.noop24h}
                                            href={inboxIssuesLink({
                                                stream: s.stream,
                                                outcome: 'noop',
                                            })}
                                        />
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
                </div>
            </div>
        </div>
    );
}
