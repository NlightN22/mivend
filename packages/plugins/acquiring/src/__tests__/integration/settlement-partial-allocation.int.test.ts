import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    IsNull,
    Column,
    DataSource,
    Entity,
    EntityManager,
    Index,
    PrimaryGeneratedColumn,
} from 'typeorm';
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
let service: SettlementEntryService;

function mapEntity(
    entity: unknown,
): typeof TestProformaInvoice | typeof TestPaymentAttempt | typeof TestSettlementEntry {
    if (entity === ProformaInvoice) return TestProformaInvoice;
    if (entity === PaymentAttempt) return TestPaymentAttempt;
    if (entity === SettlementEntry) return TestSettlementEntry;
    throw new Error(`Unmapped entity: ${String(entity)}`);
}

const { schema, extra } = testSchemaOptions('settlement_partial_race');

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
        getRepository: (c: { __manager?: EntityManager }, entity: unknown) =>
            (c.__manager ?? dataSource.manager).getRepository(mapEntity(entity)),
    } as unknown as TransactionalConnection;
    service = new SettlementEntryService(connection, new ProformaInvoiceService(connection));
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.getRepository(TestSettlementEntry).clear();
    await dataSource.getRepository(TestProformaInvoice).clear();
});

function capture(proformaInvoiceId: number, id: number, amount: number): Promise<unknown> {
    return dataSource.transaction(manager =>
        service.allocate(
            { __manager: manager } as unknown as RequestContext,
            {
                id,
                proformaInvoiceId,
                amount,
                currencyCode: 'USD',
            } as PaymentAttempt,
        ),
    );
}

describe('SettlementEntryService.allocate partial payments (audit 27)', () => {
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

    async function allocatedTo(invoiceId: number): Promise<number> {
        const rows = await dataSource
            .getRepository(TestSettlementEntry)
            .find({ where: { proformaInvoiceId: invoiceId } });
        return rows.reduce((sum, row) => sum + (row.allocationAmount ?? 0), 0);
    }

    it('a second partial payment only covers what the first left owed', async () => {
        const invoice = await seed();
        await capture(invoice.id, 1, 600);
        await capture(invoice.id, 2, 600);

        expect(await allocatedTo(invoice.id)).toBe(1000);
        const advance = await dataSource
            .getRepository(TestSettlementEntry)
            .findOneByOrFail({ proformaInvoiceId: IsNull() });
        expect(advance.amount).toBe(200);
    });

    it('two concurrent partial payments never allocate more than the proforma invoice amount', async () => {
        const invoice = await seed();
        const results = await Promise.allSettled([
            capture(invoice.id, 1, 600),
            capture(invoice.id, 2, 600),
        ]);

        expect(results.map(r => r.status)).toEqual(['fulfilled', 'fulfilled']);
        expect(await allocatedTo(invoice.id)).toBe(1000);
        const stored = await dataSource
            .getRepository(TestProformaInvoice)
            .findOneByOrFail({ id: invoice.id });
        expect(stored.status).toBe('paid');
        const entries = await dataSource.getRepository(TestSettlementEntry).find();
        expect(entries.reduce((sum, e) => sum + e.amount, 0)).toBe(1200);
    });
});
