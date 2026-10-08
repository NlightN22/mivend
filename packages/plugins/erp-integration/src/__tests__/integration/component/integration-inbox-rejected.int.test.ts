import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { IntegrationInboxHealthService } from '../../../integration-inbox-health.service';
import { IntegrationInboxService } from '../../../integration-inbox.service';

let dataSource: DataSource;
let inbox: IntegrationInboxService;

const { schema, extra } = testSchemaOptions('erp_integration_inbox_rejected');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [IntegrationInboxEvent],
        synchronize: true,
    });
    await dataSource.initialize();
    inbox = new IntegrationInboxService(dataSource);
});

afterEach(async () => {
    await dataSource.getRepository(IntegrationInboxEvent).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('enqueueRejected', () => {
    const message = {
        stream: 'bank' as const,
        partition: 3,
        offset: '42',
        reason: 'decode failed: bad bytes',
        payload: { rawBase64: '////' },
    };

    it('stores an unprocessable message as a failed row with the reason and the raw payload', async () => {
        await inbox.enqueueRejected(message);

        const rows = await dataSource.getRepository(IntegrationInboxEvent).find();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            stream: 'bank',
            status: 'failed',
            attempts: 0,
            lastError: 'decode failed: bad bytes',
            sourceEventId: 'rejected@3:42',
            payload: { rawBase64: '////' },
        });
        expect(rows[0].firstFailedAt).not.toBeNull();
    });

    it('is idempotent: a redelivery of the same offset does not add a second row', async () => {
        await inbox.enqueueRejected(message);
        await inbox.enqueueRejected(message);

        expect(await dataSource.getRepository(IntegrationInboxEvent).count()).toBe(1);
    });

    it('is never claimed for processing and is counted as failed on the health read model', async () => {
        await inbox.enqueueRejected(message);

        expect(await inbox.claimBatch(10)).toEqual([]);
        const backlog = await new IntegrationInboxHealthService(dataSource).getBacklogByStream();
        expect(backlog.find(b => b.stream === 'bank')).toMatchObject({ failed: 1, pending: 0 });
    });

    it('keeps the identity of a decoded message that only lacks an eventId', async () => {
        await inbox.enqueueRejected({
            ...message,
            entityId: 'bank-1',
            reason: 'missing entityId/eventId',
        });

        const row = await dataSource
            .getRepository(IntegrationInboxEvent)
            .findOneByOrFail({ stream: 'bank' });
        expect(row.entityId).toBe('bank-1');
        expect(row.sourceEventId).toBe('rejected@3:42');
    });
});
