import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, EntityManager, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
    withAggregateLock,
} from 'shared';

import { PaymentAttempt } from '../../entities/payment-attempt.entity';
import { ProformaInvoice } from '../../entities/proforma-invoice.entity';
import { SettlementEntry } from '../../entities/settlement-entry.entity';
import { PaymentAttemptService } from '../../payment-attempt.service';
import { ProformaInvoiceOrderCancelService } from '../../proforma-invoice-order-cancel.service';
import { ProformaInvoiceService } from '../../proforma-invoice.service';
import { SettlementEntryService } from '../../settlement-entry.service';

@Entity('proforma_invoice')
class TestProformaInvoice {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) orderId!: number;
    @Column({ type: 'int' }) organizationId!: number;
    @Column({ type: 'int' }) counterpartyId!: number;
    @Column({ type: 'int' }) amount!: number;
    @Column({ type: 'varchar' }) currencyCode!: string;
    @Column({ type: 'varchar', default: 'pending' }) status!: string;
    @Column({ type: 'int', nullable: true }) supersededById!: number | null;
    @Column({ type: 'timestamptz', nullable: true }) withdrawnAt!: Date | null;
    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;
}

@Entity('settlement_entry')
class TestSettlementEntry {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) counterpartyId!: number;
    @Column({ type: 'int', nullable: true }) proformaInvoiceId!: number | null;
    @Column({ type: 'int', nullable: true }) organizationId!: number | null;
    @Column({ type: 'varchar' }) sourceType!: string;
    @Column({ type: 'int', nullable: true }) sourcePaymentId!: number | null;
    @Column({ type: 'int' }) amount!: number;
    @Column({ type: 'varchar' }) currencyCode!: string;
    @Column({ type: 'int', nullable: true }) allocatedOrderId!: number | null;
    @Column({ type: 'int', nullable: true }) allocationAmount!: number | null;
}

@Entity('payment_attempt')
@Index(['channel', 'providerPaymentId'], { unique: true })
class TestPaymentAttempt {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', nullable: true }) number!: string | null;
    @Column({ type: 'varchar' }) channel!: string;
    @Column({ type: 'int', nullable: true }) proformaInvoiceId!: number | null;
    @Column({ type: 'int', nullable: true }) orderId!: number | null;
    @Column({ type: 'int' }) amount!: number;
    @Column({ type: 'varchar' }) currencyCode!: string;
    @Column({ type: 'varchar', nullable: true }) providerPaymentId!: string | null;
    @Column({ type: 'varchar', default: 'pending' }) paymentStatus!: string;
}

let dataSource: DataSource;
let connection: TransactionalConnection;
let cancel: ProformaInvoiceOrderCancelService;
let payments: PaymentAttemptService;
let settlement: SettlementEntryService;
const { schema, extra } = testSchemaOptions('proforma_order_cancel');
const ctx = {} as RequestContext;
const mirrors = new Map<unknown, unknown>([
    [ProformaInvoice, TestProformaInvoice],
    [SettlementEntry, TestSettlementEntry],
    [PaymentAttempt, TestPaymentAttempt],
]);

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestProformaInvoice, TestSettlementEntry, TestPaymentAttempt],
        synchronize: true,
    });
    await dataSource.initialize();
    connection = {
        getRepository: (c: RequestContext, entity: unknown) => {
            const manager =
                (c as unknown as { __manager?: EntityManager }).__manager ?? dataSource.manager;
            if (typeof entity === 'string') {
                return { query: (sql: string, params?: unknown[]) => manager.query(sql, params) };
            }
            return manager.getRepository(mirrors.get(entity) as never);
        },
        // Vendure reuses the ctx's open transaction, so a nested aggregate lock is re-entrant.
        withTransaction: async (
            c: RequestContext,
            work: (x: RequestContext) => Promise<unknown>,
        ) =>
            (c as unknown as { __manager?: EntityManager }).__manager
                ? work(c)
                : dataSource.transaction(manager =>
                      work({ ...c, __manager: manager } as unknown as RequestContext),
                  ),
    } as unknown as TransactionalConnection;
    const proformaInvoiceService = new ProformaInvoiceService(connection);
    settlement = new SettlementEntryService(connection, proformaInvoiceService);
    payments = new PaymentAttemptService(
        connection,
        proformaInvoiceService,
        settlement,
        { report: async () => ({ id: 1 }) } as never,
        { next: async () => `n-${Math.random()}` } as never,
    );
    cancel = new ProformaInvoiceOrderCancelService(connection);
});

