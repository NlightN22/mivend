import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { Invoice } from '../../entities/invoice.entity';
import { PaymentAttempt } from '../../entities/payment-attempt.entity';
import { SettlementEntry } from '../../entities/settlement-entry.entity';
import { InvoiceService } from '../../invoice.service';
import { PaymentAttemptService } from '../../payment-attempt.service';
import { SettlementEntryService } from '../../settlement-entry.service';

// Mirrors the real invoice/payment_attempt/settlement_entry tables against a real Postgres
// (same approach as invoice.service.int.test.ts) — real transaction/rollback/row-locking
// semantics can't be observed against a mocked TransactionalConnection, only a real DB.
@Entity('invoice')
@Index(['counterpartyId', 'organizationId', 'status'])
class TestInvoice {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'int' }) orderId!: number;
    @Column({ type: 'int' }) organizationId!: number;
    @Column({ type: 'int' }) counterpartyId!: number;
    @Column({ type: 'int' }) amount!: number;
    @Column({ type: 'varchar' }) currencyCode!: string;
    @Column({ type: 'varchar', default: 'pending' }) status!: string;
    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;
}

@Entity('payment_attempt')
class TestPaymentAttempt {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) channel!: string;
    @Column({ type: 'int', nullable: true }) invoiceId!: number | null;
    @Column({ type: 'int', nullable: true }) orderId!: number | null;
    @Column({ type: 'int' }) amount!: number;
    @Column({ type: 'varchar' }) currencyCode!: string;
    @Column({ type: 'varchar', nullable: true }) providerPaymentId!: string | null;
    @Column({ type: 'varchar', default: 'pending' }) paymentStatus!: string;
    @Column({ type: 'varchar', default: 'notRequired' }) erpPostingStatus!: string;
    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;
}

@Entity('settlement_entry')
class TestSettlementEntry {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'int' }) counterpartyId!: number;
    @Column({ type: 'int', nullable: true }) invoiceId!: number | null;
    @Column({ type: 'int', nullable: true }) organizationId!: number | null;
    @Column({ type: 'varchar' }) sourceType!: string;
    @Column({ type: 'int', nullable: true }) sourcePaymentId!: number | null;
    @Column({ type: 'int', nullable: true }) sourceRefundId!: number | null;
    @Column({ type: 'int' }) amount!: number;
    @Column({ type: 'varchar' }) currencyCode!: string;
    @Column({ type: 'boolean', default: false }) reconciled!: boolean;
    @Column({ type: 'int', nullable: true }) allocatedOrderId!: number | null;
    @Column({ type: 'int', nullable: true }) allocationAmount!: number | null;
    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;
}

let dataSource: DataSource;
let invoiceService: InvoiceService;
let settlementEntryService: SettlementEntryService;
let paymentAttemptService: PaymentAttemptService;
const mockCtx = {} as RequestContext;

// Maps the real entity classes the services import (Invoice/PaymentAttempt/SettlementEntry)
// onto this file's standalone Test* mirrors, keyed by object identity — the real service code
// does `entity === Invoice` style lookups, so the shim must recognize the *actual* imported
// classes, not just any class with the right shape.
function mapEntity(
    entity: unknown,
): typeof TestInvoice | typeof TestPaymentAttempt | typeof TestSettlementEntry {
    if (entity === Invoice) return TestInvoice;
    if (entity === PaymentAttempt) return TestPaymentAttempt;
    if (entity === SettlementEntry) return TestSettlementEntry;
    throw new Error(`Unmapped entity in test connection shim: ${String(entity)}`);
}

interface TxCtx {
    __manager?: import('typeorm').EntityManager;
}

// Set by failNthSettlementSave() below to simulate a crash partway through allocate()'s loop.
// Applied inside getRepository (the single choke point every repo access goes through,
// transactional or not) — spying on `dataSource.manager` directly doesn't work here because the
// transactional EntityManager passed into `dataSource.transaction(async manager => ...)` is a
// *different* object each call, not `dataSource.manager` itself.
let forcedSettlementSaveFailureAtCall: number | null = null;
let settlementSaveCallCount = 0;

function failNthSettlementSave(n: number): void {
    settlementSaveCallCount = 0;
    forcedSettlementSaveFailureAtCall = n;
}

function clearForcedFailure(): void {
    forcedSettlementSaveFailureAtCall = null;
    settlementSaveCallCount = 0;
}

function buildConnectionShim(): TransactionalConnection {
    return {
        getRepository: (ctx: RequestContext & TxCtx, entity: unknown) => {
            const manager = ctx.__manager ?? dataSource.manager;
            const testEntity = mapEntity(entity);
            const repo = manager.getRepository(testEntity);
            if (testEntity !== TestSettlementEntry || forcedSettlementSaveFailureAtCall === null) {
                return repo;
            }
            return new Proxy(repo, {
                get(target, prop, receiver) {
                    if (prop === 'save') {
                        return async (...args: unknown[]) => {
                            settlementSaveCallCount += 1;
                            if (settlementSaveCallCount === forcedSettlementSaveFailureAtCall) {
                                throw new Error('simulated crash mid-allocation');
                            }
                            return (target.save as (...a: unknown[]) => Promise<unknown>)(...args);
                        };
                    }
                    return Reflect.get(target, prop, receiver);
                },
            });
        },
        // Only the 2-arg form is used by PaymentAttemptService.payInvoice — no need to shim the
        // 1-arg overload here.
        withTransaction: async <T>(
            ctx: RequestContext & TxCtx,
            work: (ctx: RequestContext) => Promise<T>,
        ): Promise<T> => {
            return dataSource.transaction(async manager => {
                const txCtx = { ...ctx, __manager: manager } as RequestContext & TxCtx;
                return work(txCtx);
            });
        },
    } as unknown as TransactionalConnection;
}

