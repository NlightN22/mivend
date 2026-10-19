import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import type { InboundStream } from './types';

export interface RejectedInboxMessage {
    stream: InboundStream;
    partition: number;
    offset: string;
    reason: string;
    entityId?: string;
    sourceEventId?: string;
    payload: Record<string, unknown>;
    // Set only for a decode failure (#213) — the durable signal behind IntegrationInboxEvent.undecodable.
    undecodable?: boolean;
}

// Dead-letters a message that can never be processed as a `failed` inbox row; the synthetic ids
// make a redelivery of the same offset a no-op (docs/integration-health.md).
export async function insertRejectedInboxRow(
    connection: TransactionalConnection,
    ctx: RequestContext,
    message: RejectedInboxMessage,
): Promise<void> {
    const position = `${message.partition}:${message.offset}`;
    const now = new Date();
    await connection
        .getRepository(ctx, IntegrationInboxEvent)
        .createQueryBuilder()
        .insert()
        .values({
            stream: message.stream,
            entityId: message.entityId || `rejected@${position}`,
            version: '',
            sourceEventId: message.sourceEventId || `rejected@${position}`,
            payload: message.payload as never,
            status: 'failed',
            attempts: 0,
            lastError: message.reason,
            firstFailedAt: now,
            undecodable: message.undecodable === true,
        })
        .orIgnore()
        .execute();
}
