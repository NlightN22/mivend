import {
    Badge,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@vendure/dashboard';

import { countComparisonView } from './count-comparison-view.js';
import { formatLag, streamLags } from './consistency-display.js';
import { DataSection } from './data-section.js';

export function CountComparisonPanel({ summary }: Readonly<{ summary: unknown }>) {
    const rows = countComparisonView(summary);
    if (rows.length === 0) return null;
    const lags = new Map(streamLags(summary).map(s => [s.stream, s.lagSeconds]));
    return (
        <DataSection title="Entity counts" hint="Search mirror against Integration Service">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Stream</TableHead>
                        <TableHead className="text-right">Mirror</TableHead>
                        <TableHead className="text-right">Integration Service</TableHead>
                        <TableHead className="text-right">Difference</TableHead>
                        <TableHead>Lag</TableHead>
                        <TableHead>Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map(r => {
                        const lag = lags.get(r.stream);
                        const diff =
                            r.mirror !== null && r.expected !== null ? r.mirror - r.expected : null;
                        return (
                            <TableRow
                                key={r.stream}
                                className={r.differs ? 'bg-destructive/5' : ''}
                            >
                                <TableCell className="font-medium">{r.stream}</TableCell>
                                <TableCell className="text-right">{r.mirror ?? '—'}</TableCell>
                                <TableCell className="text-right">{r.expected ?? '—'}</TableCell>
                                <TableCell
                                    className={`text-right ${r.differs ? 'text-destructive' : 'text-muted-foreground'}`}
                                >
                                    {diff === null || diff === 0
                                        ? '—'
                                        : diff > 0
                                          ? `+${diff}`
                                          : diff}
                                </TableCell>
                                <TableCell>{lag === undefined ? '—' : formatLag(lag)}</TableCell>
                                <TableCell>
                                    <Badge variant={r.status === 'ok' ? 'secondary' : 'outline'}>
                                        {r.status}
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </DataSection>
    );
}
