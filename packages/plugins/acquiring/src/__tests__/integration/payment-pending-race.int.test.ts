import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, EntityManager, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ProformaInvoice } from '../../entities/proforma-invoice.entity';
import { PaymentAttempt } from '../../entities/payment-attempt.entity';
import { ProformaInvoiceService } from '../../proforma-invoice.service';
import { PaymentAttemptService } from '../../payment-attempt.service';
import { SettlementEntry } from '../../entities/settlement-entry.entity';
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
    @Column({ type: 'int', nullable: true }) sourceRefundId!: number | null;
    @Column({ type: 'int' }) amount!: number;
    @Column({ type: 'varchar' }) currencyCode!: string;
    @Column({ type: 'boolean', default: false }) reconciled!: boolean;
    @Column({ type: 'int', nullable: true }) allocatedOrderId!: number | null;
    @Column({ type: 'int', nullable: true }) allocationAmount!: number | null;
    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;
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
let service: PaymentAttemptService;
let beforeTransaction: () => Promise<void>;
const ctx = {} as RequestContext;

function mapEntity(
    entity: unknown,
): typeof TestProformaInvoice | typeof TestPaymentAttempt | typeof TestSettlementEntry {
    if (entity === ProformaInvoice) return TestProformaInvoice;
    if (entity === PaymentAttempt) return TestPaymentAttempt;
    if (entity === SettlementEntry) return TestSettlementEntry;
    throw new Error(`Unmapped entity: ${String(entity)}`);
}

const { schema, extra } = testSchemaOptions('payment_pending_race');

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
    const connection = {
        getRepository: (c: { __manager?: EntityManager }, entity: unknown) => {
            const manager = c.__manager ?? dataSource.manager;
            if (typeof entity === 'string') {
                return { query: (sql: string, params?: unknown[]) => manager.query(sql, params) };
            }
            return manager.getRepository(mapEntity(entity));
        },
        withTransaction: async <T>(c: RequestContext, work: (tx: RequestContext) => Promise<T>) => {
            if ((c as { __manager?: EntityManager }).__manager) return work(c);
            await beforeTransaction();
            return dataSource.transaction(manager => work({ ...c, __manager: manager } as never));
        },
    } as unknown as TransactionalConnection;
    const numbering = {
        next: async () => {
            return `n-${Math.random()}`;
        },
    };
    const proformaInvoiceService = new ProformaInvoiceService(connection);
    service = new PaymentAttemptService(
        connection,
        proformaInvoiceService,
        new SettlementEntryService(connection, proformaInvoiceService),
        { report: async () => ({ id: 1 }) } as never,
        numbering as never,
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
    beforeTransaction = async () => undefined;
});

describe('payProformaInvoice pending outcome (#197)', () => {
    async function seed(): Promise<TestProformaInvoice> {
        return dataSource.getRepository(TestProformaInvoice).save({
            orderId: 1,
            organizationId: 1,
            counterpartyId: 1,
            amount: 1000,
            currencyCode: 'USD',
            status: 'pending',
        });
    }

    it('does not regress a proforma invoice paid by a concurrent capture to issued', async () => {
        const invoice = await seed();
        // Second connection commits `paid` after the pending call's snapshot read, before its transaction.
        beforeTransaction = async () => {
            await dataSource.query(
                `UPDATE "${schema}".proforma_invoice SET status = 'paid' WHERE id = $1`,
                [invoice.id],
            );
        };

        await service.payProformaInvoice(ctx, invoice.id, 'pending', 'online-acquiring', 'ext-1');

        const stored = await dataSource
            .getRepository(TestProformaInvoice)
            .findOneByOrFail({ id: invoice.id });
        expect(stored.status).toBe('paid');
    });

    it('marks a still-pending proforma invoice issued', async () => {
        const invoice = await seed();

        await service.payProformaInvoice(ctx, invoice.id, 'pending', 'online-acquiring', 'ext-2');

        const stored = await dataSource
            .getRepository(TestProformaInvoice)
            .findOneByOrFail({ id: invoice.id });
        expect(stored.status).toBe('issued');
    });

    it('two concurrent captures on two documents of one counterparty both succeed without deadlock', async () => {
        const [first, second] = await dataSource.getRepository(TestProformaInvoice).save([
            {
                orderId: 1,
                organizationId: 1,
                counterpartyId: 1,
                amount: 1000,
                currencyCode: 'USD',
                status: 'issued',
            },
            {
                orderId: 2,
                organizationId: 1,
                counterpartyId: 1,
                amount: 1000,
                currencyCode: 'USD',
                status: 'issued',
            },
        ]);

        const results = await Promise.allSettled([
            service.payProformaInvoice(ctx, second.id, 'success', 'online-acquiring', 'cap-2'),
            service.payProformaInvoice(ctx, first.id, 'success', 'online-acquiring', 'cap-1'),
        ]);

        expect(results.map(r => r.status)).toEqual(['fulfilled', 'fulfilled']);
        const stored = await dataSource.getRepository(TestProformaInvoice).find();
        expect(stored.map(row => row.status)).toEqual(['paid', 'paid']);
    });
});

