import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    Column,
    DataSource,
    DeleteDateColumn,
    Entity,
    JoinTable,
    ManyToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { RequestContext, StockLevel, StockLocation, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { andProductInStock } from '../../in-stock-filter';
import { Reservation } from '../../entities/reservation.entity';
import { ReservationAvailabilityService } from '../../reservation-availability.service';

// Schema-faithful replicas of the Vendure tables the raw SQL touches (the real entities need a
// bootstrapped EntityIdStrategy). Drift guard: the SQL filter and getAvailableToPromiseBatch
// run over the same fixtures and must agree.
@Entity('channel')
class TChannel {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) code!: string;
}

@Entity('product')
class TProduct {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'boolean', default: true }) enabled!: boolean;
    @DeleteDateColumn({ type: 'timestamp' }) deletedAt!: Date | null;
    @ManyToMany(() => TChannel)
    @JoinTable({
        name: 'product_channels_channel',
        joinColumn: { name: 'productId' },
        inverseJoinColumn: { name: 'channelId' },
    })
    channels!: TChannel[];
}

@Entity('product_variant')
class TVariant {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) productId!: number;
    @Column({ type: 'boolean', default: true }) enabled!: boolean;
    @Column({ type: 'timestamp', nullable: true }) deletedAt!: Date | null;
}

class TLocationCustomFields {
    @Column({ name: 'customFieldsWarehouseerpid', type: 'varchar', nullable: true })
    warehouseErpId!: string | null;
}

@Entity('stock_location')
class TLocation {
    @PrimaryGeneratedColumn() id!: number;
    @Column(() => TLocationCustomFields, { prefix: false }) customFields!: TLocationCustomFields;
}

class TLevelCustomFields {
    @Column({ name: 'customFieldsErpavailablequantity', type: 'int', nullable: true })
    erpAvailableQuantity!: number | null;
}

@Entity('stock_level')
class TLevel {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) productVariantId!: number;
    @Column({ type: 'int' }) stockLocationId!: number;
    @Column({ type: 'int' }) stockOnHand!: number;
    @Column({ type: 'int', default: 0 }) stockAllocated!: number;
    @Column(() => TLevelCustomFields, { prefix: false }) customFields!: TLevelCustomFields;
}

@Entity('reservation')
class TReservation {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) productVariantId!: string;
    @Column({ type: 'varchar' }) stockLocationId!: string;
    @Column({ type: 'int' }) quantity!: number;
    @Column({ type: 'varchar' }) status!: string;
}

const { schema, extra } = testSchemaOptions('in_stock_filter');
const viewerWarehouses = ['wh-viewer'];
let dataSource: DataSource;
let service: ReservationAvailabilityService;
let channelId: number;
let viewerLocationId: number;
let otherLocationId: number;
const variantByCase = new Map<string, number>();
const productByCase = new Map<string, number>();

interface Fixture {
    name: string;
    onHand?: number;
    erpCap?: number | null;
    otherWarehouse?: boolean;
    reservations?: Array<[number, string]>;
    variantEnabled?: boolean;
    variantDeleted?: boolean;
    productDeleted?: boolean;
    inChannel?: boolean;
}

async function seed(f: Fixture): Promise<void> {
    const channel = await dataSource.getRepository(TChannel).findOneByOrFail({ id: channelId });
    const product = await dataSource.getRepository(TProduct).save({
        channels: f.inChannel === false ? [] : [channel],
        deletedAt: f.productDeleted ? new Date() : null,
    });
    const variant = await dataSource.getRepository(TVariant).save({
        productId: product.id,
        enabled: f.variantEnabled ?? true,
        deletedAt: f.variantDeleted ? new Date() : null,
    });
    const locationId = f.otherWarehouse ? otherLocationId : viewerLocationId;
    await dataSource.getRepository(TLevel).save({
        productVariantId: variant.id,
        stockLocationId: locationId,
        stockOnHand: f.onHand ?? 10,
        customFields: { erpAvailableQuantity: f.erpCap ?? null },
    });
    for (const [quantity, status] of f.reservations ?? []) {
        await dataSource.getRepository(TReservation).save({
            productVariantId: String(variant.id),
            stockLocationId: String(locationId),
            quantity,
            status,
        });
    }
    variantByCase.set(f.name, variant.id);
    productByCase.set(f.name, product.id);
}

