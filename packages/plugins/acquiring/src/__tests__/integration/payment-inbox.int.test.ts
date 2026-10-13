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
import { ProformaInvoice } from '../../entities/proforma-invoice.entity';
import { PaymentAttempt } from '../../entities/payment-attempt.entity';
import { SettlementEntry } from '../../entities/settlement-entry.entity';
import { InboxService } from '../../inbox.service';
import { ProformaInvoiceService } from '../../proforma-invoice.service';
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
@Entity('proforma_invoice')
@Index(['counterpartyId', 'organizationId', 'status'])
class TestProformaInvoice {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'uuid', default: () => 'gen_random_uuid()' }) uuid!: string;
    @Column({ type: 'varchar', default: '1000-01' }) number!: string;
    @Column({ type: 'int' }) orderId!: number;
    @Column({ type: 'int' }) organizationId!: number;
    @Column({ type: 'int' }) counterpartyId!: number;
    @Column({ type: 'int' }) amount!: number;
    @Column({ type: 'varchar' }) currencyCode!: string;
    @Column({ type: 'varchar', default: 'pending' }) status!: string;
    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;
    @Column({ type: 'int', nullable: true }) supersededById!: number | null;
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
let proformaInvoiceService: ProformaInvoiceService;
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
    | typeof TestProformaInvoice
    | typeof TestPaymentAttempt
    | typeof TestSettlementEntry
    | typeof TestIncomingPaymentEvent {
    if (entity === ProformaInvoice) return TestProformaInvoice;
    if (entity === PaymentAttempt) return TestPaymentAttempt;
    if (entity === SettlementEntry) return TestSettlementEntry;
    if (entity === IncomingPaymentEvent) return TestIncomingPaymentEvent;
    throw new Error(`Unmapped entity in test connection shim: ${String(entity)}`);
}

interface TxCtx {
    __manager?: import('typeorm').EntityManager;
}

// Forces processPendingEvents' underlying payProformaInvoice call to fail on its Nth SettlementEntry
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
        entities: [
            TestProformaInvoice,
            TestPaymentAttempt,
            TestSettlementEntry,
            TestIncomingPaymentEvent,
        ],
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
    reconciliationIssueService = createMockReconciliationIssueService();
    paymentAttemptService = new PaymentAttemptService(
        connectionShim,
        proformaInvoiceService,
        settlementEntryService,
        reconciliationIssueService as never,
        numberingServiceShim,
    );
    inboxService = new InboxService(connectionShim);
    processorService = new PaymentInboxProcessorService(
        inboxService,
        paymentAttemptService,
        proformaInvoiceService,
    );
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
    await dataSource.getRepository(TestProformaInvoice).clear();
});

afterEach(() => {
    clearForcedFailure();
});

