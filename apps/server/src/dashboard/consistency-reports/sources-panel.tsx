import { useEffect, useState } from 'react';
import { api, Badge } from '@vendure/dashboard';

import { consistencySourcesDocument } from './consistency-reports.graphql.js';
import {
    countEntries,
    formatLag,
    healthVariant,
    streamLags,
    totalOpen,
} from './consistency-display.js';

type Source = Awaited<
    ReturnType<typeof api.query<typeof consistencySourcesDocument>>
>['consistencySources'][number];

function Counts({ label, value }: Readonly<{ label: string; value: unknown }>) {
    const entries = countEntries(value);
    return (
        <div className="text-xs">
            <span className="text-muted-foreground">{label}: </span>
            {entries.length === 0 ? 'none' : entries.map(([k, n]) => `${k} ${n}`).join(', ')}
        </div>
    );
}

function SourceCard({ source }: Readonly<{ source: Source }>) {
    const lags = streamLags(source.summary);
    return (
        <div className="rounded-md border p-4 space-y-2">
            <div className="flex items-center gap-2">
                <span className="font-medium">{source.source}</span>
                <Badge variant={healthVariant(source.health)}>{source.health}</Badge>
                <span className="text-muted-foreground text-xs">{totalOpen(source)} open</span>
            </div>
            {source.health !== 'ok' && (
                <div className="text-xs text-muted-foreground">{source.healthDetail}</div>
            )}
            <div className="text-xs text-muted-foreground">
                Last check finished:{' '}
                {source.lastFinishedAt ? new Date(source.lastFinishedAt).toLocaleString() : 'never'}
                {' · '}Last successful poll:{' '}
                {source.lastSuccessAt ? new Date(source.lastSuccessAt).toLocaleString() : 'never'}
            </div>
            {lags.length > 0 && (
                <div className="text-xs">
                    <span className="text-muted-foreground">Stream lag: </span>
                    {lags.map(s => `${s.stream} ${formatLag(s.lagSeconds)}`).join(', ')}
                </div>
            )}
            <Counts label="By type" value={source.localOpenByType} />
            <Counts label="By severity" value={source.localOpenBySeverity} />
        </div>
    );
}

export function SourcesPanel() {
    const [sources, setSources] = useState<Source[] | null>(null);

    // Must stay in useEffect: a bare render-body load causes a request storm (see dashboard-extension-rules).
    useEffect(() => {
        api.query(consistencySourcesDocument)
            .then(d => setSources(d.consistencySources))
            .catch(() => setSources([]));
    }, []);

    if (sources === null)
        return <div className="text-muted-foreground text-sm">Loading sources…</div>;
    if (sources.length === 0) {
        return (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">
                No report source is configured. Set the data-drift source variables (see
                docs/environments.md) to start collecting reports.
            </div>
        );
    }
    return (
        <div className="grid gap-3 md:grid-cols-2">
            {sources.map(s => (
                <SourceCard key={s.source} source={s} />
            ))}
        </div>
    );
}
