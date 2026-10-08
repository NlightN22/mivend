import { Injectable } from '@nestjs/common';
import {
    Brackets,
    DataSource,
    ObjectLiteral,
    SelectQueryBuilder,
    WhereExpressionBuilder,
} from 'typeorm';

import { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import { IntegrationOutboxEntry } from './entities/integration-outbox-entry.entity';
import { OUTBOUND_EVENT_TYPES } from './outbound-event-types';
import type { OutboundEventType } from './outbound-event-types';
import { escapeLike, parseFilter, parsePaging, parseSort } from './list-options';
import type { FilterNode, ListOptionsInput } from './list-options';

export interface IntegrationEventList<T> {
    items: T[];
    totalItems: number;
}

export interface OutboxProblemRow {
    id: string;
    eventId: string;
    eventType: string;
    status: string;
    retryCount: number;
    lastError: string | null;
    lastErrorAt: Date | null;
    firstFailedAt: Date | null;
    nextRetryAt: Date | null;
    createdAt: Date;
    subjectId: string | null;
}

const INBOX_FILTER_FIELDS = {
    stream: 'e.stream',
    entityId: 'e.entityId',
    status: 'e.status',
    outcome: 'e.outcome',
    lastError: 'e.lastError',
    outcomeReason: 'e.outcomeReason',
};
const INBOX_SORT_FIELDS = {
    stream: 'e.stream',
    entityId: 'e.entityId',
    status: 'e.status',
    attempts: 'e.attempts',
    firstFailedAt: 'e.firstFailedAt',
    updatedAt: 'e.updatedAt',
};
const OUTBOX_FILTER_FIELDS = {
    eventType: 'e.eventType',
    eventId: 'e.eventId',
    status: 'e.status',
    lastError: 'e.lastError',
};
const OUTBOX_SORT_FIELDS = {
    eventType: 'e.eventType',
    status: 'e.status',
    retryCount: 'e.retryCount',
    lastErrorAt: 'e.lastErrorAt',
    createdAt: 'e.createdAt',
};

function leaf(
    qb: WhereExpressionBuilder,
    node: Extract<FilterNode, { kind: 'cond' }>,
    param: string,
): void {
    const column = node.column;
    switch (node.op) {
        case 'eq':
            return void qb.where(`${column} = :${param}`, { [param]: node.value });
        case 'neq':
            return void qb.where(`${column} != :${param}`, { [param]: node.value });
        case 'like':
            return void qb.where(`${column} ILIKE :${param} ESCAPE '\\'`, {
                [param]: `%${escapeLike(String(node.value))}%`,
            });
        case 'nlike':
            return void qb.where(`${column} NOT ILIKE :${param} ESCAPE '\\'`, {
                [param]: `%${escapeLike(String(node.value))}%`,
            });
        case 'in':
            return void qb.where(`${column} IN (:...${param})`, { [param]: node.value });
        case 'nin':
            return void qb.where(`${column} NOT IN (:...${param})`, { [param]: node.value });
        case 'isnull':
            return void qb.where(node.value ? `${column} IS NULL` : `${column} IS NOT NULL`);
    }
}

function buildBrackets(node: FilterNode, counter: { n: number }): Brackets {
    return new Brackets(qb => {
        if (node.kind === 'cond') {
            leaf(qb, node, `p${counter.n++}`);
            return;
        }
        for (const child of node.children) {
            const inner = buildBrackets(child, counter);
            if (node.operator === 'OR') qb.orWhere(inner);
            else qb.andWhere(inner);
        }
    });
}

function applyList(
    qb: SelectQueryBuilder<ObjectLiteral>,
    options: ListOptionsInput,
    filterFields: Record<string, string>,
    sortFields: Record<string, string>,
    fallbackSort: { column: string; direction: 'ASC' | 'DESC' },
): void {
    const node = parseFilter(options, filterFields);
    if (node) qb.andWhere(buildBrackets(node, { n: 0 }));
    const [first, ...rest] = parseSort(options, sortFields, fallbackSort);
    qb.orderBy(first.column, first.direction);
    for (const spec of rest) qb.addOrderBy(spec.column, spec.direction);
    qb.addOrderBy('e.id', 'DESC');
    const { skip, take } = parsePaging(options);
    qb.skip(skip).take(take);
}

// Read model for the integration-health drill-down pages. Never selects payloads.
@Injectable()
export class IntegrationEventListService {
    constructor(private readonly dataSource: DataSource) {}

    async listInboxIssues(
        options: ListOptionsInput = {},
    ): Promise<IntegrationEventList<IntegrationInboxEvent>> {
        const qb = this.dataSource
            .getRepository(IntegrationInboxEvent)
            .createQueryBuilder('e')
            .select([
                'e.id',
                'e.stream',
                'e.entityId',
                'e.status',
                'e.attempts',
                'e.firstFailedAt',
                'e.lastError',
                'e.updatedAt',
                'e.outcome',
                'e.outcomeReason',
            ])
            .where(
                new Brackets(b =>
                    b
                        .where(`e.status IN ('failed', 'replay_requested')`)
                        .orWhere(`e.outcome = 'noop'`),
                ),
            );
        applyList(qb, options, INBOX_FILTER_FIELDS, INBOX_SORT_FIELDS, {
            column: 'e.updatedAt',
            direction: 'DESC',
        });
        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }

    async listOutboxProblems(
        options: ListOptionsInput = {},
    ): Promise<IntegrationEventList<OutboxProblemRow>> {
        const qb = this.dataSource
            .getRepository(IntegrationOutboxEntry)
            .createQueryBuilder('e')
            .where(`e.status IN ('failed', 'skipped')`);
        applyList(qb, options, OUTBOX_FILTER_FIELDS, OUTBOX_SORT_FIELDS, {
            column: 'e.createdAt',
            direction: 'DESC',
        });
        const [entries, totalItems] = await qb.getManyAndCount();
        return { items: entries.map(toOutboxProblemRow), totalItems };
    }
}

function toOutboxProblemRow(entry: IntegrationOutboxEntry): OutboxProblemRow {
    const registered = OUTBOUND_EVENT_TYPES[entry.eventType as OutboundEventType];
    const subject = registered ? entry.payload[registered.subjectKey] : undefined;
    return {
        id: String(entry.id),
        eventId: entry.eventId,
        eventType: entry.eventType,
        status: entry.status,
        retryCount: entry.retryCount,
        lastError: entry.lastError,
        lastErrorAt: entry.lastErrorAt,
        firstFailedAt: entry.firstFailedAt,
        nextRetryAt: entry.nextRetryAt,
        createdAt: entry.createdAt,
        subjectId: typeof subject === 'string' ? subject : null,
    };
}
