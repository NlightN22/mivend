import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { IntegrationInboxService } from '../../../integration-inbox.service';
import type { InboundStream } from '../../../types';

// Real Postgres: the level ordering, the parked share and the per-stream lookups are SQL behaviour.
let dataSource: DataSource;
let levels: Map<string, number>;
let inbox: IntegrationInboxService;

const { schema, extra } = testSchemaOptions('erp_integration_inbox_levels');

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
    levels = new Map();
    inbox = new IntegrationInboxService(createTestConnection(dataSource), {
        getLevels: () => levels,
    });
});

afterEach(async () => {
    await dataSource.getRepository(IntegrationInboxEvent).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

let seq = 0;
async function seed(
    stream: InboundStream,
    ageSeconds: number,
    status: 'pending' | 'dependency_missing' = 'pending',
): Promise<string> {
    seq += 1;
    const rows = await dataSource.query(
        `INSERT INTO integration_inbox_event (stream, entity_id, version, source_event_id, payload, status, eligible_at, next_retry_at)
         VALUES ($1, $2, '1', $3, '{}', $4, now() - ($5 || ' seconds')::interval, NULL)
         RETURNING id`,
        [stream, `e-${seq}`, `s-${seq}`, status, String(ageSeconds)],
    );
    return String(rows[0].id);
}

const claim = async (limit: number, streams?: InboundStream[]): Promise<string[]> =>
    (await inbox.claimBatch(testRequestContext, limit, streams)).map(r => String(r.id));

describe('claimBatch level order (real Postgres)', () => {
    it('claims a lower-level event before an older higher-level event', async () => {
        levels = new Map([
            ['currency', 0],
            ['price', 3],
        ]);
        const doc = await seed('price', 100);
        const catalog = await seed('currency', 1);
        expect(await claim(2)).toEqual([catalog, doc]);
    });

    it('claims streams absent from the table after every listed level', async () => {
        levels = new Map([['price', 3]]);
        const unlisted = await seed('category', 500);
        const listed = await seed('price', 1);
        expect(await claim(2)).toEqual([listed, unlisted]);
    });

    it('keeps FIFO order while the table is empty', async () => {
        levels = new Map();
        const older = await seed('price', 100);
        const newer = await seed('currency', 1);
        expect(await claim(2)).toEqual([older, newer]);
    });

    it('applies the level order to a stream-filtered claim too', async () => {
        levels = new Map([
            ['currency', 0],
            ['price', 3],
        ]);
        const doc = await seed('price', 100);
        const catalog = await seed('currency', 1);
        await seed('product', 1);
        expect(await claim(5, ['price', 'currency'])).toEqual([catalog, doc]);
    });

    it('gives due parked rows a share of the batch when pending is large', async () => {
        levels = new Map([['price', 3]]);
        for (let i = 0; i < 20; i++) await seed('price', 100 + i);
        const parked = await seed('price', 1, 'dependency_missing');
        const batch = await claim(8);
        expect(batch).toHaveLength(8);
        expect(batch).toContain(parked);
    });

    it('gives unused parked slots back to pending', async () => {
        levels = new Map([['price', 3]]);
        for (let i = 0; i < 10; i++) await seed('price', 100 + i);
        expect(await claim(8)).toHaveLength(8);
    });

    it('starves no stream: repeated batches drain every stream', async () => {
        levels = new Map([
            ['currency', 0],
            ['price', 3],
            ['stock', 4],
        ]);
        const all = new Set<string>();
        for (const stream of ['stock', 'price', 'currency', 'category'] as InboundStream[]) {
            for (let i = 0; i < 6; i++) all.add(await seed(stream, 100 - i));
        }
        all.add(await seed('price', 1, 'dependency_missing'));
        const seen = new Set<string>();
        for (let round = 0; round < 10 && seen.size < all.size; round++) {
            for (const id of await claim(4)) seen.add(id);
        }
        expect(seen).toEqual(all);
    });

    it('claims an old higher-level and an old unlisted row while a lower level is refilled', async () => {
        levels = new Map([
            ['currency', 0],
            ['price', 3],
        ]);
        const oldPrice = await seed('price', 3600);
        const oldUnlisted = await seed('category', 3500);
        const seen = new Set<string>();
        for (let round = 0; round < 3; round++) {
            for (let i = 0; i < 8; i++) await seed('currency', 5);
            for (const id of await claim(4)) seen.add(id);
        }
        expect(seen.has(oldPrice)).toBe(true);
        expect(seen.has(oldUnlisted)).toBe(true);
    });
});