async function inStockProductIds(): Promise<number[]> {
    const query = dataSource
        .getRepository(TProduct)
        .createQueryBuilder('product')
        .select('product.id', 'id')
        .innerJoin('product.channels', 'channel', 'channel.id = :channelId', { channelId })
        .where('product.deletedAt IS NULL');
    const rows = await andProductInStock(query, viewerWarehouses).getRawMany<{ id: number }>();
    return rows.map(r => r.id);
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TChannel, TProduct, TVariant, TLocation, TLevel, TReservation],
        synchronize: true,
    });
    await dataSource.initialize();

    channelId = (await dataSource.getRepository(TChannel).save({ code: 'default' })).id;
    const locations = dataSource.getRepository(TLocation);
    viewerLocationId = (await locations.save({ customFields: { warehouseErpId: 'wh-viewer' } })).id;
    otherLocationId = (await locations.save({ customFields: { warehouseErpId: 'wh-other' } })).id;

    await seed({ name: 'onHand' });
    await seed({ name: 'fullyReserved', onHand: 5, reservations: [[5, 'active']] });
    await seed({
        name: 'partlyReserved',
        onHand: 5,
        reservations: [
            [3, 'active'],
            [4, 'released'],
            [4, 'expired'],
        ],
    });
    await seed({ name: 'erpCapZero', erpCap: 0 });
    await seed({ name: 'erpCapThree', erpCap: 3 });
    await seed({ name: 'otherWarehouse', otherWarehouse: true });
    await seed({ name: 'disabledVariant', variantEnabled: false });
    await seed({ name: 'deletedVariant', variantDeleted: true });
    await seed({ name: 'deletedProduct', productDeleted: true });
    await seed({ name: 'notInChannel', inChannel: false });

    const repos = new Map<unknown, unknown>([
        [StockLevel, dataSource.getRepository(TLevel)],
        [StockLocation, dataSource.getRepository(TLocation)],
        [Reservation, dataSource.getRepository(TReservation)],
    ]);
    service = new ReservationAvailabilityService(
        {
            getRepository: (_ctx: unknown, entity: unknown) => repos.get(entity),
        } as unknown as TransactionalConnection,
        {
            findAll: async () => [
                { branchId: 'branch-a', includedInBranchAtp: true, erpId: 'wh-viewer' },
                { branchId: 'branch-b', includedInBranchAtp: true, erpId: 'wh-other' },
            ],
        } as never,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('in-stock SQL filter vs getAvailableToPromiseBatch (real Postgres)', () => {
    it('includes and excludes the expected products', async () => {
        const included = new Set(await inStockProductIds());
        const expected = ['onHand', 'partlyReserved', 'erpCapThree'];
        const excluded = [
            'fullyReserved',
            'erpCapZero',
            'otherWarehouse',
            'disabledVariant',
            'deletedVariant',
            'deletedProduct',
            'notInChannel',
        ];
        expect(expected.filter(n => !included.has(productByCase.get(n)!))).toEqual([]);
        expect(excluded.filter(n => included.has(productByCase.get(n)!))).toEqual([]);
    });

    it('agrees with ATP > 0 on every stock-formula fixture, including the ATP values', async () => {
        const included = new Set(await inStockProductIds());
        const formulaCases = [
            'onHand',
            'fullyReserved',
            'partlyReserved',
            'erpCapZero',
            'erpCapThree',
            'otherWarehouse',
        ];
        const atp = await service.getAvailableToPromiseBatch(
            {} as RequestContext,
            formulaCases.map(n => variantByCase.get(n)!),
            'branch-a',
        );
        for (const name of formulaCases) {
            const available = atp.get(String(variantByCase.get(name)));
            expect(included.has(productByCase.get(name)!), name).toBe((available ?? 0) > 0);
        }
        expect(atp.get(String(variantByCase.get('partlyReserved')))).toBe(2);
        expect(atp.get(String(variantByCase.get('erpCapThree')))).toBe(3);
        expect(atp.get(String(variantByCase.get('fullyReserved')))).toBe(0);
    });
});
