import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ProformaInvoice } from '../../entities/proforma-invoice.entity';
import { PaymentAttempt } from '../../entities/payment-attempt.entity';
import { SettlementEntry } from '../../entities/settlement-entry.entity';
import { ProformaInvoiceService } from '../../proforma-invoice.service';
import { PaymentAttemptService } from '../../payment-attempt.service';
import { SettlementEntryService } from '../../settlement-entry.service';

// Real Postgres is required: mocked TransactionalConnection can't show transaction, rollback,
// or row-locking behavior.
@Entity('proforma_invoice')
@Index(['counterpartyId', 'organizationId', 'status'])
class TestProformaInvoice {
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
@Index(['channel', 'providerPaymentId'], { unique: true })
class TestPaymentAttempt {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) channel!: string;
    @Column({ type: 'int', nullable: true }) proformaInvoiceId!: number | null;
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
    @Column({ type: 'int', nullable: true }) proformaInvoiceId!: number | null;
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
let proformaInvoiceService: ProformaInvoiceService;
let settlementEntryService: SettlementEntryService;
let paymentAttemptService: PaymentAttemptService;
const mockCtx = {} as RequestContext;

// Service code compares entities by identity (`entity === ProformaInvoice`), so the shim must
// receive the real imported classes, not look-alike classes with the same shape.
function mapEntity(
    entity: unknown,
): typeof TestProformaInvoice | typeof TestPaymentAttempt | typeof TestSettlementEntry {
    if (entity === ProformaInvoice) return TestProformaInvoice;
    if (entity === PaymentAttempt) return TestPaymentAttempt;
    if (entity === SettlementEntry) return TestSettlementEntry;
    throw new Error(`Unmapped entity in test connection shim: ${String(entity)}`);
}

interface TxCtx {
    __manager?: import('typeorm').EntityManager;
}

// Hook lives in getRepository: the transactional EntityManager is a new object on each
// dataSource.transaction() call, so spying on dataSource.manager would miss it.
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
        // Only the 2-arg form is used by PaymentAttemptService.payProformaInvoice — no need to shim the
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
        entities: [TestProformaInvoice, TestPaymentAttempt, TestSettlementEntry],
        synchronize: true,
    });
    await dataSource.initialize();

    const connectionShim = buildConnectionShim();
    const numberingServiceShim = {
        next: vi.fn(async () => `test-number-${Math.random()}`),
        formatOrderDocumentNumber: (orderNumber: string, ordinal: number) =>
            `${orderNumber}-${String(ordinal).padStart(2, '0')}`,
    } as never;
    proformaInvoiceService = new ProformaInvoiceService(connectionShim);
    settlementEntryService = new SettlementEntryService(connectionShim, proformaInvoiceService);
    paymentAttemptService = new PaymentAttemptService(
        connectionShim,
        proformaInvoiceService,
        settlementEntryService,
        { report: vi.fn(async () => ({ id: 1 })) } as never,
        numberingServiceShim,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.getRepository(TestSettlementEntry).clear();
    await dataSource.getRepository(TestPaymentAttempt).clear();
    await dataSource.getRepository(TestProformaInvoice).clear();
});

afterEach(() => {
    clearForcedFailure();
});