beforeEach(async () => {
    await dataSource.query('TRUNCATE "proforma_invoice", "settlement_entry", "payment_attempt"');
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const addInvoice = async (orderId: number, status = 'issued'): Promise<number> =>
    (
        await dataSource.getRepository(TestProformaInvoice).save({
            orderId,
            organizationId: 1,
            counterpartyId: 1,
            amount: 1000,
            currencyCode: 'USD',
            status,
        })
    ).id;
const statusOf = async (id: number): Promise<string> =>
    (await dataSource.getRepository(TestProformaInvoice).findOneByOrFail({ id })).status;
const advance = async (): Promise<number> =>
    (await settlement.getAdvanceBalance(ctx, 1))[0]?.amount ?? 0;
const erpCapture = (id: number, ref: string): Promise<unknown> =>
    payments.payProformaInvoice(ctx, id, 'success', 'online-acquiring', ref, 1, {
        amount: 1000,
        currencyCode: 'USD',
    });

describe('ProformaInvoiceOrderCancelService (real Postgres)', () => {
    it('closes a proforma with a payment in progress; its late capture becomes an advance', async () => {
        const id = await addInvoice(7);
        const other = await addInvoice(8);
        await payments.payProformaInvoice(ctx, id, 'pending', 'online-acquiring', 'p-1');

        await cancel.closeForCancelledOrder(ctx, 7);
        expect(await statusOf(id)).toBe('cancelled');

        await erpCapture(id, 'cap-1');
        await erpCapture(id, 'cap-1');

        expect(await advance()).toBe(1000);
        expect(await statusOf(other)).toBe('issued');
    });

    it('moves an already recorded payment to the advance exactly once', async () => {
        const id = await addInvoice(7);
        await erpCapture(id, 'cap-1');
        expect(await statusOf(id)).toBe('paid');

        await cancel.closeForCancelledOrder(ctx, 7);
        await cancel.closeForCancelledOrder(ctx, 7);

        expect(await statusOf(id)).toBe('cancelled');
        expect(await advance()).toBe(1000);
    });

    it('a capture racing the cancel always ends as exactly one advance', async () => {
        for (let round = 0; round < 5; round++) {
            await dataSource.query(
                'TRUNCATE "proforma_invoice", "settlement_entry", "payment_attempt"',
            );
            const id = await addInvoice(7);

            const results = await Promise.allSettled([
                cancel.closeForCancelledOrder(ctx, 7),
                erpCapture(id, `cap-${round}`),
            ]);

            expect(results.map(r => r.status)).toEqual(['fulfilled', 'fulfilled']);
            expect(await statusOf(id)).toBe('cancelled');
            expect(await advance()).toBe(1000);
        }
    });

    it('a capture waits for the order proforma lock a cancel holds, then lands on the advance', async () => {
        const id = await addInvoice(7);
        let captured = false;
        let capture: Promise<unknown> = Promise.resolve();

        await withAggregateLock(connection, ctx, 'proformaInvoices-for-order:7', async txCtx => {
            capture = erpCapture(id, 'cap-held').then(() => (captured = true));
            await new Promise(resolve => setTimeout(resolve, 150));
            expect(captured).toBe(false);
            await cancel.closeForCancelledOrder(txCtx, 7);
        });
        await capture;

        expect(await statusOf(id)).toBe('cancelled');
        expect(await advance()).toBe(1000);
    });
});
