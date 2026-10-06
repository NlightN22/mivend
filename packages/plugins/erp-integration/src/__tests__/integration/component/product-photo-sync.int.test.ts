import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DataSource, EntityManager, EntitySchema } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

vi.mock('../../../product-photo-download', async importOriginal => ({
    ...(await importOriginal<typeof import('../../../product-photo-download')>()),
    downloadVerifiedPhoto: vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 150));
        return Buffer.from('x');
    }),
}));

import { ProductPhotoSyncService } from '../../../product-photo-sync.service';

// No Vendure bootstrap: asset/product services are replicas that record their calls, run against
// real Postgres so the per-product advisory lock and the ProductPhoto queries are real.
const { schema, extra } = testSchemaOptions('product_photo_sync');
let dataSource: DataSource;

interface TestCtx {
    manager: EntityManager;
}

// VendureEntity's id column is only wired up by Vendure's own bootstrap, so the table is mapped here.
const photoSchema = new EntitySchema({
    name: 'ProductPhoto',
    tableName: 'product_photo',
    columns: {
        id: { type: Number, primary: true, generated: true },
        externalId: { type: String },
        productExternalId: { type: String },
        contentHash: { type: String, nullable: true },
        mimeType: { type: String, nullable: true },
        position: { type: Number, default: 0 },
        downloadUrl: { type: 'text', nullable: true },
        downloadUrlExpiresAt: { type: 'timestamp', nullable: true },
        isDeleted: { type: Boolean, default: false },
        status: { type: String, default: 'pending' },
        assetId: { type: String, nullable: true },
        syncQueuedAt: { type: 'timestamp', nullable: true },
        replayAttempts: { type: Number, default: 0 },
        lastReplayAt: { type: 'timestamp', nullable: true },
        lastError: { type: 'text', nullable: true },
    },
});

const created: string[] = [];
const productUpdates: { assetIds: string[] }[] = [];

const assetService = {
    createFromFileStream: async () => {
        const id = String(created.length + 1);
        created.push(id);
        return { id };
    },
};
const productService = {
    update: async (_ctx: TestCtx, input: { assetIds: string[] }) => {
        productUpdates.push({ assetIds: input.assetIds });
    },
};

const connection = {
    withTransaction: (_ctx: unknown, work: (ctx: TestCtx) => Promise<unknown>) =>
        dataSource.transaction(manager => work({ manager })),
    getRepository: (ctx: TestCtx) => ctx.manager.getRepository(photoSchema),
    get rawConnection() {
        return dataSource;
    },
};

function newService(): ProductPhotoSyncService {
    return new ProductPhotoSyncService(
        {} as never,
        {} as never,
        connection as never,
        assetService as never,
        productService as never,
    );
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [photoSchema],
        synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(
        'create table product (id serial primary key, "customFieldsExternalid" varchar)',
    );
    await dataSource.query(`insert into product ("customFieldsExternalid") values ('p-1')`);
    await dataSource.getRepository(photoSchema).insert({
        externalId: 'f-1',
        productExternalId: 'p-1',
        contentHash: 'h1',
        mimeType: 'image/jpeg',
        position: 0,
        downloadUrl: 'https://files.example/f-1',
        downloadUrlExpiresAt: new Date(Date.now() + 3600_000),
        status: 'pending',
    });
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('ProductPhotoSyncService against real Postgres', () => {
    it('creates one asset when two jobs race on the same product', async () => {
        await Promise.all([
            newService().syncProduct({} as never, 'p-1'),
            newService().syncProduct({} as never, 'p-1'),
        ]);

        expect(created).toHaveLength(1);
        const [row] = await dataSource.query('select status, "assetId" from product_photo');
        expect(row).toEqual({ status: 'downloaded', assetId: '1' });
        expect(productUpdates.every(u => u.assetIds.join() === '1')).toBe(true);
    });

    it('is a no-op download-wise when the photo is already downloaded', async () => {
        await newService().syncProduct({} as never, 'p-1');
        expect(created).toHaveLength(1);
    });
});
