import {
    Badge,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@vendure/dashboard';

import { stockDefectsView } from './consistency-display.js';
import { DataSection } from './data-section.js';

export function StockDefectsPanel({ summary }: Readonly<{ summary: unknown }>) {
    const view = stockDefectsView(summary);
    if (!view) return null;
    const muted = view.status === 'ok' ? '' : 'text-muted-foreground';
    return (
        <DataSection
            title="Stock source-data defects"
            hint="Defects of the ERP data itself (kinds overlap); a difference is drift"
            aside={
                <>
                    <Badge variant={view.status === 'ok' ? 'secondary' : 'outline'}>
                        Integration Service: {view.status}
                    </Badge>
                    {view.fetchedAt && (
                        <span className="text-xs text-muted-foreground">
                            as of {new Date(view.fetchedAt).toLocaleString()}
                        </span>
                    )}
                </>
            }
        >
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Defect</TableHead>
                        <TableHead className="text-right">Search mirror</TableHead>
                        <TableHead className="text-right">Integration Service</TableHead>
                        <TableHead className="text-right">Difference</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {view.rows.map(r => (
                        <TableRow key={r.kind} className={r.differs ? 'bg-destructive/5' : ''}>
                            <TableCell className="font-medium">{r.label}</TableCell>
                            <TableCell className="text-right">{r.mirror}</TableCell>
                            <TableCell className={`text-right ${muted}`}>
                                {r.integrationService ?? '—'}
                            </TableCell>
                            <TableCell
                                className={`text-right ${r.differs ? 'text-destructive' : 'text-muted-foreground'}`}
                            >
                                {r.differs && r.integrationService !== null
                                    ? r.mirror - r.integrationService
                                    : '—'}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </DataSection>
    );
}
