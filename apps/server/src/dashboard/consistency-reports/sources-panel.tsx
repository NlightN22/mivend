import { useEffect, useState } from 'react';
import {
    api,
    Badge,
    Table,
    TableBody,
    TableCell,
    TableRow,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@vendure/dashboard';

import { consistencySourcesDocument } from './consistency-reports.graphql.js';
import { CountComparisonPanel } from './count-comparison-panel.js';
import { DataSection } from './data-section.js';
import { StockDefectsPanel } from './stock-defects-panel.js';
import { countComparisonView } from './count-comparison-view.js';
import { countEntries, healthVariant, stockDefectsView, totalOpen } from './consistency-display.js';

type Source = Awaited<
    ReturnType<typeof api.query<typeof consistencySourcesDocument>>
>['consistencySources'][number];

function Counts({ label, value }: Readonly<{ label: string; value: unknown }>) {
    const entries = countEntries(value);
    if (entries.length === 0) return null;
    return (
        <div className="text-xs">
            <span className="text-muted-foreground">{label}: </span>
            {entries.map(([k, n]) => `${k} ${n}`).join(', ')}
        </div>
    );
}

function NotChecked({ source }: Readonly<{ source: Source }>) {
    if (source.ignoredEntityTypes.length === 0) return null;
    return (
        <DataSection title="Not checked">
            <Table>
                <TableBody>
                    {source.ignoredEntityTypes.map(i => (
                        <TableRow key={i.entityType}>
                            <TableCell className="font-medium">{i.entityType}</TableCell>
                            <TableCell className="text-muted-foreground whitespace-normal">
                                {i.reason}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </DataSection>
    );
}

function differing(n: number): string {
    return n > 0 ? ` (${n} differ)` : '';
}

function SourceTabs({ source }: Readonly<{ source: Source }>) {
    const counts = countComparisonView(source.summary);
    const defects = stockDefectsView(source.summary);
    const notChecked = source.ignoredEntityTypes.length;
    if (counts.length === 0 && !defects && notChecked === 0) return null;
    const first = counts.length > 0 ? 'counts' : defects ? 'defects' : 'unchecked';
    return (
        <Tabs defaultValue={first} orientation="horizontal" className="flex-col gap-3">
            <TabsList className="w-fit">
                {counts.length > 0 && (
                    <TabsTrigger value="counts">
                        Entity counts{differing(counts.filter(r => r.differs).length)}
                    </TabsTrigger>
                )}
                {defects && (
                    <TabsTrigger value="defects">
                        Stock defects{differing(defects.rows.filter(r => r.differs).length)}
                    </TabsTrigger>
                )}
                {notChecked > 0 && <TabsTrigger value="unchecked">Not checked</TabsTrigger>}
            </TabsList>
            <TabsContent value="counts">
                <CountComparisonPanel summary={source.summary} />
            </TabsContent>
            <TabsContent value="defects">
                <StockDefectsPanel summary={source.summary} />
            </TabsContent>
            <TabsContent value="unchecked">
                <NotChecked source={source} />
            </TabsContent>
        </Tabs>
    );
}

function SourceCard({ source }: Readonly<{ source: Source }>) {
    const open = totalOpen(source);
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-lg font-medium">{source.source}</span>
                <Badge variant={healthVariant(source.health)}>{source.health}</Badge>
                <span className="text-sm text-muted-foreground">{open} open</span>
                <span className="text-xs text-muted-foreground sm:ml-auto">
                    Last check finished:{' '}
                    {source.lastFinishedAt
                        ? new Date(source.lastFinishedAt).toLocaleString()
                        : 'never'}
                    {' · '}Last successful poll:{' '}
                    {source.lastSuccessAt
                        ? new Date(source.lastSuccessAt).toLocaleString()
                        : 'never'}
                </span>
            </div>
            {source.health !== 'ok' && (
                <div className="text-sm text-destructive">{source.healthDetail}</div>
            )}
            <Counts label="By type" value={source.localOpenByType} />
            <Counts label="By severity" value={source.localOpenBySeverity} />
            <SourceTabs source={source} />
            <div className="pt-2">
                <div className="font-medium">Reports</div>
                <div className="text-xs text-muted-foreground">
                    {open === 0 ? 'No open reports. ' : ''}Use the Status filter to see resolved
                    ones.
                </div>
            </div>
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
        <div className="space-y-6">
            {sources.map(s => (
                <SourceCard key={s.source} source={s} />
            ))}
        </div>
    );
}
