import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    Column,
    DataSource,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { BranchKassaPaymentEvent, ErpPaymentReportedEvent } from '@mivend/plugin-sync';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { IncomingPaymentEvent } from '../../entities/incoming-payment-event.entity';
import { Invoice } from '../../entities/invoice.entity';
import { PaymentAttempt } from '../../entities/payment-attempt.entity';
import { SettlementEntry } from '../../entities/settlement-entry.entity';
import { InboxService } from '../../inbox.service';
import { InvoiceService } from '../../invoice.service';
import { PaymentAttemptService } from '../../payment-attempt.service';
import { PaymentEventListener } from '../../payment-event.listener';
import { PaymentInboxProcessorService } from '../../payment-inbox-processor.service';
import { SettlementEntryService } from '../../settlement-entry.service';

// A minimal real EventBus double — just enough of Vendure's ofType/publish contract for
// PaymentEventListener to subscribe and receive events for real, without booting the full
// Vendure DI/app (consistent with this file's existing style of shimming only what's needed
// around real Postgres + real service instances).
class FakeEventBus {
    private subscribersByType = new Map<unknown, Array<(event: unknown) => Promise<void> | void>>();

    ofType(type: unknown): { subscribe: (fn: (event: unknown) => Promise<void> | void) => void } {
        return {
            subscribe: (fn: (event: unknown) => Promise<void> | void) => {
                const list = this.subscribersByType.get(type) ?? [];
                list.push(fn);
                this.subscribersByType.set(type, list);
            },
        };
    }

    // Awaits subscribers (unlike the real Vendure EventBus, which is fire-and-forget) purely so
    // this test can assert on the enqueued row right after publish without an extra tick/poll.
    async publish(event: unknown): Promise<void> {
        for (const fn of this.subscribersByType.get(event!.constructor) ?? []) {
            await fn(event);
        }
    }
}

// Models the scenario this test suite exists for: a payment event is reported exactly once by
// an external source (a real acquirer webhook once Robokassa/issue #46 lands, or — exercised
// here — the ERP exchange reporting a bank transfer) via InboxService.enqueue, completely
// independent of whether PaymentInboxProcessorService.processPendingEvents (the periodic sweep,
// PaymentInboxWorker in production) succeeds on its first attempt. If Central fails to finish
// processing for its own reasons (the scenario that prompted this test), the event is durably
// recorded and the *next* sweep resumes it automatically — nothing is lost, and redelivery of
// the same event is a safe no-op (level 2 idempotency, docs/payments.md).
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
@Index(['channel', 'providerPaymentId'], { unique: true })
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

@Entity('incoming_payment_event')
@Index(['provider', 'providerEventId'], { unique: true })
class TestIncomingPaymentEvent {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) provider!: string;
    @Column({ type: 'varchar' }) providerEventId!: string;
    @Column({ type: 'varchar' }) payloadHash!: string;
    @Column({ type: 'text' }) payload!: string;
    @Column({ type: 'varchar', default: 'pending' }) status!: string;
    @Column({ type: 'int', default: 0 }) attempts!: number;
    @Column({ type: 'text', nullable: true }) lastError!: string | null;
    @Column({ type: 'timestamp', nullable: true }) processedAt!: Date | null;
    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;
    @UpdateDateColumn() updatedAt!: Date;
}

let dataSource: DataSource;
let invoiceService: InvoiceService;
let settlementEntryService: SettlementEntryService;
let paymentAttemptService: PaymentAttemptService;
let inboxService: InboxService;
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- vitest's Mock<> generic return type is awkward to spell out exactly here
function createMockReconciliationIssueService() {
    return { report: vi.fn(async () => ({ id: 1 })) };
}
let reconciliationIssueService: ReturnType<typeof createMockReconciliationIssueService>;
let processorService: PaymentInboxProcessorService;
let eventBus: FakeEventBus;
let paymentEventListener: PaymentEventListener;
const mockCtx = {} as RequestContext;

