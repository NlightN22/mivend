import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
    Column,
    DataSource,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { CustomerService, RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { CustomerPricingService } from '../../customer-pricing.service';

// VendureEntity's primary column needs a bootstrapped EntityIdStrategy; a bare DataSource has none.
@Entity('price_type')
class TestPriceType {
    @PrimaryGeneratedColumn() id!: number;
    @Index({ unique: true }) @Column({ type: 'varchar' }) code!: string;
    @Column({ type: 'varchar' }) name!: string;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Index({ unique: true }) @Column({ type: 'varchar', nullable: true }) externalId!:
        | string
        | null;
}

@Entity('customer_price_type')
class TestCustomerPriceType {
    @PrimaryGeneratedColumn() id!: number;
    @Index({ unique: true }) @Column({ type: 'varchar' }) customerId!: string;
    @ManyToOne(() => TestPriceType, { eager: true, nullable: false })
    @JoinColumn()
    priceType!: TestPriceType;
}

const byName: Record<string, unknown> = {
    PriceType: TestPriceType,
    CustomerPriceType: TestCustomerPriceType,
};

function mapEntity(base: TransactionalConnection): TransactionalConnection {
    return {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (ctx: never, entity: unknown) =>
            base.getRepository(
                ctx,
                (byName[(entity as { name?: string }).name ?? ''] ?? entity) as never,
            ),
    } as unknown as TransactionalConnection;
}

let dataSource: DataSource;
let service: CustomerPricingService;
const { schema, extra } = testSchemaOptions('customer_pricing_upsert_race');
const ctx: RequestContext = testRequestContext;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestPriceType, TestCustomerPriceType],
        synchronize: true,
    });
    await dataSource.initialize();
    const customers = {
        findOne: async () => ({ id: 'customer-123' }),
    } as unknown as CustomerService;
    service = new CustomerPricingService(
        mapEntity(createTestConnection(dataSource)),
        customers,
        {},
    );
});

afterEach(async () => {
    await dataSource.query('TRUNCATE TABLE customer_price_type, price_type CASCADE');
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('CustomerPricingService upserts (integration, real Postgres)', () => {
    it('concurrent first upserts of one external id leave a single price type and no unique violation', async () => {
        await Promise.all([
            service.upsertPriceTypeByExternalId(ctx, 'ext-1', 'Wholesale', true),
            service.upsertPriceTypeByExternalId(ctx, 'ext-1', 'Wholesale', true),
        ]);

        expect(await dataSource.getRepository(TestPriceType).count()).toBe(1);
    });

    it('concurrent first assignments for one customer leave a single row on the last-committed type', async () => {
        const a = await dataSource.getRepository(TestPriceType).save({ code: 'a', name: 'A' });
        const b = await dataSource.getRepository(TestPriceType).save({ code: 'b', name: 'B' });

        await Promise.all([
            service.setCustomerPriceType(ctx, 'customer-123', a.id),
            service.setCustomerPriceType(ctx, 'customer-123', b.id),
        ]);

        expect(await dataSource.getRepository(TestCustomerPriceType).count()).toBe(1);
    });
});
