import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    Column,
    DataSource,
    DeleteDateColumn,
    Entity,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { Product } from '@vendure/core';
import { Contract, Counterparty, TradingPoint } from '@mivend/plugin-counterparty';
import type { CounterpartyService } from '@mivend/plugin-counterparty';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { OrderAnalyticsEntityNamesService } from '../../order-analytics/order-analytics-entity-names.service';
import type { OrderAnalyticsScopeService } from '../../order-analytics/order-analytics-scope.service';

// Mirror tables stand in for the entities that need Vendure's bootstrap, as in the scope test.
@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', nullable: true }) erpId!: string | null;
    @Column({ type: 'varchar' }) legalName!: string;
    @Column({ type: 'varchar' }) shortName!: string;
}

@Entity('trading_point')
class TestTradingPoint {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) name!: string;
    @Column({ type: 'varchar' }) counterpartyId!: string;
}

@Entity('contract')
class TestContract {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar', nullable: true }) name!: string | null;
    @Column({ type: 'varchar' }) counterpartyId!: string;
}

@Entity('erp_user')
class TestErpUser {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar', nullable: true }) fullName!: string | null;
}

@Entity('organization_requisites')
class TestOrganization {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) legalName!: string;
}

@Entity('manufacturer')
class TestManufacturer {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) externalId!: string;
    @Column({ type: 'varchar', nullable: true }) name!: string | null;
}

class TestProductCustomFields {
    @Column({ name: 'customFieldsExternalid', type: 'varchar', nullable: true })
    externalId!: string | null;
}

@Entity('product')
class TestProduct {
    @PrimaryGeneratedColumn() id!: number;
    @DeleteDateColumn({ type: 'timestamp', nullable: true }) deletedAt!: Date | null;
    @Column(() => TestProductCustomFields) customFields!: TestProductCustomFields;
    @OneToMany(() => TestProductTranslation, t => t.base) translations!: TestProductTranslation[];
}

@Entity('product_translation')
class TestProductTranslation {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) name!: string;
    @ManyToOne(() => TestProduct, p => p.translations) base!: TestProduct;
}

const ctx = {} as RequestContext;
const { schema, extra } = testSchemaOptions('analytics_entity_names');
const visibleManagerErpIds = vi.fn();
const visibleIdsSql = vi.fn();
const visibleCustomerIds = vi.fn<() => string[] | null>();
let dataSource: DataSource;
let service: OrderAnalyticsEntityNamesService;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [
            TestCounterparty,
            TestTradingPoint,
            TestContract,
            TestErpUser,
            TestOrganization,
            TestManufacturer,
            TestProduct,
            TestProductTranslation,
        ],
        synchronize: true,
    });
    await dataSource.initialize();
    const byEntity = new Map<unknown, unknown>([
        [Counterparty, TestCounterparty],
        [TradingPoint, TestTradingPoint],
        [Contract, TestContract],
        [Product, TestProduct],
        ['ErpUser', TestErpUser],
        ['OrganizationRequisites', TestOrganization],
        ['Manufacturer', TestManufacturer],
    ]);
    const connection = {
        getRepository: (_ctx: unknown, entity: unknown) =>
            dataSource.getRepository(byEntity.get(entity) as never),
    } as unknown as TransactionalConnection;
    const counterparties = {
        visibleFilteredQb: async () => {
            const qb = dataSource.getRepository(TestCounterparty).createQueryBuilder('c');
            const visible = visibleCustomerIds();
            return visible ? qb.where('c.erpId IN (:...visible)', { visible }) : qb;
        },
        visibleIdsSql,
    } as unknown as CounterpartyService;
    service = new OrderAnalyticsEntityNamesService(connection, counterparties, {
        visibleManagerErpIds,
    } as unknown as OrderAnalyticsScopeService);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    for (const entity of [
        TestProductTranslation,
        TestProduct,
        TestCounterparty,
        TestTradingPoint,
        TestContract,
        TestErpUser,
        TestOrganization,
        TestManufacturer,
    ]) {
        await dataSource.getRepository(entity).createQueryBuilder().delete().execute();
    }
    vi.resetAllMocks();
    visibleManagerErpIds.mockResolvedValue(null);
    visibleIdsSql.mockResolvedValue(null);
    visibleCustomerIds.mockReturnValue(null);
});

const names = (found: Array<{ name: string }>): string[] => found.map(f => f.name);