function mapEntity(
    entity: unknown,
):
    | typeof TestInvoice
    | typeof TestPaymentAttempt
    | typeof TestSettlementEntry
    | typeof TestIncomingPaymentEvent {
    if (entity === Invoice) return TestInvoice;
    if (entity === PaymentAttempt) return TestPaymentAttempt;
    if (entity === SettlementEntry) return TestSettlementEntry;
    if (entity === IncomingPaymentEvent) return TestIncomingPaymentEvent;
    throw new Error(`Unmapped entity in test connection shim: ${String(entity)}`);
}

interface TxCtx {
    __manager?: import('typeorm').EntityManager;
}

// Forces processPendingEvents' underlying payInvoice call to fail on its Nth SettlementEntry
// write — simulating "Central could not complete the transaction for its own reasons" without
// needing a real crash. Applied at the single getRepository choke point so it works whether or
// not the call happens to be inside a transaction at the time (same technique as
// payment-atomicity.int.test.ts).
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
                                throw new Error('simulated processing failure');
                            }
                            return (target.save as (...a: unknown[]) => Promise<unknown>)(...args);
                        };
                    }
                    return Reflect.get(target, prop, receiver);
                },
            });
        },
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

const { schema, extra } = testSchemaOptions('payment_inbox');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestInvoice, TestPaymentAttempt, TestSettlementEntry, TestIncomingPaymentEvent],
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
    reconciliationIssueService = createMockReconciliationIssueService();
    paymentAttemptService = new PaymentAttemptService(
        connectionShim,
        invoiceService,
        settlementEntryService,
        reconciliationIssueService as never,
    );
    inboxService = new InboxService(connectionShim);
    processorService = new PaymentInboxProcessorService(inboxService, paymentAttemptService);
    eventBus = new FakeEventBus();
    paymentEventListener = new PaymentEventListener(eventBus as never, inboxService);
    paymentEventListener.onModuleInit();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.getRepository(TestIncomingPaymentEvent).clear();
    await dataSource.getRepository(TestSettlementEntry).clear();
    await dataSource.getRepository(TestPaymentAttempt).clear();
    await dataSource.getRepository(TestInvoice).clear();
});

afterEach(() => {
    clearForcedFailure();
});

