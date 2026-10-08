import { randomUUID } from 'crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { IntegrationOutboxEntry } from '../../../entities/integration-outbox-entry.entity';
import { IntegrationEventListService } from '../../../integration-event-list.service';
import { IntegrationInboxService } from '../../../integration-inbox.service';
import type { InboundStream } from '../../../types';

let dataSource: DataSource;
let inbox: IntegrationInboxService;
let lists: IntegrationEventListService;

const { schema, extra } = testSchemaOptions('erp_integration_event_lists');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [IntegrationInboxEvent, IntegrationOutboxEntry],
        synchronize: true,
    });
    await dataSource.initialize();
    inbox = new IntegrationInboxService(dataSource);
    lists = new IntegrationEventListService(dataSource);
});

afterEach(async () => {
    await dataSource.getRepository(IntegrationInboxEvent).clear();
    await dataSource.getRepository(IntegrationOutboxEntry).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

async function seedInbox(
    stream: InboundStream,
    entityId: string,
    patch: Omit<Partial<IntegrationInboxEvent>, 'payload'>,
): Promise<number> {
    const row = await inbox.enqueue({
        stream,
        entityId,
        version: '1',
        sourceEventId: `evt-${stream}-${entityId}`,
        payload: { secret: 'must-not-leak' },
    });
    await dataSource.getRepository(IntegrationInboxEvent).update(row.id, patch);
    return row.id;
}

describe('listInboxIssues', () => {
    it('lists only failed and no-op rows; pending, applied and resolved rows stay out', async () => {
        await seedInbox('bank', 'b-failed', { status: 'failed', lastError: 'boom', attempts: 3 });
        await seedInbox('bank', 'b-noop', {
            status: 'processed',
            outcome: 'noop',
            outcomeReason: 'no name',
        });
        await seedInbox('bank', 'b-pending', {});
        await seedInbox('bank', 'b-applied', { status: 'processed', outcome: 'applied' });
        await seedInbox('bank', 'b-resolved', { status: 'resolved' });

        const { items, totalItems } = await lists.listInboxIssues();

        expect(totalItems).toBe(2);
        expect(items.map(i => i.entityId).sort()).toEqual(['b-failed', 'b-noop']);
        expect(items.every(i => !('payload' in i) || i.payload === undefined)).toBe(true);
    });

    it('filters by stream and by text with LIKE wildcards escaped, and sorts', async () => {
        await seedInbox('bank', 'e1', { status: 'failed', lastError: '50% off failed' });
        await seedInbox('bank', 'e2', { status: 'failed', lastError: '500 rows failed' });
        await seedInbox('unit', 'e3', { status: 'failed', lastError: 'x' });

        const byStream = await lists.listInboxIssues({ filter: { stream: { eq: 'unit' } } });
        expect(byStream.items.map(i => i.entityId)).toEqual(['e3']);

        const byText = await lists.listInboxIssues({ filter: { lastError: { contains: '50%' } } });
        expect(byText.items.map(i => i.entityId)).toEqual(['e1']);

        const sorted = await lists.listInboxIssues({ sort: { entityId: 'DESC' } });
        expect(sorted.items.map(i => i.entityId)).toEqual(['e3', 'e2', 'e1']);
    });

    it('applies the dashboard search shape: filterOperator OR across fields', async () => {
        await seedInbox('bank', 'needle-id', { status: 'failed', lastError: 'a' });
        await seedInbox('bank', 'other', { status: 'failed', lastError: 'has needle' });
        await seedInbox('bank', 'none', { status: 'failed', lastError: 'zzz' });

        const { items } = await lists.listInboxIssues({
            filterOperator: 'OR',
            filter: { entityId: { contains: 'needle' }, lastError: { contains: 'needle' } },
        });

        expect(items.map(i => i.entityId).sort()).toEqual(['needle-id', 'other']);
    });

    it('keeps dashboard column filters (_and) ANDed when a search term arrives with filterOperator OR', async () => {
        await seedInbox('bank', 'needle-bank', { status: 'failed', lastError: 'a' });
        await seedInbox('unit', 'needle-unit', { status: 'failed', lastError: 'a' });

        const { items } = await lists.listInboxIssues({
            filterOperator: 'OR',
            filter: {
                _and: [{ stream: { eq: 'bank' } }],
                entityId: { contains: 'needle' },
                lastError: { contains: 'needle' },
            },
        });

        expect(items.map(i => i.entityId)).toEqual(['needle-bank']);
    });

    it('paginates server-side and reports the real total', async () => {
        for (let n = 0; n < 5; n++) await seedInbox('bank', `p${n}`, { status: 'failed' });

        const page = await lists.listInboxIssues({ skip: 2, take: 2, sort: { entityId: 'ASC' } });

        expect(page.totalItems).toBe(5);
        expect(page.items.map(i => i.entityId)).toEqual(['p2', 'p3']);
    });

    it('rejects a filter on a column that is not whitelisted (payload)', async () => {
        await expect(
            lists.listInboxIssues({ filter: { payload: { contains: 'x' } } }),
        ).rejects.toThrow('Cannot filter on "payload"');
    });
});

describe('listOutboxProblems', () => {
    async function seedOutbox(patch: Partial<IntegrationOutboxEntry>): Promise<void> {
        await dataSource.getRepository(IntegrationOutboxEntry).save({
            eventId: randomUUID(),
            eventType: 'order.submitted',
            payload: { orderId: 'order-1', secretLine: 'must-not-leak' },
            status: 'pending',
            ...patch,
        });
    }

    it('lists failed and skipped rows with the subject id and without the payload', async () => {
        await seedOutbox({ status: 'failed', lastError: 'broker down', retryCount: 4 });
        await seedOutbox({
            status: 'skipped',
            lastError: 'no organizationId',
            payload: { orderId: 'order-2' },
        });
        await seedOutbox({ status: 'pending' });
        await seedOutbox({ status: 'published' });
        await seedOutbox({ status: 'resolved' });

        const { items, totalItems } = await lists.listOutboxProblems();

        expect(totalItems).toBe(2);
        expect(items.map(i => i.subjectId).sort()).toEqual(['order-1', 'order-2']);
        expect(JSON.stringify(items)).not.toContain('must-not-leak');
    });

    it('filters by status and event type', async () => {
        await seedOutbox({ status: 'failed' });
        await seedOutbox({ status: 'skipped' });

        const skipped = await lists.listOutboxProblems({ filter: { status: { eq: 'skipped' } } });
        expect(skipped.items.map(i => i.status)).toEqual(['skipped']);

        const none = await lists.listOutboxProblems({
            filter: { eventType: { eq: 'other.type' } },
        });
        expect(none.totalItems).toBe(0);
    });
});