const { schema, extra } = testSchemaOptions('payment_atomicity');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestInvoice, TestPaymentAttempt, TestSettlementEntry],
        synchronize: true,
    });
    await dataSource.initialize();

    const connectionShim = buildConnectionShim();
    invoiceService = new InvoiceService(
        connectionShim,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
    );
    settlementEntryService = new SettlementEntryService(connectionShim, invoiceService);
    paymentAttemptService = new PaymentAttemptService(
        connectionShim,
        invoiceService,
        settlementEntryService,
        { report: vi.fn(async () => ({ id: 1 })) } as never,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.getRepository(TestSettlementEntry).clear();
    await dataSource.getRepository(TestPaymentAttempt).clear();
    await dataSource.getRepository(TestInvoice).clear();
});

afterEach(() => {
    clearForcedFailure();
});

async function seedInvoicePair(): Promise<[TestInvoice, TestInvoice]> {
    const [invoiceA, invoiceB] = await dataSource.getRepository(TestInvoice).save([
        {
            orderId: 1,
            organizationId: 1,
            counterpartyId: 5,
            amount: 3000,
            currencyCode: 'RUB',
            status: 'paid',
        },
        {
            orderId: 2,
            organizationId: 1,
            counterpartyId: 5,
            amount: 1000,
            currencyCode: 'RUB',
            status: 'issued',
        },
    ]);
    return [invoiceA, invoiceB];
}

describe('Payment atomicity and recovery (integration, real Postgres)', () => {
    // invoiceA is already paid (simulating "a duplicate payment arrives from another channel")
    // so this payInvoice call's whole amount cascades to invoiceB, then the remainder becomes
    // an advance — two separate SettlementEntry writes in one call, which is what lets us
    // observe a forced failure *between* them.
    it('a failure partway through allocation rolls back everything — no orphaned PaymentAttempt, no partial SettlementEntry, no partial invoice status change', async () => {
        const [invoiceA, invoiceB] = await seedInvoicePair();
        failNthSettlementSave(2);

        await expect(
            paymentAttemptService.payInvoice(mockCtx, Number(invoiceA.id), 'success'),
        ).rejects.toThrow(/simulated crash mid-allocation/);

        clearForcedFailure();

        // Nothing partial left behind: the PaymentAttempt insert and both SettlementEntry writes
        // (including the one that "succeeded" before the throw) were all in the same
        // transaction, so all of it rolled back together.
        const paymentAttempts = await dataSource
            .getRepository(TestPaymentAttempt)
            .find({ where: { invoiceId: Number(invoiceA.id) } });
        expect(paymentAttempts).toHaveLength(0);

        const settlementEntries = await dataSource.getRepository(TestSettlementEntry).find();
        expect(settlementEntries).toHaveLength(0);

        const refetchedB = await dataSource.getRepository(TestInvoice).findOneOrFail({
            where: { id: Number(invoiceB.id) },
        });
        expect(refetchedB.status).toBe('issued'); // NOT 'paid' — that update rolled back too
    });

    it('resumes correctly on retry after an interrupted allocation, completing the allocation exactly once with no duplication', async () => {
        const [invoiceA, invoiceB] = await seedInvoicePair();
        failNthSettlementSave(2);

        await expect(
            paymentAttemptService.payInvoice(mockCtx, Number(invoiceA.id), 'success'),
        ).rejects.toThrow(/simulated crash mid-allocation/);

        // Central "recovers" — the caller (branch/ERP redelivery, or the customer retrying)
        // simply calls payInvoice again. Nothing partial existed to reconcile (see the previous
        // test), so this is a clean run.
        clearForcedFailure();

        const result = await paymentAttemptService.payInvoice(
            mockCtx,
            Number(invoiceA.id),
            'success',
        );
        expect(result.status).toBe('paid'); // invoiceA itself — already paid before, unaffected by this call

        const refetchedB = await dataSource.getRepository(TestInvoice).findOneOrFail({
            where: { id: Number(invoiceB.id) },
        });
        expect(refetchedB.status).toBe('paid');

        const entries = await dataSource.getRepository(TestSettlementEntry).find();
        // Exactly one allocation to invoiceB (1000) and one advance entry for the remainder
        // (3000 - 1000 = 2000) — not doubled by the earlier failed/rolled-back attempt.
        expect(entries).toHaveLength(2);
        const toInvoiceB = entries.find(e => e.invoiceId === Number(invoiceB.id));
        const advance = entries.find(e => e.invoiceId === null);
        expect(toInvoiceB?.allocationAmount).toBe(1000);
        expect(advance?.amount).toBe(2000);

        const paymentAttempts = await dataSource
            .getRepository(TestPaymentAttempt)
            .find({ where: { invoiceId: Number(invoiceA.id) } });
        expect(paymentAttempts).toHaveLength(1); // exactly one — the failed attempt left nothing behind
    });
});
