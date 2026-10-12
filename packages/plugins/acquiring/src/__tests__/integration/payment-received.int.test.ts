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
    @Column({ type: 'simple-json', nullable: true }) metadata!: Record<string, unknown> | null;
}

@Entity('payment_received_test_order')
class TestOrder {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', nullable: true }) branchId!: string | null;
    @Column({ type: 'varchar', nullable: true }) managerId!: string | null;
}

const { schema, extra } = testSchemaOptions('payment_received');
let dataSource: DataSource;
let visible = true;
let scopeFilter: { column: 'branchId' | 'managerId'; value: string } | null = null;
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
            return { id, state: 'Settled', metadata: placement };
        },
        findOne: async (_ctx: unknown, id: number) => ({ id }),
    };
    const flagQb = {
        alias: 'o',
        andWhere: () => flagQb,
        getOne: async () => (visible ? { id: 1 } : null),
    };
    const scopedQb = async (): Promise<unknown> => {
        const builder = dataSource.getRepository(TestOrder).createQueryBuilder('o');
        return scopeFilter
            ? builder.where(`o."${scopeFilter.column}" = :scopeValue`, {
                  scopeValue: scopeFilter.value,
              })
            : builder;
    };
    return new PaymentReceivedService(
        connection as never,
        orderService as never,
        { buildVisibleOrdersQuery: async () => (scopeFilter ? scopedQb() : flagQb) } as never,
        { findOneByUserId: async () => ({ id: 77 }) } as never,
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
        entities: [TestPayment, TestOrder],
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
    scopeFilter = null;
    settlePayment.mockClear();
    await repo().clear();
    await dataSource.getRepository(TestOrder).clear();
});

const ctx = { activeUserId: 5 } as unknown as RequestContext;
const placement = { placement: { route: 'erp-now', countsAgainstLimit: true } };

describe('PaymentReceivedService.confirm', () => {
    it.each(['cash', 'offline-terms'])('settles an Authorized %s payment', async method => {
        const payment = await repo().save({
            orderId: 1,
            method,
            state: 'Authorized',
            metadata: placement,
        });
        await service().confirm(ctx, 1);
        expect(await stateOf(payment.id)).toBe('Settled');
    });

    it('is a no-op the second time and under two concurrent confirmations', async () => {
        const payment = await repo().save({
            orderId: 1,
            method: 'cash',
            state: 'Authorized',
            metadata: placement,
        });
        await Promise.all([service().confirm(ctx, 1), service().confirm(ctx, 1)]);
        await service().confirm(ctx, 1);
        expect(settlePayment).toHaveBeenCalledTimes(1);
        expect(await stateOf(payment.id)).toBe('Settled');
    });

    it('never touches a card payment or another order', async () => {
        const card = await repo().save({
            orderId: 1,
            method: 'online-stub',
            state: 'Authorized',
            metadata: placement,
        });
        await repo().save({ orderId: 1, method: 'cash', state: 'Authorized', metadata: placement });
        const other = await repo().save({
            orderId: 2,
            method: 'cash',
            state: 'Authorized',
            metadata: placement,
        });
        await service().confirm(ctx, 1);
        expect(await stateOf(card.id)).toBe('Authorized');
        expect(await stateOf(other.id)).toBe('Authorized');
    });

    it('refuses an order with no cash or bank-transfer payment', async () => {
        await repo().save({
            orderId: 1,
            method: 'online-stub',
            state: 'Settled',
            metadata: placement,
        });
        await expect(service().confirm(ctx, 1)).rejects.toBeInstanceOf(UserInputError);
    });

    it('does not reveal an order outside the caller scope', async () => {
        visible = false;
        await repo().save({ orderId: 1, method: 'cash', state: 'Authorized', metadata: placement });
        await expect(service().confirm(ctx, 1)).rejects.toBeInstanceOf(EntityNotFoundError);
        expect(settlePayment).not.toHaveBeenCalled();
    });

    it('records who confirmed and when, in the payment metadata', async () => {
        const payment = await repo().save({
            orderId: 1,
            method: 'cash',
            state: 'Authorized',
            metadata: placement,
        });
        await service().confirm(ctx, 1);
        const saved = await repo().findOneByOrFail({ id: payment.id });
        expect(saved.metadata).toMatchObject({
            ...placement,
            confirmedByAdministratorId: '77',
        });
        expect(typeof saved.metadata?.confirmedAt).toBe('string');
    });

    it('never settles a legacy payment without placement metadata', async () => {
        const legacy = await repo().save({
            orderId: 1,
            method: 'offline-terms',
            state: 'Authorized',
            metadata: { origin: 'legacy-deferred' },
        });
        await expect(service().confirm(ctx, 1)).rejects.toBeInstanceOf(UserInputError);
        expect(await stateOf(legacy.id)).toBe('Authorized');
        expect(settlePayment).not.toHaveBeenCalled();
    });

    it('confirms only the payment named by paymentId and rejects one of another order', async () => {
        const first = await repo().save({
            orderId: 1,
            method: 'cash',
            state: 'Authorized',
            metadata: placement,
        });
        const second = await repo().save({
            orderId: 1,
            method: 'offline-terms',
            state: 'Authorized',
            metadata: placement,
        });
        const foreign = await repo().save({
            orderId: 2,
            method: 'cash',
            state: 'Authorized',
            metadata: placement,
        });
        await service().confirm(ctx, 1, second.id);
        expect(await stateOf(second.id)).toBe('Settled');
        expect(await stateOf(first.id)).toBe('Authorized');
        await expect(service().confirm(ctx, 1, foreign.id)).rejects.toBeInstanceOf(UserInputError);
        expect(await stateOf(foreign.id)).toBe('Authorized');
    });

    describe.each([
        ['branch scope', 'branchId', 'branch-a', 'branch-b'],
        ['own scope', 'managerId', 'manager-a', 'manager-b'],
    ] as const)('%s', (_name, column, mine, other) => {
        it('settles an in-scope order and leaves an out-of-scope order and its payment untouched', async () => {
            const inScope = await dataSource
                .getRepository(TestOrder)
                .save({ [column]: mine } as Partial<TestOrder>);
            const outOfScope = await dataSource
                .getRepository(TestOrder)
                .save({ [column]: other } as Partial<TestOrder>);
            const a = await repo().save({
                orderId: inScope.id,
                method: 'cash',
                state: 'Authorized',
                metadata: placement,
            });
            const b = await repo().save({
                orderId: outOfScope.id,
                method: 'cash',
                state: 'Authorized',
                metadata: placement,
            });
            scopeFilter = { column, value: mine };

            await service().confirm(ctx, inScope.id);
            await expect(service().confirm(ctx, outOfScope.id)).rejects.toBeInstanceOf(
                EntityNotFoundError,
            );

            expect(await stateOf(a.id)).toBe('Settled');
            expect(await stateOf(b.id)).toBe('Authorized');
            expect(settlePayment).toHaveBeenCalledTimes(1);
        });
    });
});
