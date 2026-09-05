import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

// Audit finding, mivend.audit.70: ProductLookupService.findByExternalId's query
// (product-lookup.service.ts) was entirely unverified against a real repository/DB — every unit
// test mocks ProductLookupService or fetch. This test does not bootstrap the real Vendure
// Product entity (this plugin has no @vendure/testing component-test infra, and faithfully
// replicating Vendure's whole Product/ProductVariant/Translation/Asset relation graph would be
// its own large undertaking) — instead it validates, against real Postgres, the two specific
// TypeORM mechanisms the real query depends on:
//   1. `alias.customFields.propName` in a QueryBuilder `.where()` resolves an embedded custom
//      field to its real physical column (Vendure's own documented pattern, see
//      @vendure/core's ActiveOrderStrategy JSDoc) — as opposed to the literal raw column name
//      convention used by erp-integration's separate `rawConnection.createQueryBuilder()` API.
//   2. `.innerJoin('product.channels', 'channel', 'channel.id = :channelId', ...)` on a
//      many-to-many relation correctly scopes results to one channel.
// via a minimal, schema-faithful replica (embedded customFields column name confirmed against
// the actual local dev Postgres: `customFieldsExternalid`, see mivend.audit.70's follow-up).

class TestProductCustomFields {
    @Column({ name: 'customFieldsExternalid', type: 'varchar', nullable: true })
    externalId!: string | null;
}

@Entity('lookup_test_channel')
class TestChannel {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' })
    code!: string;
}

@Entity('lookup_test_product')
class TestProduct {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column(() => TestProductCustomFields)
    customFields!: TestProductCustomFields;

    @ManyToMany(() => TestChannel)
    @JoinTable({
        name: 'lookup_test_product_channels_channel',
        joinColumn: { name: 'productId' },
        inverseJoinColumn: { name: 'channelId' },
    })
    channels!: TestChannel[];
}

let dataSource: DataSource;
const { schema, extra } = testSchemaOptions('product_lookup_query');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestProduct, TestChannel],
        synchronize: true,
    });
    await dataSource.initialize();

    const channelRepo = dataSource.getRepository(TestChannel);
    const productRepo = dataSource.getRepository(TestProduct);

    const channelA = await channelRepo.save(channelRepo.create({ code: 'channel-a' }));
    const channelB = await channelRepo.save(channelRepo.create({ code: 'channel-b' }));

    await productRepo.save(
        productRepo.create({
            customFields: { externalId: 'ext-001' },
            channels: [channelA],
        }),
    );
    await productRepo.save(
        productRepo.create({
            customFields: { externalId: 'ext-002' },
            channels: [channelB],
        }),
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

function queryByExternalIdAndChannel(
    externalId: string,
    channelId: number,
): Promise<TestProduct | null> {
    return dataSource
        .getRepository(TestProduct)
        .createQueryBuilder('product')
        .innerJoin('product.channels', 'channel', 'channel.id = :channelId', { channelId })
        .where('product.customFields.externalId = :externalId', { externalId })
        .getOne();
}

describe('ProductLookupService query — real Postgres (mivend.audit.70)', () => {
    it('resolves an embedded customFields dot-path to the real physical column', async () => {
        const found = await dataSource
            .getRepository(TestProduct)
            .createQueryBuilder('product')
            .where('product.customFields.externalId = :externalId', { externalId: 'ext-001' })
            .getOne();

        expect(found).not.toBeNull();
        expect(found?.customFields.externalId).toBe('ext-001');
    });

    it('returns null for a non-matching externalId, not an error', async () => {
        const found = await dataSource
            .getRepository(TestProduct)
            .createQueryBuilder('product')
            .where('product.customFields.externalId = :externalId', { externalId: 'no-such-id' })
            .getOne();

        expect(found).toBeNull();
    });

    it('scopes by channel — a product not assigned to the given channel is not returned', async () => {
        const channelA = await dataSource
            .getRepository(TestChannel)
            .findOneByOrFail({ code: 'channel-a' });

        const foundOwnChannel = await queryByExternalIdAndChannel('ext-001', channelA.id);
        expect(foundOwnChannel).not.toBeNull();

        // ext-002 belongs to channel-b, not channel-a — must not leak across channels.
        const foundWrongChannel = await queryByExternalIdAndChannel('ext-002', channelA.id);
        expect(foundWrongChannel).toBeNull();
    });
});
