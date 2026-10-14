import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';
import { OrderStatusReference, OrderStatusReferenceService } from '@mivend/plugin-erp-order';
import type { OrderStatusReferenceInput } from '@mivend/plugin-erp-order';

const { schema, extra } = testSchemaOptions('order_status_reference');
const ctx = {} as RequestContext;
let dataSource: DataSource;
let service: OrderStatusReferenceService;

const input = (overrides: Partial<OrderStatusReferenceInput> = {}): OrderStatusReferenceInput => ({
    code: 'PICKING',
    version: '2026-10-14T10:00:00Z',
    isDeleted: false,
    name: 'Picking',
    rank: 5,
    terminal: false,
    customerVisible: true,
    description: 'Order is being picked',
    ...overrides,
});

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [OrderStatusReference],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new OrderStatusReferenceService(
        createTestConnection(dataSource) as unknown as TransactionalConnection,
    );
});

beforeEach(async () => {
    await dataSource.getRepository(OrderStatusReference).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const rows = (): Promise<OrderStatusReference[]> =>
    dataSource.getRepository(OrderStatusReference).find();

describe('OrderStatusReferenceService', () => {
    it('stores a new entry', async () => {
        expect(await service.apply(ctx, input())).toBe('applied');

        expect(await rows()).toMatchObject([
            { code: 'PICKING', name: 'Picking', rank: 5, customerVisible: true },
        ]);
    });

    it('applies a duplicate delivery of the same message once', async () => {
        await service.apply(ctx, input());

        expect(await service.apply(ctx, input({ name: 'Changed, same version' }))).toBe('stale');

        const stored = await rows();
        expect(stored).toHaveLength(1);
        expect(stored[0].name).toBe('Picking');
    });

    it('ignores an older version that arrives after a newer one', async () => {
        await service.apply(ctx, input({ version: '2026-10-14T12:00:00Z', name: 'New' }));

        expect(await service.apply(ctx, input({ version: '2026-10-14T09:00:00Z' }))).toBe('stale');

        expect((await rows())[0].name).toBe('New');
    });

    it('updates the entry on a newer version', async () => {
        await service.apply(ctx, input());

        await service.apply(
            ctx,
            input({ version: '2026-10-15T00:00:00Z', description: 'Edited', rank: 6 }),
        );

        expect(await rows()).toMatchObject([{ description: 'Edited', rank: 6 }]);
    });

    it('keeps a tombstone deleted against a late older upsert, and drops it from lookups', async () => {
        await service.apply(ctx, input());
        await service.apply(ctx, input({ version: '2026-10-15T00:00:00Z', isDeleted: true }));

        expect(await service.apply(ctx, input({ version: '2026-10-14T11:00:00Z' }))).toBe('stale');

        expect(await service.findActive(ctx, 'PICKING')).toBeNull();
        expect((await service.ranks(ctx)).has('PICKING')).toBe(false);
    });

    it('does not create a row for the deletion of an unknown status', async () => {
        expect(await service.apply(ctx, input({ isDeleted: true }))).toBe('unknown-deleted');

        expect(await rows()).toHaveLength(0);
    });

    it('ends on the newest version when writers race', async () => {
        const versions = Array.from({ length: 8 }, (_, i) => `2026-10-14T1${i}:00:00Z`);
        const shuffled = [...versions].sort(() => Math.random() - 0.5);

        await Promise.all(
            shuffled.map(version => service.apply(ctx, input({ version, name: version }))),
        );

        const stored = await rows();
        expect(stored).toHaveLength(1);
        expect(stored[0].sourceVersion).toBe(versions[7]);
    });
});
