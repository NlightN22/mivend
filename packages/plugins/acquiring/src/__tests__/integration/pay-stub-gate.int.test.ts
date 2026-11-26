import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { ProformaInvoiceShopResolver } from '../../proforma-invoice.resolver';
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
    @Column({ type: 'varchar', default: 'order' }) kind!: string;
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
let resolver: ProformaInvoiceShopResolver;
let beforeTransaction: () => Promise<void>;
let reportedIssues: string[] = [];
const ctx = { activeUserId: 7 } as unknown as RequestContext;

function mapEntity(
    entity: unknown,
): typeof TestProformaInvoice | typeof TestPaymentAttempt | typeof TestSettlementEntry {
    if (entity === ProformaInvoice) return TestProformaInvoice;
    if (entity === PaymentAttempt) return TestPaymentAttempt;
    if (entity === SettlementEntry) return TestSettlementEntry;
    throw new Error(`Unmapped entity: ${String(entity)}`);
}

const { schema, extra } = testSchemaOptions('pay_stub_gate');

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
        {
            report: async (_ctx: unknown, issueType: string) => {
                reportedIssues.push(issueType);
                return { id: 1 };
            },
        } as never,
        numbering as never,
    );
    resolver = new ProformaInvoiceShopResolver(
        proformaInvoiceService,
        { findOneByUserId: async () => ({ id: 1 }) } as never,
        { getForCustomer: async () => ({ id: 1 }) } as never,
        service,
        {} as never,
        {} as never,
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
    reportedIssues = [];
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('payProformaInvoice mutation gate (#407)', () => {
    async function seed(): Promise<TestProformaInvoice> {
        return dataSource.getRepository(TestProformaInvoice).save({
            orderId: 1,
            organizationId: 1,
            counterpartyId: 1,
            amount: 1000,
            currencyCode: 'USD',
            status: 'issued',
        });
    }

    it('production customer call changes nothing and records no payment attempt', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('ONLINE_PAYMENT_STUB_ENABLED', 'true');
        const invoice = await seed();

        await expect(
            resolver.payProformaInvoice(ctx, {
                proformaInvoiceId: String(invoice.id),
                status: 'success',
            }),
        ).rejects.toThrow();

        const stored = await dataSource
            .getRepository(TestProformaInvoice)
            .findOneByOrFail({ id: invoice.id });
        expect(stored.status).toBe('issued');
        expect(await dataSource.getRepository(TestPaymentAttempt).count()).toBe(0);
        expect(resolver.paymentStubAvailable()).toBe(false);
    });

    it('stays closed when the stub flag is off', async () => {
        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('ONLINE_PAYMENT_STUB_ENABLED', 'false');
        const invoice = await seed();

        await expect(
            resolver.payProformaInvoice(ctx, {
                proformaInvoiceId: String(invoice.id),
                status: 'success',
            }),
        ).rejects.toThrow();
        expect(await dataSource.getRepository(TestPaymentAttempt).count()).toBe(0);
    });

    it('marks the invoice paid where the stub is enabled', async () => {
        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('ONLINE_PAYMENT_STUB_ENABLED', 'true');
        const invoice = await seed();

        await resolver.payProformaInvoice(ctx, {
            proformaInvoiceId: String(invoice.id),
            status: 'success',
        });

        const stored = await dataSource
            .getRepository(TestProformaInvoice)
            .findOneByOrFail({ id: invoice.id });
        expect(stored.status).toBe('paid');
        expect(resolver.paymentStubAvailable()).toBe(true);
    });

    it('the service path used by the inbox stays open in production', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        const invoice = await seed();

        await service.payProformaInvoice(ctx, invoice.id, 'success', 'bank-transfer-erp', 'fact-1');
        await service.payProformaInvoice(ctx, invoice.id, 'success', 'bank-transfer-erp', 'fact-1');

        const stored = await dataSource
            .getRepository(TestProformaInvoice)
            .findOneByOrFail({ id: invoice.id });
        expect(stored.status).toBe('paid');
        expect(await dataSource.getRepository(TestPaymentAttempt).count()).toBe(1);
    });
});
