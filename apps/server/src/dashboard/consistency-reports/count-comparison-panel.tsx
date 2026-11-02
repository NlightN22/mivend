import { Badge } from '@vendure/dashboard';

import { countComparisonView } from './count-comparison-view.js';

export function CountComparisonPanel({ summary }: Readonly<{ summary: unknown }>) {
    const rows = countComparisonView(summary);
    if (rows.length === 0) return null;
    return (
        <div className="text-xs space-y-1">
            <div className="font-medium">Entity counts: search mirror vs Integration Service</div>
            <table className="w-full">
                <thead className="text-muted-foreground">
                    <tr>
                        <th className="text-left font-normal">Stream</th>
                        <th className="text-right font-normal">Mirror</th>
                        <th className="text-right font-normal">Integration Service</th>
                        <th className="text-right font-normal">Status</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(r => (
                        <tr key={r.stream} className={r.differs ? 'text-destructive' : undefined}>
                            <td>{r.stream}</td>
                            <td className="text-right">{r.mirror ?? '—'}</td>
                            <td className="text-right">{r.expected ?? '—'}</td>
                            <td className="text-right">
                                <Badge variant={r.status === 'ok' ? 'secondary' : 'outline'}>
                                    {r.status}
                                </Badge>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
