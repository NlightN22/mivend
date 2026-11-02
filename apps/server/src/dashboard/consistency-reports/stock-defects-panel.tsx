import { Badge } from '@vendure/dashboard';

import { stockDefectsView } from './consistency-display.js';

export function StockDefectsPanel({ summary }: Readonly<{ summary: unknown }>) {
    const view = stockDefectsView(summary);
    if (!view) return null;
    return (
        <div className="text-xs space-y-1">
            <div className="flex items-center gap-2">
                <span className="font-medium">Stock source-data defects</span>
                <Badge variant={view.status === 'ok' ? 'secondary' : 'outline'}>
                    Integration Service: {view.status}
                </Badge>
                {view.fetchedAt && (
                    <span className="text-muted-foreground">
                        as of {new Date(view.fetchedAt).toLocaleString()}
                    </span>
                )}
            </div>
            <table className="w-full">
                <thead className="text-muted-foreground">
                    <tr>
                        <th className="text-left font-normal">Defect</th>
                        <th className="text-right font-normal">Search mirror</th>
                        <th className="text-right font-normal">Integration Service</th>
                    </tr>
                </thead>
                <tbody>
                    {view.rows.map(r => (
                        <tr key={r.kind} className={r.differs ? 'text-destructive' : undefined}>
                            <td>{r.label}</td>
                            <td className="text-right">{r.mirror}</td>
                            <td
                                className={`text-right ${view.status === 'ok' ? '' : 'text-muted-foreground'}`}
                            >
                                {r.integrationService ?? '—'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="text-muted-foreground">
                Defects of the ERP data itself (kinds overlap); a mismatch between the two columns
                is drift.
            </div>
        </div>
    );
}
