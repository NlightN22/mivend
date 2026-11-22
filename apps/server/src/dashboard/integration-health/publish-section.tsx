import {
    Badge,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@vendure/dashboard';

import { formatAgeSeconds, stateBadgeVariant } from './exchange-health-view.js';
import { formatAge } from './stream-health-view.js';

export interface PublishAggregate {
    aggregateType: string;
    status: string;
    mappingErrorsLast24h: number | null;
    mappingErrorCodes: string[];
    deadLetteredLast24h: number | null;
    pending: number | null;
    oldestPendingAgeSeconds: number | null;
    lastPublishedAt: string | null;
}

export interface MappingErrorRow {
    kind: string;
    code: string;
    message: string;
    occurrences: number | null;
}

export interface PublishChannelView {
    status: string;
    aggregates: PublishAggregate[];
}

const dash = (n: number | null): string | number => (n === null ? '—' : n);

export function PublishSection({
    publish,
    errors,
    now,
}: Readonly<{ publish: PublishChannelView; errors: MappingErrorRow[]; now: number }>) {
    return (
        <div className="mt-4">
            <p className="mb-2">
                <span className="text-muted-foreground">
                    Publish (Integration Service to Kafka):{' '}
                </span>
                <Badge variant={stateBadgeVariant(publish.status)}>{publish.status}</Badge>
            </p>
            {publish.aggregates.length > 0 && (
                <div className="rounded-md border bg-background">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Entity</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Pending</TableHead>
                                <TableHead>Oldest</TableHead>
                                <TableHead>Dead-lettered 24 h</TableHead>
                                <TableHead>Mapping errors 24 h</TableHead>
                                <TableHead>Last published</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {publish.aggregates.map(a => (
                                <TableRow key={a.aggregateType}>
                                    <TableCell className="font-medium">{a.aggregateType}</TableCell>
                                    <TableCell>
                                        <Badge variant={stateBadgeVariant(a.status)}>
                                            {a.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{dash(a.pending)}</TableCell>
                                    <TableCell>
                                        {formatAgeSeconds(a.oldestPendingAgeSeconds)}
                                    </TableCell>
                                    <TableCell>{dash(a.deadLetteredLast24h)}</TableCell>
                                    <TableCell>
                                        {dash(a.mappingErrorsLast24h)}
                                        {a.mappingErrorCodes.length > 0 &&
                                            ` · ${a.mappingErrorCodes.join(', ')}`}
                                    </TableCell>
                                    <TableCell>
                                        {a.lastPublishedAt
                                            ? `${formatAge(a.lastPublishedAt, now)} ago`
                                            : '—'}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
            {errors.length > 0 && (
                <div className="mt-2">
                    <p className="text-muted-foreground">Active mapping errors</p>
                    {errors.map(e => (
                        <p key={`${e.kind}-${e.code}-${e.message}`}>
                            {e.kind} · {e.code} · {e.message}
                            {e.occurrences !== null ? ` (×${e.occurrences})` : ''}
                        </p>
                    ))}
                </div>
            )}
        </div>
    );
}
