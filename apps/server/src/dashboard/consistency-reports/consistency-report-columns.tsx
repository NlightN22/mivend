import { Badge } from '@vendure/dashboard';

import { formatJson } from './consistency-display.js';

function Json({ value }: Readonly<{ value: unknown }>) {
    return <pre className="text-xs whitespace-pre-wrap break-all max-w-56">{formatJson(value)}</pre>;
}

interface Row {
    number: number;
    source: string;
    type: string;
    severity: string;
    entityType: string;
    entityId: string;
    details: string;
    expected: unknown;
    actual: unknown;
    occurrences: number;
    replayable: boolean;
    status: string;
    lastDetectedAt: string;
    resolvedAt?: string | null;
}

function col(key: keyof Row, header: string, cell: (r: Row) => React.ReactNode) {
    return {
        meta: { dependencies: [key] },
        header: () => header,
        cell: ({ row }: { row: { original: Row } }) => cell(row.original),
    };
}

const date = (v?: string | null) => (v ? new Date(v).toLocaleString() : '—');

// Real scalar fields of a Node type: they override the generated columns (never additionalColumns).
export const reportColumns = {
    number: col('number', 'Number', r => r.number),
    source: col('source', 'Source', r => r.source),
    type: col('type', 'Type', r => r.type),
    severity: col('severity', 'Severity', r => (
        <Badge variant={r.severity === 'critical' ? 'destructive' : 'outline'}>{r.severity}</Badge>
    )),
    entityType: col('entityType', 'Entity', r => r.entityType),
    entityId: col('entityId', 'ERP id', r => <code>{r.entityId}</code>),
    details: col('details', 'Details', r => <span className="text-xs">{r.details}</span>),
    expected: col('expected', 'Expected', r => <Json value={r.expected} />),
    actual: col('actual', 'Actual', r => <Json value={r.actual} />),
    occurrences: col('occurrences', 'Seen', r => r.occurrences),
    replayable: col('replayable', 'Replayable', r => (r.replayable ? 'yes' : 'no')),
    status: col('status', 'Status', r => (
        <Badge variant={r.status === 'open' ? 'outline' : 'secondary'}>{r.status}</Badge>
    )),
    lastDetectedAt: col('lastDetectedAt', 'Last detected', r => date(r.lastDetectedAt)),
    resolvedAt: col('resolvedAt', 'Resolved at', r => date(r.resolvedAt)),
};

export const reportColumnOrder = Object.keys(reportColumns);