async function seedProformaInvoicePair(): Promise<[TestProformaInvoice, TestProformaInvoice]> {
    const [proformaInvoiceA, proformaInvoiceB] = await dataSource
        .getRepository(TestProformaInvoice)
        .save([
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
    return [proformaInvoiceA, proformaInvoiceB];
}

describe('Payment atomicity and recovery (integration, real Postgres)', () => {
    // Two SettlementEntry writes in one call (cascade to B, then advance) leave a gap where a
    // forced failure can land between them.
    it('a failure partway through allocation rolls back everything — no orphaned PaymentAttempt, no partial SettlementEntry, no partial proforma invoice status change', async () => {
        const [proformaInvoiceA, proformaInvoiceB] = await seedProformaInvoicePair();
        failNthSettlementSave(2);

        await expect(
            paymentAttemptService.payProformaInvoice(
                mockCtx,
                Number(proformaInvoiceA.id),
                'success',
            ),
        ).rejects.toThrow(/simulated crash mid-allocation/);

        clearForcedFailure();

        // All writes share one transaction, so a failure rolls back the PaymentAttempt and
        // both SettlementEntry writes together, including the first one that succeeded.
        const paymentAttempts = await dataSource
            .getRepository(TestPaymentAttempt)
            .find({ where: { proformaInvoiceId: Number(proformaInvoiceA.id) } });
        expect(paymentAttempts).toHaveLength(0);

        const settlementEntries = await dataSource.getRepository(TestSettlementEntry).find();
        expect(settlementEntries).toHaveLength(0);

        const refetchedB = await dataSource.getRepository(TestProformaInvoice).findOneOrFail({
            where: { id: Number(proformaInvoiceB.id) },
        });
        expect(refetchedB.status).toBe('issued'); // NOT 'paid' — that update rolled back too
    });

    it('resumes correctly on retry after an interrupted allocation, completing the allocation exactly once with no duplication', async () => {
        const [proformaInvoiceA, proformaInvoiceB] = await seedProformaInvoicePair();
        failNthSettlementSave(2);

        await expect(
            paymentAttemptService.payProformaInvoice(
                mockCtx,
                Number(proformaInvoiceA.id),
                'success',
            ),
        ).rejects.toThrow(/simulated crash mid-allocation/);

        // Retry is a plain second call: the failed attempt rolled back fully, so nothing partial
        // exists to reconcile.
        clearForcedFailure();

        const result = await paymentAttemptService.payProformaInvoice(
            mockCtx,
            Number(proformaInvoiceA.id),
            'success',
        );
        expect(result.status).toBe('paid'); // proformaInvoiceA itself — already paid before, unaffected by this call

        const refetchedB = await dataSource.getRepository(TestProformaInvoice).findOneOrFail({
            where: { id: Number(proformaInvoiceB.id) },
        });
        expect(refetchedB.status).toBe('paid');

        const entries = await dataSource.getRepository(TestSettlementEntry).find();
        // Exactly one allocation to proformaInvoiceB (1000) and one advance entry for the remainder
        // (3000 - 1000 = 2000) — not doubled by the earlier failed/rolled-back attempt.
        expect(entries).toHaveLength(2);
        const toProformaInvoiceB = entries.find(
            e => e.proformaInvoiceId === Number(proformaInvoiceB.id),
        );
        const advance = entries.find(e => e.proformaInvoiceId === null);
        expect(toProformaInvoiceB?.allocationAmount).toBe(1000);
        expect(advance?.amount).toBe(2000);

        const paymentAttempts = await dataSource
            .getRepository(TestPaymentAttempt)
            .find({ where: { proformaInvoiceId: Number(proformaInvoiceA.id) } });
        expect(paymentAttempts).toHaveLength(1); // exactly one — the failed attempt left nothing behind
    });

    // Inbox retry: payProformaInvoice can commit before markProcessed fails, so the same explicit
    // externalReference is replayed; the (channel, providerPaymentId) unique guard blocks a duplicate.
    it('retrying payProformaInvoice with the exact same (channel, externalReference) is a safe no-op — no duplicate PaymentAttempt, no double allocation', async () => {
        const [proformaInvoiceA, proformaInvoiceB] = await seedProformaInvoicePair();
        const sameReference = 'RRN-fixed-reference-for-retry-test';

        const first = await paymentAttemptService.payProformaInvoice(
            mockCtx,
            Number(proformaInvoiceA.id),
            'success',
            'branch-kassa',
            sameReference,
        );
        expect(first.status).toBe('paid');

        const second = await paymentAttemptService.payProformaInvoice(
            mockCtx,
            Number(proformaInvoiceA.id),
            'success',
            'branch-kassa',
            sameReference,
        );
        expect(second.status).toBe('paid');

        const paymentAttempts = await dataSource
            .getRepository(TestPaymentAttempt)
            .find({ where: { providerPaymentId: sameReference } });
        expect(paymentAttempts).toHaveLength(1); // not 2 — the retry did not create a duplicate

        const refetchedB = await dataSource.getRepository(TestProformaInvoice).findOneOrFail({
            where: { id: Number(proformaInvoiceB.id) },
        });
        expect(refetchedB.status).toBe('paid');

        const entries = await dataSource.getRepository(TestSettlementEntry).find();
        // Exactly the allocation from the FIRST call — not doubled by the retry.
        expect(entries).toHaveLength(2);
    });

    it('two concurrent payProformaInvoice calls with the same (channel, externalReference) create exactly one PaymentAttempt', async () => {
        const [proformaInvoiceA] = await seedProformaInvoicePair();
        const sameReference = 'RRN-fixed-reference-for-concurrency-test';

        const results = await Promise.allSettled([
            paymentAttemptService.payProformaInvoice(
                mockCtx,
                Number(proformaInvoiceA.id),
                'success',
                'branch-kassa',
                sameReference,
            ),
            paymentAttemptService.payProformaInvoice(
                mockCtx,
                Number(proformaInvoiceA.id),
                'success',
                'branch-kassa',
                sameReference,
            ),
        ]);

        // Must run concurrently: a find-first check alone can't stop the race, so only the DB unique
        // constraint makes the losing call a safe no-op.
        expect(results.every(r => r.status === 'fulfilled')).toBe(true);

        const paymentAttempts = await dataSource
            .getRepository(TestPaymentAttempt)
            .find({ where: { providerPaymentId: sameReference } });
        expect(paymentAttempts).toHaveLength(1);
    });
});
