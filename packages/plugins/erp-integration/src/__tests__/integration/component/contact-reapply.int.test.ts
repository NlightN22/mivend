import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { ContactReapplyService } from '../../../contact-reapply.service';
import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { IntegrationReapplyCursor } from '../../../entities/integration-reapply-cursor.entity';
import { MissingReferenceError } from '../../../types';

const { schema, extra } = testSchemaOptions('contact_reapply');
let dataSource: DataSource;
let state: Map<string, unknown>;
let calls: string[];
let missing: Set<string>;
let thrower: Set<string>;
let delayMs: number;

function makeService(): ContactReapplyService {
    const replaceErpPointsByErpId = vi.fn(
        async (_ctx: unknown, kind: string, erpId: string, infos: unknown) => {
            calls.push(`${kind}:${erpId}`);
            if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
            if (thrower.has(erpId)) throw new MissingReferenceError('owner not synced');
            if (missing.has(erpId)) return false;
            state.set(`${kind}:${erpId}`, JSON.stringify(infos));
            return true;
        },
    );
    return new ContactReapplyService(
        createTestConnection(dataSource),
        { create: async () => testRequestContext } as never,
        { apply: vi.fn() } as never,
        { replaceErpPointsByErpId } as never,
        { linkWaitingContacts: vi.fn() } as never,
        { setContactInfos: vi.fn() } as never,
    );
}

async function seed(
    stream: string,
    entityId: string,
    payload: object,
    status = 'processed',
): Promise<void> {
    await dataSource.getRepository(IntegrationInboxEvent).insert({
        stream: stream as never,
        entityId,
        version: '1',
        sourceEventId: `${stream}-${entityId}-${Math.random()}`,
        payload: payload as never,
        status: status as never,
        attempts: 0,
    });
}
const infos = (value: string): object => ({
    name: 'N',
    contactInfos: [{ type: 'Телефон', presentation: value }],
});

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [IntegrationInboxEvent, IntegrationReapplyCursor],
        synchronize: true,
    });
    await dataSource.initialize();
});
beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE integration_inbox_event, integration_reapply_cursor RESTART IDENTITY',
    );
    state = new Map();
    calls = [];
    missing = new Set();
    thrower = new Set();
    delayMs = 0;
    for (let i = 1; i <= 5; i++) await seed('counterparty', `cp-${i}`, infos(`+7912000000${i}`));
    await seed('counterparty', 'cp-old', {}, 'processed');
    await seed('counterparty', 'cp-pending', infos('+79129999999'), 'pending');
    await seed('point-of-sale', 'tp-1', infos('+79120000011'));
});
afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('ContactReapplyService (real Postgres)', () => {
    it('applies processed rows only, parents first, and applying the whole set twice leaves the same state', async () => {
        const service = makeService();
        const first = await service.runTick(60_000, 2);
        expect(first).toMatchObject({ applied: 6, skipped: 0, finished: true });
        expect(calls.slice(0, 5).every(c => c.startsWith('counterparty:'))).toBe(true);
        expect(calls).not.toContain('counterparty:cp-pending');
        const once = new Map(state);

        await dataSource.query('UPDATE integration_reapply_cursor SET "lastId" = 0, done = false');
        await service.runTick(60_000, 3);
        expect(state).toEqual(once);
    });

    it('resumes from the stored cursor and never re-applies an earlier slice', async () => {
        delayMs = 5;
        const service = makeService();
        const partial = await service.runTick(1, 2);
        expect(partial.finished).toBe(false);
        const done = calls.length;
        expect(done).toBe(2);
        delayMs = 0;

        await makeService().runTick(60_000, 2);
        expect(calls.slice(done)).not.toContain('counterparty:cp-1');
        expect(new Set(calls).size).toBe(calls.length);
        expect(calls).toHaveLength(6);
    });

    it('a row whose owner is missing or not synced does not stall the slice', async () => {
        missing.add('cp-2');
        thrower.add('cp-3');
        const result = await makeService().runTick(60_000, 2);
        expect(result).toMatchObject({ applied: 4, skipped: 2, finished: true });
        expect(state.has('counterparty:cp-4')).toBe(true);
    });

    it('does nothing while another tick holds the lease', async () => {
        await makeService().runTick(1, 1);
        await dataSource.query(
            `UPDATE integration_reapply_cursor SET "lockedUntil" = now() + interval '1 minute' WHERE stream = 'counterparty'`,
        );
        const before = calls.length;
        expect(await makeService().runTick(60_000, 2)).toMatchObject({ locked: true });
        expect(calls).toHaveLength(before);
    });
});