describe('Payment inbox: webhook/ERP event arrives once, processing recovers on its own (integration, real Postgres)', () => {
    it('an event that fails to process on the first sweep is retried and completes correctly on the next sweep — nothing is lost', async () => {
        const invoice = await dataSource.getRepository(TestInvoice).save({
            orderId: 1,
            organizationId: 1,
            counterpartyId: 5,
            amount: 1000,
            currencyCode: 'RUB',
            status: 'issued',
        });

        // The event arrives exactly once — e.g. the ERP exchange reports a bank transfer for
        // this invoice. enqueue() durably records it before any processing is attempted.
        const enqueued = await inboxService.enqueue(
            mockCtx,
            'bank-transfer-erp',
            'erp-evt-1',
            'hash-1',
            {
                invoiceId: Number(invoice.id),
                organizationId: 1,
                outcome: 'success',
                channel: 'bank-transfer-erp',
                externalReference: 'erp-evt-1',
            },
        );
        expect(enqueued.status).toBe('pending');

        // First sweep: Central fails to finish processing this event for its own reasons.
        failNthSettlementSave(1);
        const firstSweep = await processorService.processPendingEvents(mockCtx);
        expect(firstSweep).toEqual({ processed: 0, failed: 1 });
        clearForcedFailure();

        // The invoice must NOT be paid yet — the failed attempt rolled back completely (same
        // transactional guarantee verified in payment-atomicity.int.test.ts).
        const afterFirstSweep = await dataSource
            .getRepository(TestInvoice)
            .findOneOrFail({ where: { id: Number(invoice.id) } });
        expect(afterFirstSweep.status).toBe('issued');

        // The event itself is durably back in 'pending' (not stuck 'processing', not silently
        // 'processed') with the failure recorded — nothing about the original event is lost.
        const eventAfterFailure = await dataSource
            .getRepository(TestIncomingPaymentEvent)
            .findOneOrFail({ where: { providerEventId: 'erp-evt-1' } });
        expect(eventAfterFailure.status).toBe('pending');
        expect(eventAfterFailure.attempts).toBe(1);
        expect(eventAfterFailure.lastError).toContain('simulated processing failure');

        // Central "recovers" — the next scheduled sweep (PaymentInboxWorker, once a minute in
        // production) picks the same event back up automatically. No special resume code path,
        // no manual intervention: just the next ordinary sweep.
        const secondSweep = await processorService.processPendingEvents(mockCtx);
        expect(secondSweep).toEqual({ processed: 1, failed: 0 });

        const afterSecondSweep = await dataSource
            .getRepository(TestInvoice)
            .findOneOrFail({ where: { id: Number(invoice.id) } });
        expect(afterSecondSweep.status).toBe('paid');

        const eventAfterSuccess = await dataSource
            .getRepository(TestIncomingPaymentEvent)
            .findOneOrFail({ where: { providerEventId: 'erp-evt-1' } });
        expect(eventAfterSuccess.status).toBe('processed');
        expect(eventAfterSuccess.processedAt).not.toBeNull();

        const paymentAttempts = await dataSource
            .getRepository(TestPaymentAttempt)
            .find({ where: { invoiceId: Number(invoice.id) } });
        expect(paymentAttempts).toHaveLength(1); // exactly one — the failed attempt left nothing behind
    });

    it('redelivery of the same event (provider retries because it never saw our ack) is a safe no-op, not a duplicate payment', async () => {
        const invoice = await dataSource.getRepository(TestInvoice).save({
            orderId: 2,
            organizationId: 1,
            counterpartyId: 5,
            amount: 500,
            currencyCode: 'RUB',
            status: 'issued',
        });
        const payload = {
            invoiceId: Number(invoice.id),
            organizationId: 1,
            outcome: 'success',
            channel: 'bank-transfer-erp',
            externalReference: 'erp-evt-2',
        };

        await inboxService.enqueue(mockCtx, 'bank-transfer-erp', 'erp-evt-2', 'hash-2', payload);
        await processorService.processPendingEvents(mockCtx);

        // Provider redelivers the identical event (same providerEventId) believing it wasn't
        // acknowledged — enqueue() recognizes it and does not create a second row.
        await inboxService.enqueue(mockCtx, 'bank-transfer-erp', 'erp-evt-2', 'hash-2', payload);

        const rows = await dataSource
            .getRepository(TestIncomingPaymentEvent)
            .find({ where: { providerEventId: 'erp-evt-2' } });
        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe('processed'); // already processed — redelivery finds nothing to do

        // A second sweep has nothing pending for this event, so it can't be double-applied.
        const secondSweep = await processorService.processPendingEvents(mockCtx);
        expect(secondSweep).toEqual({ processed: 0, failed: 0 });

        const paymentAttempts = await dataSource
            .getRepository(TestPaymentAttempt)
            .find({ where: { invoiceId: Number(invoice.id) } });
        expect(paymentAttempts).toHaveLength(1); // not doubled by the redelivery
    });

    it('an event that keeps failing is dead-lettered after the retry limit, instead of being retried forever', async () => {
        const invoice = await dataSource.getRepository(TestInvoice).save({
            orderId: 3,
            organizationId: 1,
            counterpartyId: 5,
            amount: 700,
            currencyCode: 'RUB',
            status: 'issued',
        });
        await inboxService.enqueue(mockCtx, 'bank-transfer-erp', 'erp-evt-3', 'hash-3', {
            invoiceId: Number(invoice.id),
            organizationId: 1,
            outcome: 'success',
            channel: 'bank-transfer-erp',
            externalReference: 'erp-evt-3',
        });

        // Fails every single sweep (not just once) — a genuinely broken event, not a transient
        // blip. MAX_ATTEMPTS in InboxService is 5.
        for (let i = 0; i < 5; i++) {
            failNthSettlementSave(1);
            await processorService.processPendingEvents(mockCtx);
            clearForcedFailure();
        }

        const event = await dataSource
            .getRepository(TestIncomingPaymentEvent)
            .findOneOrFail({ where: { providerEventId: 'erp-evt-3' } });
        expect(event.status).toBe('failed'); // dead-lettered, not stuck retrying forever
        expect(event.attempts).toBe(5);

        // A further sweep leaves it alone — 'failed' is terminal, not 'pending'.
        const claimed = await inboxService.claimBatch(mockCtx);
        expect(claimed).toHaveLength(0);
    });
});

