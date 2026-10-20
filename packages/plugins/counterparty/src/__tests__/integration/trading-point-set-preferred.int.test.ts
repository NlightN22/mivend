import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
    createTestConnection,
} from 'shared';
import { TradingPointService } from '../../trading-point.service';

@Entity('customer')
class TestCustomer {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar', nullable: true }) customFieldsCounterpartyid!: string | null;
}

@Entity('trading_point')
class TestTradingPoint {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'varchar', default: 'active' }) customerStatus!: string;
}

const { schema, extra } = testSchemaOptions('trading_point_set_preferred');
const ctx = {} as RequestContext;
const update = vi.fn();
let dataSource: DataSource;
let service: TradingPointService;
let customerId: number;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCustomer, TestTradingPoint],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new TradingPointService(
        createTestConnection(dataSource),
        { update } as never,
        {} as never,
        {} as never,
        {} as never,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    update.mockReset();
    await dataSource.getRepository(TestTradingPoint).clear();
    await dataSource.getRepository(TestCustomer).clear();
    customerId = (
        await dataSource.getRepository(TestCustomer).save({ customFieldsCounterpartyid: '1' })
    ).id;
});

async function point(patch: Partial<TestTradingPoint> = {}): Promise<number> {
    const tp = await dataSource
        .getRepository(TestTradingPoint)
        .save({ counterpartyId: '1', ...patch });
    return tp.id;
}

describe('TradingPointService.setPreferred (real Postgres)', () => {
    it("accepts an active, visible point of the customer's counterparty", async () => {
        await service.setPreferred(ctx, customerId, await point());
        expect(update).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['another counterparty', { counterpartyId: '2' }],
        ['inactive', { isActive: false }],
        ['hidden by the customer', { customerStatus: 'hidden' }],
    ])('rejects a point of %s', async (_label, patch) => {
        await expect(service.setPreferred(ctx, customerId, await point(patch))).rejects.toThrow(
            'TradingPoint not found or access denied',
        );
        expect(update).not.toHaveBeenCalled();
    });

    it('rejects any point for a customer without a counterparty', async () => {
        const orphan = await dataSource
            .getRepository(TestCustomer)
            .save({ customFieldsCounterpartyid: null });
        await expect(service.setPreferred(ctx, orphan.id, await point())).rejects.toThrow();
    });
});