describe('OrderAnalyticsEntityNamesService (real Postgres)', () => {
    it('finds customers by short or legal name inside the visible scope only', async () => {
        await dataSource.getRepository(TestCounterparty).save([
            { erpId: 'c1', legalName: 'Alpha Trading LLC', shortName: 'Alpha' },
            { erpId: 'c2', legalName: 'Alpha Hidden LLC', shortName: 'Alpha Hidden' },
            { erpId: null, legalName: 'Alpha NoId', shortName: 'Alpha NoId' },
        ]);
        visibleCustomerIds.mockReturnValue(['c1']);

        expect(await service.find(ctx, 'CUSTOMER', 'alph', 10)).toEqual([
            { erpId: 'c1', name: 'Alpha' },
        ]);
        visibleCustomerIds.mockReturnValue(null);
        expect(names(await service.find(ctx, 'CUSTOMER', 'trading llc', 10))).toEqual(['Alpha']);
        expect(await service.find(ctx, 'CUSTOMER', 'noid', 10)).toEqual([]);
    });

    it('exact mode matches whole names without case and never leaves the visible scope', async () => {
        await dataSource.getRepository(TestCounterparty).save([
            { erpId: 'c1', legalName: 'Alpha LLC', shortName: 'Alpha' },
            { erpId: 'c2', legalName: 'Alpha Hidden LLC', shortName: 'Alpha Hidden' },
            { erpId: 'c3', legalName: 'Other LLC', shortName: 'alpha' },
        ]);
        visibleCustomerIds.mockReturnValue(['c1', 'c2']);

        expect(await service.find(ctx, 'CUSTOMER', 'ALPHA', 10, true)).toEqual([
            { erpId: 'c1', name: 'Alpha' },
        ]);
        expect(await service.find(ctx, 'CUSTOMER', 'alph', 10, true)).toEqual([]);
        expect(names(await service.find(ctx, 'CUSTOMER', 'alph', 10))).toEqual([
            'Alpha',
            'Alpha Hidden',
        ]);
    });

    it('treats percent and underscore in the typed text literally', async () => {
        await dataSource.getRepository(TestOrganization).save([
            { erpId: 'o1', legalName: 'Plain Org' },
            { erpId: 'o2', legalName: '50% Org' },
        ]);

        expect(await service.find(ctx, 'ORGANIZATION', '%', 10)).toEqual([
            { erpId: 'o2', name: '50% Org' },
        ]);
        expect(await service.find(ctx, 'ORGANIZATION', 'Plain_Org', 10)).toEqual([]);
    });

    it('limits managers to the visible ones and returns none for an empty scope', async () => {
        await dataSource.getRepository(TestErpUser).save([
            { erpId: 'm1', fullName: 'Ivan Visible' },
            { erpId: 'm2', fullName: 'Ivan Hidden' },
        ]);
        visibleManagerErpIds.mockResolvedValue(['m1']);
        expect(names(await service.find(ctx, 'MANAGER', 'ivan', 10))).toEqual(['Ivan Visible']);
        expect(names(await service.find(ctx, 'COUNTERPARTY_MANAGER', 'ivan', 10))).toEqual([
            'Ivan Visible',
        ]);

        visibleManagerErpIds.mockResolvedValue([]);
        expect(await service.find(ctx, 'MANAGER', 'ivan', 10)).toEqual([]);
    });

    it('limits points of sale to the visible counterparties', async () => {
        await dataSource.getRepository(TestTradingPoint).save([
            { erpId: 't1', name: 'North shop', counterpartyId: '1' },
            { erpId: 't2', name: 'North depot', counterpartyId: '2' },
        ]);
        visibleIdsSql.mockResolvedValue({ sql: "SELECT '1'", params: {} });

        expect(names(await service.find(ctx, 'POINT_OF_SALE', 'north', 10))).toEqual([
            'North shop',
        ]);
    });

    it('limits contracts to the visible counterparties and skips unnamed ones', async () => {
        await dataSource.getRepository(TestContract).save([
            { erpId: 'k1', name: 'Supply main', counterpartyId: '1' },
            { erpId: 'k2', name: 'Supply other', counterpartyId: '2' },
            { erpId: 'k3', name: null, counterpartyId: '1' },
        ]);
        visibleIdsSql.mockResolvedValue({ sql: "SELECT '1'", params: {} });
        expect(await service.find(ctx, 'CONTRACT', 'supply', 10)).toEqual([
            { erpId: 'k1', name: 'Supply main' },
        ]);

        visibleIdsSql.mockResolvedValue(null);
        expect(names(await service.find(ctx, 'CONTRACT', 'supply', 10))).toEqual([
            'Supply main',
            'Supply other',
        ]);
    });

    it('finds manufacturers by name and products by translated name, skipping deleted products', async () => {
        await dataSource.getRepository(TestManufacturer).save([
            { externalId: 'f1', name: 'Acme Parts' },
            { externalId: 'f2', name: null },
        ]);
        const products = dataSource.getRepository(TestProduct);
        const live = await products.save({ customFields: { externalId: 'p1' } });
        const gone = await products.save({ customFields: { externalId: 'p2' } });
        await products.softDelete(gone.id);
        await dataSource.getRepository(TestProductTranslation).save([
            { name: 'Steel bolt', base: live },
            { name: 'Steel nut', base: gone },
        ]);

        expect(await service.find(ctx, 'MANUFACTURER', 'acme', 10)).toEqual([
            { erpId: 'f1', name: 'Acme Parts' },
        ]);
        expect(await service.find(ctx, 'PRODUCT', 'steel', 10)).toEqual([
            { erpId: 'p1', name: 'Steel bolt' },
        ]);
    });
});