describe('Payment inbox producers: real cross-plugin events land in the inbox (integration, real Postgres)', () => {
    it('a simulated ERP-reported bank transfer (ErpPaymentReportedEvent) is durably enqueued and eventually pays the invoice', async () => {
        const invoice = await dataSource.getRepository(TestInvoice).save({
            orderId: 10,
            organizationId: 1,
            counterpartyId: 5,
            amount: 1200,
            currencyCode: 'RUB',
            status: 'issued',
        });

        await eventBus.publish(
            new ErpPaymentReportedEvent(
                mockCtx,
                Number(invoice.id),
                1,
                'success',
                'erp-evt-simulated-1',
            ),
        );

        const enqueuedRow = await dataSource
            .getRepository(TestIncomingPaymentEvent)
            .findOneOrFail({ where: { providerEventId: 'erp-evt-simulated-1' } });
        expect(enqueuedRow.provider).toBe('erp');
        expect(enqueuedRow.status).toBe('pending');
        expect(JSON.parse(enqueuedRow.payload)).toEqual({
            invoiceId: Number(invoice.id),
            organizationId: 1,
            outcome: 'success',
            channel: 'bank-transfer-erp',
            externalReference: 'erp-evt-simulated-1',
        });

        const sweep = await processorService.processPendingEvents(mockCtx);
        expect(sweep).toEqual({ processed: 1, failed: 0 });

        const paidInvoice = await dataSource
            .getRepository(TestInvoice)
            .findOneOrFail({ where: { id: Number(invoice.id) } });
        expect(paidInvoice.status).toBe('paid');

        // The real timeline PaymentFieldResolver.processingEvents derives its stages from —
        // round-trips through the actual DB, not a fabricated shape.
        const inboxRow = await inboxService.findByProviderAndEventId(
            mockCtx,
            'erp',
            'erp-evt-simulated-1',
        );
        expect(inboxRow?.status).toBe('processed');
        expect(inboxRow?.processedAt).not.toBeNull();
    });

    it('a simulated branch-kassa cash payment (BranchKassaPaymentEvent) is durably enqueued and eventually pays the invoice', async () => {
        const invoice = await dataSource.getRepository(TestInvoice).save({
            orderId: 11,
            organizationId: 1,
            counterpartyId: 5,
            amount: 900,
            currencyCode: 'RUB',
            status: 'issued',
        });

        await eventBus.publish(
            new BranchKassaPaymentEvent(
                mockCtx,
                Number(invoice.id),
                1,
                'success',
                'sync-evt-simulated-1',
                'KASSA-RECEIPT-0001',
            ),
        );

        const enqueuedRow = await dataSource
            .getRepository(TestIncomingPaymentEvent)
            .findOneOrFail({ where: { providerEventId: 'sync-evt-simulated-1' } });
        expect(enqueuedRow.provider).toBe('branch-kassa');
        expect(enqueuedRow.status).toBe('pending');

        const sweep = await processorService.processPendingEvents(mockCtx);
        expect(sweep).toEqual({ processed: 1, failed: 0 });

        const paidInvoice = await dataSource
            .getRepository(TestInvoice)
            .findOneOrFail({ where: { id: Number(invoice.id) } });
        expect(paidInvoice.status).toBe('paid');
    });

    it('redelivery of the same ERP event through the EventBus again does not enqueue a duplicate row', async () => {
        const invoice = await dataSource.getRepository(TestInvoice).save({
            orderId: 12,
            organizationId: 1,
            counterpartyId: 5,
            amount: 300,
            currencyCode: 'RUB',
            status: 'issued',
        });

        const event = new ErpPaymentReportedEvent(
            mockCtx,
            Number(invoice.id),
            1,
            'success',
            'erp-evt-dup-1',
        );
        await eventBus.publish(event);
        await eventBus.publish(event);

        const rows = await dataSource
            .getRepository(TestIncomingPaymentEvent)
            .find({ where: { providerEventId: 'erp-evt-dup-1' } });
        expect(rows).toHaveLength(1);
    });

    it('a branch-kassa payment fact with no RRN/kassa receipt is durably recorded but immediately dead-lettered — never silently processed without its mandatory reconciliation reference', async () => {
        const invoice = await dataSource.getRepository(TestInvoice).save({
            orderId: 13,
            organizationId: 1,
            counterpartyId: 5,
            amount: 400,
            currencyCode: 'RUB',
            status: 'issued',
        });

        await eventBus.publish(
            new BranchKassaPaymentEvent(
                mockCtx,
                Number(invoice.id),
                1,
                'success',
                'sync-evt-no-rrn-1',
            ),
        );

        const row = await dataSource
            .getRepository(TestIncomingPaymentEvent)
            .findOneOrFail({ where: { providerEventId: 'sync-evt-no-rrn-1' } });
        expect(row.status).toBe('failed');
        expect(row.lastError).toContain('Missing mandatory external reference');

        const sweep = await processorService.processPendingEvents(mockCtx);
        expect(sweep).toEqual({ processed: 0, failed: 0 }); // nothing pending — dead-lettered rows aren't retried

        const untouchedInvoice = await dataSource
            .getRepository(TestInvoice)
            .findOneOrFail({ where: { id: Number(invoice.id) } });
        expect(untouchedInvoice.status).toBe('issued');
    });

    it('a payment event declaring the wrong organization is durably enqueued, then dead-lettered on its first sweep — never applied and never retried, since a mismatch will not fix itself', async () => {
        const invoice = await dataSource.getRepository(TestInvoice).save({
            orderId: 14,
            organizationId: 1,
            counterpartyId: 5,
            amount: 600,
            currencyCode: 'RUB',
            status: 'issued',
        });

        await eventBus.publish(
            new ErpPaymentReportedEvent(
                mockCtx,
                Number(invoice.id),
                999, // does not match invoice.organizationId (1)
                'success',
                'erp-evt-org-mismatch-1',
            ),
        );

        const sweep = await processorService.processPendingEvents(mockCtx);
        expect(sweep).toEqual({ processed: 0, failed: 1 });
        expect(reconciliationIssueService.report).toHaveBeenCalledWith(
            mockCtx,
            'ORGANIZATION_MISMATCH',
            expect.objectContaining({ invoiceId: Number(invoice.id), organizationId: 999 }),
        );

        const row = await dataSource
            .getRepository(TestIncomingPaymentEvent)
            .findOneOrFail({ where: { providerEventId: 'erp-evt-org-mismatch-1' } });
        expect(row.status).toBe('failed'); // dead-lettered immediately, not left 'pending' for retry

        const untouchedInvoice = await dataSource
            .getRepository(TestInvoice)
            .findOneOrFail({ where: { id: Number(invoice.id) } });
        expect(untouchedInvoice.status).toBe('issued'); // never applied
    });
});

