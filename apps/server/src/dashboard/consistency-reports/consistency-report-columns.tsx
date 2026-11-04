import { Badge } from '@vendure/dashboard';

import { figureText } from './consistency-display.js';

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
    status: string;
    lastDetectedAt: string;
}

function col(keys: Array<keyof Row>, header: string, cell: (r: Row) => React.ReactNode) {
    return {
        meta: { dependencies: keys },
        header: () => header,
        cell: ({ row }: { row: { original: Row } }) => cell(row.original),
    };
}

const date = (v?: string | null) => (v ? new Date(v).toLocaleString() : '—');

// Real scalar fields of a Node type: they override the generated columns (never additionalColumns).
// Fields folded into another column are hidden by default (see defaultHidden).
export const reportColumns = {
    status: col(['status'], 'Status', r => (
        <Badge variant={r.status === 'open' ? 'outline' : 'secondary'}>{r.status}</Badge>
    )),
    severity: col(['severity'], 'Severity', r => (
        <Badge variant={r.severity === 'critical' ? 'destructive' : 'outline'}>{r.severity}</Badge>
    )),
    details: col(['type', 'details', 'number'], 'Problem', r => (
        <div className="max-w-xl whitespace-normal">
            <div className="font-medium">
                {r.type} <span className="text-xs text-muted-foreground">#{r.number}</span>
            </div>
            <div className="text-xs text-muted-foreground line-clamp-2" title={r.details}>
                {r.details}
            </div>
        </div>
    )),
    entityId: col(['entityType', 'entityId'], 'Entity', r => (
        <div className="max-w-56">
            <div className="font-medium">{r.entityType}</div>
            <code className="block truncate text-xs text-muted-foreground" title={r.entityId}>
                {r.entityId}
            </code>
        </div>
    )),
    expected: col(['expected', 'actual'], 'Expected → actual', r => (
        <span
            className="text-xs whitespace-nowrap"
            title={`${figureText(r.expected, 400)} → ${figureText(r.actual, 400)}`}
        >
            {figureText(r.expected)} → {figureText(r.actual)}
        </span>
    )),
    lastDetectedAt: col(['lastDetectedAt', 'occurrences'], 'Last detected', r => (
        <div className="whitespace-nowrap">
            <div>{date(r.lastDetectedAt)}</div>
            <div className="text-xs text-muted-foreground">seen {r.occurrences}×</div>
        </div>
    )),
    source: col(['source'], 'Source', r => (
        <span className="text-muted-foreground">{r.source}</span>
    )),
};

export const reportColumnOrder = Object.keys(reportColumns);

// Generated columns that are now part of a combined one; the list stays free of them.
export const defaultHidden = {
    id: false,
    number: false,
    type: false,
    entityType: false,
    actual: false,
    occurrences: false,
    replayable: false,
    firstDetectedAt: false,
    resolvedAt: false,
};
