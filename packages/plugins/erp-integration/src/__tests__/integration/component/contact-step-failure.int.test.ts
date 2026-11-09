import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import type { RequestContext } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { CounterpartyStreamHandler } from '../../../handlers/counterparty.handler';
import { IntegrationInboxService } from '../../../integration-inbox.service';
import { makeInboxProcessor } from './inbox-processor-helpers';

const { schema, extra } = testSchemaOptions('contact_step_failure');
let dataSource: DataSource;
let inbox: IntegrationInboxService;
let seq = 0;
let failContacts = true;
const upserted: string[] = [];

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
    inbox = new IntegrationInboxService(createTestConnection(dataSource));
});
beforeEach(async () => {
    await dataSource.query('TRUNCATE integration_inbox_event RESTART IDENTITY');
    upserted.length = 0;
    failContacts = true;
});
afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const handler = new CounterpartyStreamHandler(
    {
        upsertActiveState: vi.fn(async (_c: unknown, erpId: string) => {
            upserted.push(erpId);
            return true;
        }),
    } as never,
    {} as never,
    {
        assignCounterpartyIfInputsChanged: async (_c: unknown, _e: string, write: () => unknown) =>
            write(),
    } as never,
    {
        guarded: async (_c: unknown, label: string, work: () => Promise<void>) => {
            try {
                await work();
                return null;
            } catch (err) {
                return `contact step failed: ${(err as Error).message} (${label})`;
            }
        },
        replaceErpPointsByErpId: vi.fn(async () => {
            if (failContacts) throw new Error('boom');
            return true;
        }),
    } as never,
    { linkWaitingContacts: vi.fn() } as never,
);

async function deliver(version: string): Promise<void> {
    seq += 1;
    await inbox.enqueue(testRequestContext, {
        stream: 'counterparty',
        entityId: 'cp-1',
        version,
        sourceEventId: `evt-${seq}`,
        payload: { name: 'Acme', isActive: true, contactInfos: [] },
    });
    await makeInboxProcessor(
        dataSource,
        inbox,
        vi.fn((c: RequestContext, id: string, p: Record<string, unknown>) =>
            handler.apply(c, id, p),
        ),
    ).processPendingBatch();
}
const rows = (): Promise<
    Array<{ status: string; outcome: string; outcome_reason: string | null }>
> =>
    dataSource.query(
        'SELECT status, outcome, outcome_reason FROM integration_inbox_event ORDER BY id',
    );

describe('contact step failure keeps the master write (real Postgres)', () => {
    it('commits the counterparty, records the failure on the processed row, and the next event succeeds', async () => {
        await deliver('1');
        expect(upserted).toEqual(['cp-1']);
        expect(await rows()).toEqual([
            {
                status: 'processed',
                outcome: 'applied',
                outcome_reason: expect.stringContaining('contact step failed: boom'),
            },
        ]);

        failContacts = false;
        await deliver('2');
        expect((await rows())[1]).toEqual({
            status: 'processed',
            outcome: 'applied',
            outcome_reason: null,
        });
    });
});