describe('Payment inbox: webhook/ERP event arrives once, processing recovers on its own (integration, real Postgres)', () => {
    it('an event that fails to process on the first sweep is retried and completes correctly on the next sweep — nothing is lost', async () => {
        const proformaInvoice = await dataSource.getRepository(TestProformaInvoice).save({
            orderId: 1,
            organizationId: 1,
            counterpartyId: 5,
            amount: 1000,
            currencyCode: 'RUB',
            status: 'issued',
        });

        // The event arrives exactly once — e.g. the ERP exchange reports a bank transfer for
        // this proforma invoice. enqueue() durably records it before any processing is attempted.
        const enqueued = await inboxService.enqueue(
            mockCtx,
            'bank-transfer-erp',
            'erp-evt-1',
            'hash-1',
            {
                proformaInvoiceId: Number(proformaInvoice.id),
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

        // The proforma invoice must NOT be paid yet — the failed attempt rolled back completely (same
        // transactional guarantee verified in payment-atomicity.int.test.ts).
        const afterFirstSweep = await dataSource
            .getRepository(TestProformaInvoice)
            .findOneOrFail({ where: { id: Number(proformaInvoice.id) } });
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
            .getRepository(TestProformaInvoice)
            .findOneOrFail({ where: { id: Number(proformaInvoice.id) } });
        expect(afterSecondSweep.status).toBe('paid');

        const eventAfterSuccess = await dataSource
            .getRepository(TestIncomingPaymentEvent)
            .findOneOrFail({ where: { providerEventId: 'erp-evt-1' } });
        expect(eventAfterSuccess.status).toBe('processed');
        expect(eventAfterSuccess.processedAt).not.toBeNull();

        const paymentAttempts = await dataSource
            .getRepository(TestPaymentAttempt)
            .find({ where: { proformaInvoiceId: Number(proformaInvoice.id) } });
        expect(paymentAttempts).toHaveLength(1); // exactly one — the failed attempt left nothing behind
    });

    it('redelivery of the same event (provider retries because it never saw our ack) is a safe no-op, not a duplicate payment', async () => {
        const proformaInvoice = await dataSource.getRepository(TestProformaInvoice).save({
            orderId: 2,
            organizationId: 1,
            counterpartyId: 5,
            amount: 500,
            currencyCode: 'RUB',
            status: 'issued',
        });
        const payload = {
            proformaInvoiceId: Number(proformaInvoice.id),
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
            .find({ where: { proformaInvoiceId: Number(proformaInvoice.id) } });
        expect(paymentAttempts).toHaveLength(1); // not doubled by the redelivery
    });

    it('an event that keeps failing is dead-lettered after the retry limit, instead of being retried forever', async () => {
        const proformaInvoice = await dataSource.getRepository(TestProformaInvoice).save({
            orderId: 3,
            organizationId: 1,
            counterpartyId: 5,
            amount: 700,
            currencyCode: 'RUB',
            status: 'issued',
        });
        await inboxService.enqueue(mockCtx, 'bank-transfer-erp', 'erp-evt-3', 'hash-3', {
            proformaInvoiceId: Number(proformaInvoice.id),
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
    it('a simulated ERP-reported bank transfer (ErpPaymentReportedEvent) is durably enqueued and eventually pays the proforma invoice', async () => {
        const proformaInvoice = await dataSource.getRepository(TestProformaInvoice).save({
            orderId: 10,
            organizationId: 1,
            counterpartyId: 5,
            amount: 1200,
            currencyCode: 'RUB',
            status: 'issued',
        });

        await eventBus.publish(
            new ErpPaymentReportedEvent(mockCtx, {
                proformaInvoiceUuid: proformaInvoice.uuid,
                organizationId: 1,
                outcome: 'success',
                erpEventId: 'erp-evt-simulated-1',
                amount: proformaInvoice.amount,
                currencyCode: 'RUB',
                proformaInvoiceNumber: proformaInvoice.number,
            }),
        );

        const enqueuedRow = await dataSource
            .getRepository(TestIncomingPaymentEvent)
            .findOneOrFail({ where: { providerEventId: 'erp-evt-simulated-1' } });
        expect(enqueuedRow.provider).toBe('erp');
        expect(enqueuedRow.status).toBe('pending');
        expect(JSON.parse(enqueuedRow.payload)).toEqual({
            amount: proformaInvoice.amount,
            currencyCode: 'RUB',
            proformaInvoiceUuid: proformaInvoice.uuid,
            proformaInvoiceNumber: proformaInvoice.number,
            organizationId: 1,
            outcome: 'success',
            channel: 'bank-transfer-erp',
            externalReference: 'erp-evt-simulated-1',
        });

        const sweep = await processorService.processPendingEvents(mockCtx);
        expect(sweep).toEqual({ processed: 1, failed: 0 });

        const paidProformaInvoice = await dataSource
            .getRepository(TestProformaInvoice)
            .findOneOrFail({ where: { id: Number(proformaInvoice.id) } });
        expect(paidProformaInvoice.status).toBe('paid');

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

    it('a simulated branch-kassa cash payment (BranchKassaPaymentEvent) is durably enqueued and eventually pays the proforma invoice', async () => {
        const proformaInvoice = await dataSource.getRepository(TestProformaInvoice).save({
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
                Number(proformaInvoice.id),
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

        const paidProformaInvoice = await dataSource
            .getRepository(TestProformaInvoice)
            .findOneOrFail({ where: { id: Number(proformaInvoice.id) } });
        expect(paidProformaInvoice.status).toBe('paid');
    });

    it('redelivery of the same ERP event through the EventBus again does not enqueue a duplicate row', async () => {
        const proformaInvoice = await dataSource.getRepository(TestProformaInvoice).save({
            orderId: 12,
            organizationId: 1,
            counterpartyId: 5,
            amount: 300,
            currencyCode: 'RUB',
            status: 'issued',
        });

        const event = new ErpPaymentReportedEvent(mockCtx, {
            proformaInvoiceUuid: proformaInvoice.uuid,
            organizationId: 1,
            outcome: 'success',
            erpEventId: 'erp-evt-dup-1',
            amount: proformaInvoice.amount,
            currencyCode: 'RUB',
        });
        await eventBus.publish(event);
        await eventBus.publish(event);

        const rows = await dataSource
            .getRepository(TestIncomingPaymentEvent)
            .find({ where: { providerEventId: 'erp-evt-dup-1' } });
        expect(rows).toHaveLength(1);

        expect(await processorService.processPendingEvents(mockCtx)).toEqual({
            processed: 1,
            failed: 0,
        });
        await eventBus.publish(event);
        expect(await processorService.processPendingEvents(mockCtx)).toEqual({
            processed: 0,
            failed: 0,
        });
        const attempts = await dataSource.getRepository(TestPaymentAttempt).find();
        expect(attempts).toHaveLength(1);
    });

    it('a branch-kassa payment fact with no RRN/kassa receipt is durably recorded but immediately dead-lettered — never silently processed without its mandatory reconciliation reference', async () => {
        const proformaInvoice = await dataSource.getRepository(TestProformaInvoice).save({
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
                Number(proformaInvoice.id),
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

        const untouchedProformaInvoice = await dataSource
            .getRepository(TestProformaInvoice)
            .findOneOrFail({ where: { id: Number(proformaInvoice.id) } });
        expect(untouchedProformaInvoice.status).toBe('issued');
    });

    it('a payment event declaring the wrong organization is durably enqueued, then dead-lettered on its first sweep — never applied and never retried, since a mismatch will not fix itself', async () => {
        const proformaInvoice = await dataSource.getRepository(TestProformaInvoice).save({
            orderId: 14,
            organizationId: 1,
            counterpartyId: 5,
            amount: 600,
            currencyCode: 'RUB',
            status: 'issued',
        });

        await eventBus.publish(
            new ErpPaymentReportedEvent(mockCtx, {
                proformaInvoiceUuid: proformaInvoice.uuid,
                organizationId: 999,
                outcome: 'success',
                erpEventId: 'erp-evt-org-mismatch-1',
                amount: proformaInvoice.amount,
                currencyCode: 'RUB',
            }),
        );

        const sweep = await processorService.processPendingEvents(mockCtx);
        expect(sweep).toEqual({ processed: 0, failed: 1 });
        expect(reconciliationIssueService.report).toHaveBeenCalledWith(
            mockCtx,
            'ORGANIZATION_MISMATCH',
            expect.objectContaining({
                proformaInvoiceId: Number(proformaInvoice.id),
                organizationId: 999,
            }),
        );

        const row = await dataSource
            .getRepository(TestIncomingPaymentEvent)
            .findOneOrFail({ where: { providerEventId: 'erp-evt-org-mismatch-1' } });
        expect(row.status).toBe('failed'); // dead-lettered immediately, not left 'pending' for retry

        const untouchedProformaInvoice = await dataSource
            .getRepository(TestProformaInvoice)
            .findOneOrFail({ where: { id: Number(proformaInvoice.id) } });
        expect(untouchedProformaInvoice.status).toBe('issued'); // never applied
    });

    it('an ERP payment fact whose declared document number does not match the document is dead-lettered and never applied', async () => {
        const proformaInvoice = await dataSource.getRepository(TestProformaInvoice).save({
            orderId: 15,
            organizationId: 1,
            counterpartyId: 5,
            amount: 600,
            currencyCode: 'RUB',
            status: 'issued',
            number: '2000-01',
        });

        await eventBus.publish(
            new ErpPaymentReportedEvent(mockCtx, {
                proformaInvoiceUuid: proformaInvoice.uuid,
                organizationId: 1,
                outcome: 'success',
                erpEventId: 'erp-evt-number-mismatch-1',
                amount: proformaInvoice.amount,
                currencyCode: 'RUB',
                proformaInvoiceNumber: '2000-02',
            }),
        );

        expect(await processorService.processPendingEvents(mockCtx)).toEqual({
            processed: 0,
            failed: 1,
        });
        const row = await dataSource
            .getRepository(TestIncomingPaymentEvent)
            .findOneOrFail({ where: { providerEventId: 'erp-evt-number-mismatch-1' } });
        expect(row.status).toBe('failed');
        expect(row.lastError).toContain('2000-01');
        const unchanged = await dataSource
            .getRepository(TestProformaInvoice)
            .findOneOrFail({ where: { id: Number(proformaInvoice.id) } });
        expect(unchanged.status).toBe('issued');
    });

    it('an ERP payment fact naming an unknown proforma invoice uuid is retried, then dead-lettered once the budget is exhausted', async () => {
        await eventBus.publish(
            new ErpPaymentReportedEvent(mockCtx, {
                proformaInvoiceUuid: '00000000-0000-4000-8000-000000000000',
                organizationId: 1,
                outcome: 'success',
                erpEventId: 'erp-evt-unknown-uuid-1',
                amount: 600,
                currencyCode: 'RUB',
            }),
        );
        const findRow = () =>
            dataSource
                .getRepository(TestIncomingPaymentEvent)
                .findOneOrFail({ where: { providerEventId: 'erp-evt-unknown-uuid-1' } });

        await processorService.processPendingEvents(mockCtx);
        const afterFirst = await findRow();
        expect(afterFirst.status).toBe('pending');
        expect(afterFirst.attempts).toBe(1);

        for (let i = 0; i < 4; i++) await processorService.processPendingEvents(mockCtx);
        const exhausted = await findRow();
        expect(exhausted.status).toBe('failed');
        expect(exhausted.lastError).toContain('not found on this instance');
    });

    it('a payment fact that arrives before its proforma invoice is applied once the document exists', async () => {
        const uuid = '11111111-1111-4111-8111-111111111111';
        await eventBus.publish(
            new ErpPaymentReportedEvent(mockCtx, {
                proformaInvoiceUuid: uuid,
                organizationId: 1,
                outcome: 'success',
                erpEventId: 'erp-evt-early-1',
                amount: 600,
                currencyCode: 'RUB',
            }),
        );
        await processorService.processPendingEvents(mockCtx);

        await dataSource.getRepository(TestProformaInvoice).save({
            uuid,
            orderId: 16,
            organizationId: 1,
            counterpartyId: 5,
            amount: 600,
            currencyCode: 'RUB',
            status: 'issued',
            number: '001234-01',
        });
        expect(await processorService.processPendingEvents(mockCtx)).toEqual({
            processed: 1,
            failed: 0,
        });
    });

    it('the displayed document number (instance code with a hyphen) matches the stored one', async () => {
        const proformaInvoice = await dataSource.getRepository(TestProformaInvoice).save({
            orderId: 17,
            organizationId: 1,
            counterpartyId: 5,
            amount: 600,
            currencyCode: 'RUB',
            status: 'issued',
            number: '001234-01',
        });
        await eventBus.publish(
            new ErpPaymentReportedEvent(mockCtx, {
                proformaInvoiceUuid: proformaInvoice.uuid,
                organizationId: 1,
                outcome: 'success',
                erpEventId: 'erp-evt-display-number-1',
                amount: proformaInvoice.amount,
                currencyCode: 'RUB',
                proformaInvoiceNumber: '001-234-01',
            }),
        );
        expect(await processorService.processPendingEvents(mockCtx)).toEqual({
            processed: 1,
            failed: 0,
        });
    });
});

describe('Payment inbox: declared number vs versioned proforma number (integration, real Postgres)', () => {
    const cases: [string, string, string][] = [
        ['full versioned number', '3000-01-2', '3000-01-2'],
        ['stable document part (pre-versioning fact)', '3000-01-2', '3000-01'],
    ];
    it.each(cases)('accepts the %s', async (_label, stored, declared) => {
        const proformaInvoice = await dataSource.getRepository(TestProformaInvoice).save({
            orderId: 30,
            organizationId: 1,
            counterpartyId: 5,
            amount: 600,
            currencyCode: 'RUB',
            status: 'issued',
            number: stored,
        });
        await eventBus.publish(
            new ErpPaymentReportedEvent(mockCtx, {
                proformaInvoiceUuid: proformaInvoice.uuid,
                organizationId: 1,
                outcome: 'success',
                erpEventId: `erp-evt-versioned-${declared}`,
                amount: proformaInvoice.amount,
                currencyCode: 'RUB',
                proformaInvoiceNumber: declared,
            }),
        );
        expect(await processorService.processPendingEvents(mockCtx)).toEqual({
            processed: 1,
            failed: 0,
        });
    });

    it('rejects a number that matches neither the versioned nor the document part', async () => {
        const proformaInvoice = await dataSource.getRepository(TestProformaInvoice).save({
            orderId: 31,
            organizationId: 1,
            counterpartyId: 5,
            amount: 600,
            currencyCode: 'RUB',
            status: 'issued',
            number: '3100-01-2',
        });
        await eventBus.publish(
            new ErpPaymentReportedEvent(mockCtx, {
                proformaInvoiceUuid: proformaInvoice.uuid,
                organizationId: 1,
                outcome: 'success',
                erpEventId: 'erp-evt-versioned-bad',
                amount: proformaInvoice.amount,
                currencyCode: 'RUB',
                proformaInvoiceNumber: '3100-02',
            }),
        );
        expect(await processorService.processPendingEvents(mockCtx)).toEqual({
            processed: 0,
            failed: 1,
        });
    });
});

describe('Payment inbox: organization data isolation within a single sweep batch (integration, real Postgres)', () => {
    // AGENTS.md's scope-isolation pattern: two proforma invoices in different organizations, processed in
    // the SAME sweep batch (claimBatch's default limit is 20 — both events land in one call), one
    // with a coincidentally identical externalReference value to prove the isolation is by
    // organization scope, not by accidentally-unique reference strings. Asserting only "org A's
    // proforma invoice got paid" is not enough — this also asserts org B's proforma invoice, PaymentAttempt count,
    // and SettlementEntry are byte-for-byte the same before and after processing org A's event.
    it("processing organization A's event in the same batch as organization B's event never touches organization B's data", async () => {
        const proformaInvoiceA = await dataSource.getRepository(TestProformaInvoice).save({
            orderId: 20,
            organizationId: 1,
            counterpartyId: 5,
            amount: 1000,
            currencyCode: 'RUB',
            status: 'issued',
        });
        const proformaInvoiceB = await dataSource.getRepository(TestProformaInvoice).save({
            orderId: 21,
            organizationId: 2,
            counterpartyId: 6,
            amount: 2000,
            currencyCode: 'RUB',
            status: 'issued',
        });

        await inboxService.enqueue(mockCtx, 'bank-transfer-erp', 'shared-ref-001', 'hash-a', {
            proformaInvoiceId: Number(proformaInvoiceA.id),
            organizationId: 1,
            outcome: 'success',
            channel: 'bank-transfer-erp',
            externalReference: 'shared-ref-001',
        });
        // Same externalReference string as org A's event, deliberately — this is a different
        // provider+providerEventId row (level 2 dedup scope), so it must not collide with or
        // affect org A's processing despite the coincidentally identical reference value.
        await inboxService.enqueue(mockCtx, 'branch-kassa', 'shared-ref-001', 'hash-b', {
            proformaInvoiceId: Number(proformaInvoiceB.id),
            organizationId: 2,
            outcome: 'success',
            channel: 'branch-kassa',
            externalReference: 'shared-ref-001',
        });

        const sweep = await processorService.processPendingEvents(mockCtx);
        expect(sweep).toEqual({ processed: 2, failed: 0 });

        const paidA = await dataSource
            .getRepository(TestProformaInvoice)
            .findOneOrFail({ where: { id: Number(proformaInvoiceA.id) } });
        expect(paidA.status).toBe('paid');
        const paidB = await dataSource
            .getRepository(TestProformaInvoice)
            .findOneOrFail({ where: { id: Number(proformaInvoiceB.id) } });
        expect(paidB.status).toBe('paid');

        // Each organization's own PaymentAttempt exists, scoped to its own proforma invoice — neither
        // batch member created a stray attempt against the other organization's proforma invoice.
        const attemptsForA = await dataSource
            .getRepository(TestPaymentAttempt)
            .find({ where: { proformaInvoiceId: Number(proformaInvoiceA.id) } });
        const attemptsForB = await dataSource
            .getRepository(TestPaymentAttempt)
            .find({ where: { proformaInvoiceId: Number(proformaInvoiceB.id) } });
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

describe('Payment fact for a superseded or already paid document (integration, real Postgres, docs/payments.md cash application)', () => {
    const invoices = (): ReturnType<DataSource['getRepository']> =>
        dataSource.getRepository(TestProformaInvoice);
    const enqueueFact = (id: number, ref: string): Promise<unknown> =>
        inboxService.enqueue(mockCtx, 'bank-transfer-erp', ref, `hash-${ref}`, {
            proformaInvoiceId: id,
            organizationId: 1,
            outcome: 'success',
            channel: 'bank-transfer-erp',
            externalReference: ref,
        });

    it('a fact for a superseded version settles the current version of the chain and the event is processed', async () => {
        const head = await invoices().save({
            orderId: 1,
            organizationId: 1,
            counterpartyId: 5,
            amount: 1000,
            currencyCode: 'RUB',
            status: 'issued',
        });
        const old = await invoices().save({
            orderId: 1,
            organizationId: 1,
            counterpartyId: 5,
            amount: 1000,
            currencyCode: 'RUB',
            status: 'superseded',
            supersededById: head.id,
        });

        await enqueueFact(Number(old.id), 'erp-sup-1');
        expect(await processorService.processPendingEvents(mockCtx)).toEqual({
            processed: 1,
            failed: 0,
        });

        expect((await invoices().findOneByOrFail({ id: head.id })).status).toBe('paid');
        const entries = await dataSource.getRepository(TestSettlementEntry).find();
        expect(entries.map(e => e.proformaInvoiceId)).toEqual([head.id]);
    });

    it('a second fact (new event id) for an already paid document is FIFO-allocated to the next open document', async () => {
        const paid = await invoices().save({
            orderId: 1,
            organizationId: 1,
            counterpartyId: 5,
            amount: 1000,
            currencyCode: 'RUB',
            status: 'paid',
        });
        const next = await invoices().save({
            orderId: 2,
            organizationId: 1,
            counterpartyId: 5,
            amount: 1000,
            currencyCode: 'RUB',
            status: 'issued',
        });

        await enqueueFact(Number(paid.id), 'erp-dup-1');
        await processorService.processPendingEvents(mockCtx);

        expect((await invoices().findOneByOrFail({ id: next.id })).status).toBe('paid');
    });
});

describe('Payment document amount and unreferenced facts (integration, real Postgres)', () => {
    const invoices = (): ReturnType<DataSource['getRepository']> =>
        dataSource.getRepository(TestProformaInvoice);
    const fact = (over: Record<string, unknown>): ErpPaymentReportedEvent =>
        new ErpPaymentReportedEvent(mockCtx, {
            organizationId: 1,
            outcome: 'success',
            currencyCode: 'RUB',
            amount: 0,
            erpEventId: 'x',
            ...over,
        } as never);
    const open = (over: Record<string, unknown>) =>
        invoices().save({
            orderId: 1,
            organizationId: 1,
            counterpartyId: 5,
            amount: 1000,
            currencyCode: 'RUB',
            status: 'issued',
            ...over,
        });
    const statusOf = async (id: number): Promise<string> =>
        (await invoices().findOneByOrFail({ id })).status;

    it('allocates the payment amount, not the document amount: a partial payment leaves the document open', async () => {
        const doc = await open({});
        await eventBus.publish(
            fact({ proformaInvoiceUuid: doc.uuid, erpEventId: 'amt-1', amount: 400 }),
        );
        await processorService.processPendingEvents(mockCtx);

        expect(await statusOf(doc.id)).toBe('issued');
        const entries = await dataSource.getRepository(TestSettlementEntry).find();
        expect(entries.map(e => e.amount)).toEqual([400]);
        const attempt = await dataSource.getRepository(TestPaymentAttempt).findOneByOrFail({
            providerPaymentId: 'amt-1',
        });
        expect(attempt.amount).toBe(400);

        await eventBus.publish(
            fact({ proformaInvoiceUuid: doc.uuid, erpEventId: 'amt-2', amount: 600 }),
        );
        await processorService.processPendingEvents(mockCtx);
        expect(await statusOf(doc.id)).toBe('paid');
    });

    it('a payment above the document amount flows FIFO to the next open document, the rest is an advance', async () => {
        const first = await open({ orderId: 1 });
        const second = await open({ orderId: 2, amount: 500 });
        await eventBus.publish(
            fact({ proformaInvoiceUuid: first.uuid, erpEventId: 'amt-3', amount: 2000 }),
        );
        await processorService.processPendingEvents(mockCtx);

        expect(await statusOf(first.id)).toBe('paid');
        expect(await statusOf(second.id)).toBe('paid');
        const entries = await dataSource
            .getRepository(TestSettlementEntry)
            .find({ order: { id: 'ASC' } });
        expect(entries.map(e => [e.proformaInvoiceId, e.amount])).toEqual([
            [first.id, 1000],
            [second.id, 500],
            [null, 500],
        ]);
    });

    it('a currency different from the document is dead-lettered and recorded as an issue', async () => {
        const doc = await open({});
        await eventBus.publish(
            fact({
                proformaInvoiceUuid: doc.uuid,
                erpEventId: 'cur-1',
                currencyCode: 'USD',
                amount: 1000,
            }),
        );
        expect(await processorService.processPendingEvents(mockCtx)).toEqual({
            processed: 0,
            failed: 1,
        });

        expect(await statusOf(doc.id)).toBe('issued');
        expect(reconciliationIssueService.report).toHaveBeenCalledWith(
            mockCtx,
            'CURRENCY_MISMATCH',
            expect.objectContaining({ providerPaymentId: 'cur-1' }),
        );
        const row = await dataSource
            .getRepository(TestIncomingPaymentEvent)
            .findOneByOrFail({ providerEventId: 'cur-1' });
        expect(row.status).toBe('failed');
    });
});
