import { useCallback, useEffect, useState } from 'react';
import { ResultOf, api, graphql } from '@vendure/dashboard';

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

const cell = { padding: '4px 8px', whiteSpace: 'nowrap' as const };

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
        <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
                    Integration health
                </h1>
                <button type="button" disabled={loading} onClick={() => void load()}>
                    {loading ? 'Refreshing…' : 'Refresh'}
                </button>
            </div>
            <p style={{ color: '#666', marginBottom: 16 }}>
                One row per stream (central hub only): the event contract
                {report ? ` (v${report.contractVersion})` : ''}, the Kafka consumer lag as of the
                last scheduled poll, and mivend's own inbox backlog. Lag and backlog measure
                different things and are expected to disagree.
            </p>

            {error && <div style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</div>}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                            <th style={cell}>Stream</th>
                            <th style={cell}>Topic</th>
                            <th style={cell}>Contract</th>
                            <th style={cell}>Consumed</th>
                            <th style={cell}>Kafka lag</th>
                            <th style={cell}>Pending</th>
                            <th style={cell}>Processing</th>
                            <th style={cell}>Failed</th>
                            <th style={cell}>Oldest pending</th>
                        </tr>
                    </thead>
                    <tbody>
                        {streams.map(s => {
                            const lagHigh = isLagOverThreshold(s.lag?.totalLag ?? null);
                            return [
                                <tr
                                    key={s.stream}
                                    style={{
                                        borderBottom: '1px solid #f3f4f6',
                                        background: s.drift ? '#fef2f2' : undefined,
                                    }}
                                >
                                    <td style={cell}>{s.stream}</td>
                                    <td style={{ ...cell, color: '#6b7280' }}>{s.topic ?? '—'}</td>
                                    <td style={cell}>{s.inContract ? 'yes' : 'no'}</td>
                                    <td style={cell} title={s.ignoredReason ?? undefined}>
                                        {s.consumed ? 'yes' : s.ignoredReason ? 'ignored' : 'no'}
                                    </td>
                                    <td
                                        style={{
                                            ...cell,
                                            fontWeight: lagHigh ? 600 : 400,
                                            color: lagHigh ? '#b91c1c' : undefined,
                                        }}
                                    >
                                        {s.lag ? (
                                            <button
                                                type="button"
                                                style={{ all: 'unset', cursor: 'pointer' }}
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
                                    </td>
                                    <td style={cell}>{s.pending}</td>
                                    <td style={cell}>{s.processing}</td>
                                    <td
                                        style={{
                                            ...cell,
                                            fontWeight: s.failed > 0 ? 600 : 400,
                                            color: s.failed > 0 ? '#b91c1c' : undefined,
                                        }}
                                    >
                                        {s.failed}
                                    </td>
                                    <td style={cell}>{formatAge(s.oldestPendingAt, now)}</td>
                                </tr>,
                                s.drift && (
                                    <tr key={`${s.stream}-drift`} style={{ background: '#fef2f2' }}>
                                        <td colSpan={9} style={{ ...cell, color: '#b91c1c' }}>
                                            {DRIFT_MESSAGES[s.drift] ?? s.drift}
                                        </td>
                                    </tr>
                                ),
                                expanded === s.stream && s.lag && (
                                    <tr key={`${s.stream}-parts`}>
                                        <td colSpan={9} style={{ ...cell, color: '#6b7280' }}>
                                            {s.lag.partitions.map(p => (
                                                <div key={p.partition}>
                                                    partition {p.partition}: committed{' '}
                                                    {p.committedOffset ?? 'never'} / end{' '}
                                                    {p.endOffset} / lag {p.lag ?? 'unknown'}
                                                </div>
                                            ))}
                                        </td>
                                    </tr>
                                ),
                            ];
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
