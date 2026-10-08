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

// A message that can never be processed (no value, undecodable, no identity) is dead-lettered
// straight into the inbox as a `failed` row, so it is counted on the integration-health page and
// never retried. The synthetic ids make redelivery of the same offset a no-op (dedup key).
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
