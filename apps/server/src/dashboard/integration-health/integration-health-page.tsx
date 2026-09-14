import { useState } from 'react';
import { api, graphql } from '@vendure/dashboard';

// Issue #91 — one page for the two independent "is the ERP exchange healthy" signals, kept as
// two clearly-labelled sections rather than two separate nav items: Kafka lag (broker-side —
// has the consumer fallen behind the topic) and inbox backlog (Postgres-side — rows already
// consumed/committed from Kafka but not yet processed by mivend's own worker). These numbers are
// expected to disagree (a consumer can be fully caught up with Kafka while a huge backlog waits
// on a slow processor, or vice versa during a burst) — showing them side by side, explicitly
// labelled, prevents either one being mistaken for the other. A future outbound/outbox section
// belongs here too, as a third section, rather than a new page per exchange direction.
const kafkaConsumerLagDocument = graphql(`
    query KafkaConsumerLagForDashboard {
        kafkaConsumerLag {
            topic
            stream
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
`);

const inboxBacklogDocument = graphql(`
    query IntegrationInboxBacklogForDashboard {
        integrationInboxBacklog {
            stream
            pending
            processing
            failed
        }
    }
`);

// Mirrors the poller's own default (KAFKA_LAG_WARN_THRESHOLD_DEFAULT) — this is a display-only
// highlight, not a second source of truth: the actual threshold used for the Logger.warn line
// lives in erp-integration's own plugin options and can differ per contour.
const LAG_HIGHLIGHT_THRESHOLD = 1000n;

export function isLagOverThreshold(lag: string | null): boolean {
    return lag !== null && BigInt(lag) > LAG_HIGHLIGHT_THRESHOLD;
}

interface TopicLag {
    topic: string;
    stream: string;
    totalLag: string | null;
    polledAt: string;
    partitions: { partition: number; committedOffset: string | null; endOffset: string; lag: string | null }[];
}

interface StreamBacklog {
    stream: string;
    pending: number;
    processing: number;
    failed: number;
}

export function IntegrationHealthPage() {
    const [topics, setTopics] = useState<TopicLag[]>([]);
    const [backlog, setBacklog] = useState<StreamBacklog[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState('');

    async function load(): Promise<void> {
        try {
            const [lagData, backlogData] = await Promise.all([
                api.query(kafkaConsumerLagDocument),
                api.query(inboxBacklogDocument),
            ]);
            setTopics(lagData.kafkaConsumerLag ?? []);
            setBacklog(backlogData.integrationInboxBacklog ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load integration health data');
        } finally {
            setLoaded(true);
        }
    }
    if (!loaded) {
        void load();
    }

    return (
        <div style={{ padding: 24, maxWidth: 960 }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Integration health</h1>
            <p style={{ color: '#666', marginBottom: 24 }}>
                Two independent signals for the Integration Service exchange (central hub only) —
                they measure different things and are expected to disagree.
            </p>

            {error && <div style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</div>}

            <section style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Kafka lag</h2>
                <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 12 }}>
                    Per-topic, per-partition broker-side lag, as of the last scheduled poll. A
                    "connected" consumer can still be falling behind — this is the raw signal
                    that catches that.
                </p>

                {topics.length === 0 && loaded && !error && (
                    <p style={{ color: '#6b7280' }}>No lag data yet — the poller has not run.</p>
                )}

                {topics.map(t => (
                    <div key={t.topic} style={{ marginBottom: 20 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                            {t.stream} <span style={{ color: '#6b7280', fontWeight: 400 }}>({t.topic})</span>
                        </h3>
                        <p style={{ color: '#6b7280', fontSize: 12, marginBottom: 8 }}>
                            Total lag: {t.totalLag ?? 'unknown'} · last polled {new Date(t.polledAt).toLocaleString()}
                        </p>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                                    <th style={{ padding: '4px 8px' }}>Partition</th>
                                    <th style={{ padding: '4px 8px' }}>Committed</th>
                                    <th style={{ padding: '4px 8px' }}>End offset</th>
                                    <th style={{ padding: '4px 8px' }}>Lag</th>
                                </tr>
                            </thead>
                            <tbody>
                                {t.partitions.map(p => (
                                    <tr key={p.partition} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '4px 8px' }}>{p.partition}</td>
                                        <td style={{ padding: '4px 8px', color: '#6b7280' }}>
                                            {p.committedOffset ?? 'never'}
                                        </td>
                                        <td style={{ padding: '4px 8px', color: '#6b7280' }}>{p.endOffset}</td>
                                        <td
                                            style={{
                                                padding: '4px 8px',
                                                fontWeight: isLagOverThreshold(p.lag) ? 600 : 400,
                                                color: isLagOverThreshold(p.lag) ? '#b91c1c' : undefined,
                                            }}
                                        >
                                            {p.lag ?? 'unknown'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ))}
            </section>

            <section>
                <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Inbox backlog</h2>
                <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 12 }}>
                    Rows already consumed from Kafka (offset committed) but not yet fully processed
                    by mivend's own worker — a Postgres-side number, unrelated to Kafka lag above.
                </p>

                {backlog.length === 0 && loaded && !error && (
                    <p style={{ color: '#6b7280' }}>No backlog — every stream is fully processed.</p>
                )}

                {backlog.length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                                <th style={{ padding: '4px 8px' }}>Stream</th>
                                <th style={{ padding: '4px 8px' }}>Pending</th>
                                <th style={{ padding: '4px 8px' }}>Processing</th>
                                <th style={{ padding: '4px 8px' }}>Failed</th>
                            </tr>
                        </thead>
                        <tbody>
                            {backlog.map(b => (
                                <tr key={b.stream} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '4px 8px' }}>{b.stream}</td>
                                    <td style={{ padding: '4px 8px' }}>{b.pending}</td>
                                    <td style={{ padding: '4px 8px' }}>{b.processing}</td>
                                    <td
                                        style={{
                                            padding: '4px 8px',
                                            fontWeight: b.failed > 0 ? 600 : 400,
                                            color: b.failed > 0 ? '#b91c1c' : undefined,
                                        }}
                                    >
                                        {b.failed}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>
        </div>
    );
}
