import { DataSource } from 'typeorm';

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
}

// Dead-letters a message that can never be processed as a `failed` inbox row; the synthetic ids
// make a redelivery of the same offset a no-op (docs/integration-health.md).
export async function insertRejectedInboxRow(
    dataSource: DataSource,
    message: RejectedInboxMessage,
): Promise<void> {
    const position = `${message.partition}:${message.offset}`;
    const now = new Date();
    await dataSource
        .getRepository(IntegrationInboxEvent)
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
        })
        .orIgnore()
        .execute();
}
