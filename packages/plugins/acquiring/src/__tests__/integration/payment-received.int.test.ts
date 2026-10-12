import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, EntityManager, PrimaryGeneratedColumn } from 'typeorm';
import { EntityNotFoundError, UserInputError } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { PaymentReceivedService } from '../../payment-received.service';

@Entity('payment_received_test_payment')
class TestPayment {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) orderId!: number;
    @Column({ type: 'varchar' }) method!: string;
    @Column({ type: 'varchar' }) state!: string;
}

const { schema, extra } = testSchemaOptions('payment_received');
let dataSource: DataSource;
let visible = true;
const settlePayment = vi.fn();

const managerOf = (ctx: RequestContext): EntityManager | undefined =>
    (ctx as unknown as { __manager?: EntityManager }).__manager;

function service(): PaymentReceivedService {
    const connection = {
        getRepository: (ctx: RequestContext) =>
            (managerOf(ctx) ?? dataSource.manager).getRepository(TestPayment),
        withTransaction: (ctx: RequestContext, work: (c: RequestContext) => Promise<unknown>) =>
            managerOf(ctx)
                ? work(ctx)
                : dataSource.transaction(manager =>
                      work({ ...ctx, __manager: manager } as unknown as RequestContext),
                  ),
    };
    const orderService = {
        settlePayment: async (ctx: RequestContext, id: number) => {
            settlePayment(id);
            await (managerOf(ctx) ?? dataSource.manager)
                .getRepository(TestPayment)
                .update(id, { state: 'Settled' });
            return { id, state: 'Settled' };
        },
        findOne: async (_ctx: unknown, id: number) => ({ id }),
    };
    const qb = {
        alias: 'o',
        andWhere: () => qb,
        getOne: async () => (visible ? { id: 1 } : null),
    };
    return new PaymentReceivedService(
        connection as never,
        orderService as never,
        { buildVisibleOrdersQuery: async () => qb } as never,
    );
}

const repo = () => dataSource.getRepository(TestPayment);
const stateOf = async (id: number): Promise<string> => (await repo().findOneByOrFail({ id })).state;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestPayment],
        synchronize: true,
    });
    await dataSource.initialize();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    visible = true;
    settlePayment.mockClear();
    await repo().clear();
});

const ctx = {} as RequestContext;

describe('PaymentReceivedService.confirm', () => {
    it.each(['cash', 'offline-terms'])('settles an Authorized %s payment', async method => {
        const payment = await repo().save({ orderId: 1, method, state: 'Authorized' });
        await service().confirm(ctx, 1);
        expect(await stateOf(payment.id)).toBe('Settled');
    });

    it('is a no-op the second time and under two concurrent confirmations', async () => {
        const payment = await repo().save({ orderId: 1, method: 'cash', state: 'Authorized' });
        await Promise.all([service().confirm(ctx, 1), service().confirm(ctx, 1)]);
        await service().confirm(ctx, 1);
        expect(settlePayment).toHaveBeenCalledTimes(1);
        expect(await stateOf(payment.id)).toBe('Settled');
    });

    it('never touches a card payment or another order', async () => {
        const card = await repo().save({ orderId: 1, method: 'online-stub', state: 'Authorized' });
        await repo().save({ orderId: 1, method: 'cash', state: 'Authorized' });
        const other = await repo().save({ orderId: 2, method: 'cash', state: 'Authorized' });
        await service().confirm(ctx, 1);
        expect(await stateOf(card.id)).toBe('Authorized');
        expect(await stateOf(other.id)).toBe('Authorized');
    });

    it('refuses an order with no cash or bank-transfer payment', async () => {
        await repo().save({ orderId: 1, method: 'online-stub', state: 'Settled' });
        await expect(service().confirm(ctx, 1)).rejects.toBeInstanceOf(UserInputError);
    });

    it('does not reveal an order outside the caller scope', async () => {
        visible = false;
        await repo().save({ orderId: 1, method: 'cash', state: 'Authorized' });
        await expect(service().confirm(ctx, 1)).rejects.toBeInstanceOf(EntityNotFoundError);
        expect(settlePayment).not.toHaveBeenCalled();
    });
});