describe('payProformaInvoice repeat delivery with the same reference (#247)', () => {
    async function seedIssued(): Promise<TestProformaInvoice> {
        return dataSource.getRepository(TestProformaInvoice).save({
            orderId: 1,
            organizationId: 1,
            counterpartyId: 1,
            amount: 1000,
            currencyCode: 'USD',
            status: 'issued',
        });
    }

    async function stored(invoiceId: number) {
        const attempts = await dataSource.getRepository(TestPaymentAttempt).find();
        const entries = await dataSource.getRepository(TestSettlementEntry).find();
        const invoice = await dataSource
            .getRepository(TestProformaInvoice)
            .findOneByOrFail({ id: invoiceId });
        return { attempts, entries, invoice };
    }

    it('captures the existing pending attempt and allocates once', async () => {
        const invoice = await seedIssued();

        await service.payProformaInvoice(ctx, invoice.id, 'pending', 'online-acquiring', 'ref-1');
        await service.payProformaInvoice(ctx, invoice.id, 'success', 'online-acquiring', 'ref-1');
        await service.payProformaInvoice(ctx, invoice.id, 'success', 'online-acquiring', 'ref-1');

        const { attempts, entries, invoice: paid } = await stored(invoice.id);
        expect(attempts.map(a => a.paymentStatus)).toEqual(['captured']);
        expect(entries).toHaveLength(1);
        expect(entries[0].sourcePaymentId).toBe(attempts[0].id);
        expect(paid.status).toBe('paid');
    });

    it('two concurrent captured deliveries after pending allocate exactly once', async () => {
        const invoice = await seedIssued();
        await service.payProformaInvoice(ctx, invoice.id, 'pending', 'online-acquiring', 'ref-2');

        const results = await Promise.allSettled([
            service.payProformaInvoice(ctx, invoice.id, 'success', 'online-acquiring', 'ref-2'),
            service.payProformaInvoice(ctx, invoice.id, 'success', 'online-acquiring', 'ref-2'),
        ]);

        expect(results.map(r => r.status)).toEqual(['fulfilled', 'fulfilled']);
        const { attempts, entries } = await stored(invoice.id);
        expect(attempts.map(a => a.paymentStatus)).toEqual(['captured']);
        expect(entries).toHaveLength(1);
    });

    it('ignores a pending delivery that arrives after the capture', async () => {
        const invoice = await seedIssued();

        await service.payProformaInvoice(ctx, invoice.id, 'success', 'online-acquiring', 'ref-3');
        await service.payProformaInvoice(ctx, invoice.id, 'pending', 'online-acquiring', 'ref-3');

        const { attempts, entries, invoice: paid } = await stored(invoice.id);
        expect(attempts.map(a => a.paymentStatus)).toEqual(['captured']);
        expect(entries).toHaveLength(1);
        expect(paid.status).toBe('paid');
    });
});