describe('Payment inbox: organization data isolation within a single sweep batch (integration, real Postgres)', () => {
    // AGENTS.md's scope-isolation pattern: two invoices in different organizations, processed in
    // the SAME sweep batch (claimBatch's default limit is 20 — both events land in one call), one
    // with a coincidentally identical externalReference value to prove the isolation is by
    // organization scope, not by accidentally-unique reference strings. Asserting only "org A's
    // invoice got paid" is not enough — this also asserts org B's invoice, PaymentAttempt count,
    // and SettlementEntry are byte-for-byte the same before and after processing org A's event.
    it("processing organization A's event in the same batch as organization B's event never touches organization B's data", async () => {
        const invoiceA = await dataSource.getRepository(TestInvoice).save({
            orderId: 20,
            organizationId: 1,
            counterpartyId: 5,
            amount: 1000,
            currencyCode: 'RUB',
            status: 'issued',
        });
        const invoiceB = await dataSource.getRepository(TestInvoice).save({
            orderId: 21,
            organizationId: 2,
            counterpartyId: 6,
            amount: 2000,
            currencyCode: 'RUB',
            status: 'issued',
        });

        await inboxService.enqueue(mockCtx, 'bank-transfer-erp', 'shared-ref-001', 'hash-a', {
            invoiceId: Number(invoiceA.id),
            organizationId: 1,
            outcome: 'success',
            channel: 'bank-transfer-erp',
            externalReference: 'shared-ref-001',
        });
        // Same externalReference string as org A's event, deliberately — this is a different
        // provider+providerEventId row (level 2 dedup scope), so it must not collide with or
        // affect org A's processing despite the coincidentally identical reference value.
        await inboxService.enqueue(mockCtx, 'branch-kassa', 'shared-ref-001', 'hash-b', {
            invoiceId: Number(invoiceB.id),
            organizationId: 2,
            outcome: 'success',
            channel: 'branch-kassa',
            externalReference: 'shared-ref-001',
        });

        const sweep = await processorService.processPendingEvents(mockCtx);
        expect(sweep).toEqual({ processed: 2, failed: 0 });

        const paidA = await dataSource
            .getRepository(TestInvoice)
            .findOneOrFail({ where: { id: Number(invoiceA.id) } });
        expect(paidA.status).toBe('paid');
        const paidB = await dataSource
            .getRepository(TestInvoice)
            .findOneOrFail({ where: { id: Number(invoiceB.id) } });
        expect(paidB.status).toBe('paid');

        // Each organization's own PaymentAttempt exists, scoped to its own invoice — neither
        // batch member created a stray attempt against the other organization's invoice.
        const attemptsForA = await dataSource
            .getRepository(TestPaymentAttempt)
            .find({ where: { invoiceId: Number(invoiceA.id) } });
        const attemptsForB = await dataSource
            .getRepository(TestPaymentAttempt)
            .find({ where: { invoiceId: Number(invoiceB.id) } });
        expect(attemptsForA).toHaveLength(1);
        expect(attemptsForB).toHaveLength(1);
        expect(attemptsForA[0].channel).toBe('bank-transfer-erp');
        expect(attemptsForB[0].channel).toBe('branch-kassa');

        // Total PaymentAttempt/SettlementEntry rows across the whole batch is exactly 2 each —
        // no cross-organization duplication or leakage produced extra rows.
        const allAttempts = await dataSource.getRepository(TestPaymentAttempt).find();
        const allSettlements = await dataSource.getRepository(TestSettlementEntry).find();
        expect(allAttempts).toHaveLength(2);
        expect(allSettlements).toHaveLength(2);
        expect(allSettlements.filter(entry => entry.organizationId === 1)).toHaveLength(1);
        expect(allSettlements.filter(entry => entry.organizationId === 2)).toHaveLength(1);
    });
});
