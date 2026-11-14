import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    Column,
    DataSource,
    Entity,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { CounterpartyBatchLoaders } from '../../counterparty-batch-loaders.service';
import { TradingPoint } from '../../entities/trading-point.entity';
import { TradingPointService } from '../../trading-point.service';

@Entity('customer')
class TestCustomer {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'int', nullable: true }) userId!: number | null;
    @Column({ type: 'varchar', nullable: true }) customFieldsCounterpartyid!: string | null;
    @Column({ type: 'varchar', nullable: true }) customFieldsPreferredtradingpointid!:
        | string
        | null;
}

@Entity('trading_point')
class PointRow {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'varchar' }) name!: string;
    @Column({ type: 'varchar' }) address!: string;
    @Column({ type: 'float', nullable: true }) latitude!: number | null;
    @Column({ type: 'float', nullable: true }) longitude!: number | null;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'varchar', default: 'active' }) customerStatus!: string;
    @OneToMany(() => ContactRow, c => c.tradingPoint, { eager: true })
    contacts!: ContactRow[];
}

@Entity('contact_person')
class ContactRow {
    @PrimaryGeneratedColumn('increment') id!: number;
    @ManyToOne(() => PointRow, tp => tp.contacts, { onDelete: 'CASCADE' })
    @JoinColumn()
    tradingPoint!: PointRow;
    @Column({ type: 'varchar' }) name!: string;
}

const { schema, extra } = testSchemaOptions('trading_point_shop_filters');
const shop = { apiType: 'shop', activeUserId: 7 } as unknown as RequestContext;
const admin = { apiType: 'admin' } as unknown as RequestContext;
const update = vi.fn();
let dataSource: DataSource;
let service: TradingPointService;
let loaders: CounterpartyBatchLoaders;
let ids: { ok: number; noAddress: number; inactive: number; hidden: number; noCoords: number };
let customerId: number;

// The real TradingPoint class needs Vendure bootstrap; the service reads this table-shaped stand-in instead.
function connection(): TransactionalConnection {
    const base = createTestConnection(dataSource);
    return {
        getRepository: (ctx: unknown, entity: unknown) =>
            entity === TradingPoint
                ? dataSource.getRepository(PointRow)
                : (base.getRepository as (c: unknown, e: unknown) => unknown)(ctx, entity),
    } as unknown as TransactionalConnection;
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCustomer, PointRow, ContactRow],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new TradingPointService(
        connection(),
        { update } as never,
        {} as never,
        {} as never,
        {} as never,
    );
    loaders = new CounterpartyBatchLoaders(connection(), {} as never, {} as never);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

async function seedPoint(name: string, patch: Partial<PointRow> = {}): Promise<number> {
    const row = await dataSource.getRepository(PointRow).save({
        counterpartyId: '1',
        name,
        address: `${name} street`,
        latitude: 10,
        longitude: 20,
        ...patch,
    });
    return row.id;
}

beforeEach(async () => {
    update.mockReset();
    await dataSource.query(
        'TRUNCATE "contact_person", "trading_point", "customer" RESTART IDENTITY CASCADE',
    );
    ids = {
        ok: await seedPoint('b-ok'),
        noAddress: await seedPoint('a-no-address', { address: '' }),
        inactive: await seedPoint('c-inactive', { isActive: false }),
        hidden: await seedPoint('d-hidden', { customerStatus: 'hidden' }),
        noCoords: await seedPoint('e-no-coords', { latitude: null, longitude: null }),
    };
    customerId = (
        await dataSource
            .getRepository(TestCustomer)
            .save({ userId: 7, customFieldsCounterpartyid: '1' })
    ).id;
});

const idsOf = (rows: Array<{ id: number | string }>): number[] =>
    rows.map(r => Number(r.id)).sort((a, b) => a - b);

describe('shop-side trading point filters (real Postgres)', () => {
    it('findByCounterparty: shop sees active points with an address, admin sees all', async () => {
        const forShop = await service.findByCounterparty(shop, '1');
        const forAdmin = await service.findByCounterparty(admin, '1');
        expect(idsOf(forShop)).toEqual(
            idsOf([{ id: ids.ok }, { id: ids.hidden }, { id: ids.noCoords }]),
        );
        expect(idsOf(forAdmin)).toHaveLength(5);
    });

    it('findVisibleForCounterparty: only the active, addressed, non-hidden points', async () => {
        const rows = await service.findVisibleForCounterparty(shop, '1');
        expect(idsOf(rows)).toEqual(idsOf([{ id: ids.ok }, { id: ids.noCoords }]));
    });

    it('findHiddenForCounterparty: a hidden point with an address only', async () => {
        await seedPoint('f-hidden-no-address', { address: '', customerStatus: 'hidden' });
        expect(idsOf(await service.findHiddenForCounterparty(shop, '1'))).toEqual([ids.hidden]);
    });

    it('findOwnById: returns the ok point and a point lacking only coordinates, nothing else', async () => {
        expect(await service.findOwnById(shop, ids.ok)).not.toBeNull();
        expect(await service.findOwnById(shop, ids.noCoords)).not.toBeNull();
        expect(await service.findOwnById(shop, ids.noAddress)).toBeNull();
        expect(await service.findOwnById(shop, ids.inactive)).toBeNull();
    });

    it('batch loader behind Counterparty.tradingPoints: shop vs admin', async () => {
        const forShop = await loaders.tradingPoints({ ...shop } as RequestContext, 1);
        const forAdmin = await loaders.tradingPoints({ ...admin } as RequestContext, 1);
        expect(idsOf(forShop)).toEqual(
            idsOf([{ id: ids.ok }, { id: ids.hidden }, { id: ids.noCoords }]),
        );
        expect(idsOf(forAdmin)).toHaveLength(5);
    });

    it('getPreferredForCustomer skips a stored address-less preferred point for the first addressed one', async () => {
        await dataSource
            .getRepository(TestCustomer)
            .update(
                { id: customerId },
                { customFieldsPreferredtradingpointid: String(ids.noAddress) },
            );
        const picked = await service.getPreferredForCustomer(shop, customerId);
        expect(picked && Number(picked.id)).toBe(ids.ok);
    });

    it('setPreferred rejects an address-less point and accepts the ok one', async () => {
        await expect(service.setPreferred(shop, customerId, ids.noAddress)).rejects.toThrow(
            'TradingPoint not found or access denied',
        );
        expect(update).not.toHaveBeenCalled();
        await service.setPreferred(shop, customerId, ids.ok);
        expect(update).toHaveBeenCalledTimes(1);
    });
});
