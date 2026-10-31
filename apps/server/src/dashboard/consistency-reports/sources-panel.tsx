import { useEffect, useState } from 'react';
import { api, Badge } from '@vendure/dashboard';

import { consistencySourcesDocument } from './consistency-reports.graphql.js';
import {
    countEntries,
    formatLag,
    healthVariant,
    livenessOnlyTypes,
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

function NotChecked({ source }: Readonly<{ source: Source }>) {
    const liveness = livenessOnlyTypes(source.coveredEntityTypes);
    if (source.ignoredEntityTypes.length === 0 && liveness.length === 0) return null;
    return (
        <div className="text-xs border-t pt-2 space-y-1">
            <div className="font-medium">Not checked</div>
            {source.ignoredEntityTypes.map(i => (
                <div key={i.entityType}>
                    <code>{i.entityType}</code>
                    <span className="text-muted-foreground">: {i.reason}</span>
                </div>
            ))}
            {liveness.length > 0 && (
                <div className="text-muted-foreground">
                    {liveness.join(', ')}: stream liveness only (no content check).
                </div>
            )}
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
            <NotChecked source={source} />
        </div>
    );
}

export function SourcesPanel() {
    const [sources, setSources] = useState<Source[] | null>(null);
    const [failed, setFailed] = useState(false);

    // Must stay in useEffect: a bare render-body load causes a request storm (see dashboard-extension-rules).
    useEffect(() => {
        let active = true;
        api.query(consistencySourcesDocument)
            .then(d => active && setSources(d.consistencySources))
            .catch(() => active && setFailed(true));
        return () => {
            active = false;
        };
    }, []);

    if (failed)
        return <div className="text-destructive text-sm">Could not load report sources.</div>;
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
