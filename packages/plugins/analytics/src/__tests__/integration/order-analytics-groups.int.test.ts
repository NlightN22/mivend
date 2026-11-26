import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { CollectionService, RequestContext, TransactionalConnection } from '@vendure/core';
import { Collection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { OrderAnalyticsGroupsService } from '../../order-analytics/order-analytics-groups.service';

@Entity('manufacturer')
class TestManufacturer {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) externalId!: string;
    @Column({ type: 'varchar', nullable: true }) name!: string | null;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'varchar', nullable: true }) parentExternalId!: string | null;
}

@Entity('counterparty_group_erp')
class TestCounterpartyGroup {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar', nullable: true }) name!: string | null;
    @Column({ type: 'varchar', nullable: true }) parentId!: string | null;
    @Column({ type: 'boolean', default: false }) isDeleted!: boolean;
}

@Entity('collection')
class TestCollection {
    @PrimaryGeneratedColumn() id!: number;
    @OneToMany(() => TestCollectionTranslation, t => t.base)
    translations!: TestCollectionTranslation[];
}

@Entity('collection_translation')
class TestCollectionTranslation {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) name!: string;
    @Column({ type: 'varchar' }) slug!: string;
    @ManyToOne(() => TestCollection, c => c.translations) base!: TestCollection;
}

const ctx = {} as RequestContext;
const { schema, extra } = testSchemaOptions('analytics_groups');
let dataSource: DataSource;
let service: OrderAnalyticsGroupsService;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [
            TestManufacturer,
            TestCounterpartyGroup,
            TestCollection,
            TestCollectionTranslation,
        ],
        synchronize: true,
    });
    await dataSource.initialize();
    const byEntity = new Map<unknown, unknown>([
        ['Manufacturer', TestManufacturer],
        ['CounterpartyGroupErp', TestCounterpartyGroup],
        [Collection, TestCollection],
    ]);
    const connection = {
        getRepository: (_ctx: unknown, entity: unknown) =>
            dataSource.getRepository(byEntity.get(entity) as never),
    } as unknown as TransactionalConnection;
    const collections = {
        getBreadcrumbs: async (_c: unknown, c: { id: number }) => {
            const rows = await dataSource
                .getRepository(TestCollectionTranslation)
                .find({ where: { base: { id: c.id } } });
            return [{ name: '__root_collection__' }, { name: rows[0]!.name }];
        },
    } as unknown as CollectionService;
    service = new OrderAnalyticsGroupsService(connection, collections);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    for (const entity of [
        TestCollectionTranslation,
        TestCollection,
        TestManufacturer,
        TestCounterpartyGroup,
    ]) {
        await dataSource.getRepository(entity).createQueryBuilder().delete().execute();
    }
});

describe('OrderAnalyticsGroupsService (real Postgres)', () => {
    it('suggests manufacturers with their parent path and never a deactivated one', async () => {
        const repo = dataSource.getRepository(TestManufacturer);
        await repo.save([
            { externalId: 'm-root', name: 'Root Group', parentExternalId: null },
            { externalId: 'm-mid', name: 'Middle Group', parentExternalId: 'm-root' },
            { externalId: 'm-leaf', name: 'Leaf Brand', parentExternalId: 'm-mid' },
            { externalId: 'm-off', name: 'Leaf Gone', isActive: false },
        ]);

        const found = await service.suggest(ctx, 'MANUFACTURER_GROUP', 'leaf');

        expect(found.map(f => f.name)).toEqual(['Root Group / Middle Group / Leaf Brand']);
        expect(found[0]!.id).toMatch(/^\d+$/);
        expect(JSON.stringify(found)).not.toContain('m-leaf');
    });

    it('translates our ids to ERP ids, skipping unknown, malformed and deactivated ones', async () => {
        const saved = await dataSource.getRepository(TestManufacturer).save([
            { externalId: 'm-1', name: 'A' },
            { externalId: 'm-2', name: 'B', isActive: false },
        ]);
        const ids = [String(saved[0]!.id), String(saved[1]!.id), '999999', 'abc', "1' OR '1'='1"];

        expect(await service.erpIds(ctx, 'MANUFACTURER_GROUP', ids)).toEqual(['m-1']);
        expect(await service.erpIds(ctx, 'MANUFACTURER_GROUP', ['abc'])).toEqual([]);
    });

    it('suggests customer groups with their path and hides deleted ones', async () => {
        const repo = dataSource.getRepository(TestCounterpartyGroup);
        await repo.save([
            { erpId: 'g-1', name: 'Wholesale', parentId: null },
            { erpId: 'g-2', name: 'Wholesale North', parentId: 'g-1' },
            { erpId: 'g-3', name: 'Wholesale Old', parentId: 'g-1', isDeleted: true },
        ]);

        const found = await service.suggest(ctx, 'CUSTOMER_GROUP', 'wholesale');

        expect(found.map(f => f.name)).toEqual(['Wholesale', 'Wholesale / Wholesale North']);
        const [first] = await dataSource
            .getRepository(TestCounterpartyGroup)
            .find({ where: { erpId: 'g-2' } });
        expect(await service.erpIds(ctx, 'CUSTOMER_GROUP', [String(first!.id)])).toEqual(['g-2']);
    });

    it('lists only category collections and maps them back to the category ERP id', async () => {
        const collections = dataSource.getRepository(TestCollection);
        const translations = dataSource.getRepository(TestCollectionTranslation);
        const category = await collections.save({});
        const other = await collections.save({});
        await translations.save([
            { name: 'Pumps', slug: 'cat-erp-pumps', base: category },
            { name: 'Pumps page', slug: 'landing-pumps', base: other },
        ]);

        const found = await service.suggest(ctx, 'PRODUCT_CATEGORY', 'pumps');

        expect(found).toEqual([{ id: String(category.id), name: 'Pumps' }]);
        expect(
            await service.erpIds(ctx, 'PRODUCT_CATEGORY', [String(category.id), String(other.id)]),
        ).toEqual(['erp-pumps']);
    });

    it('treats LIKE wildcards in the typed text as plain characters', async () => {
        await dataSource
            .getRepository(TestManufacturer)
            .save([{ externalId: 'm-1', name: 'Alpha' }]);
        expect(await service.suggest(ctx, 'MANUFACTURER_GROUP', '%%')).toEqual([]);
        expect(await service.suggest(ctx, 'MANUFACTURER_GROUP', 'a')).toEqual([]);
    });
});
