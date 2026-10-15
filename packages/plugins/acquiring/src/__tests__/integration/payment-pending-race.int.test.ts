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

@Entity('proforma_invoice')
class TestProformaInvoice {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) orderId!: number;
    @Column({ type: 'int' }) organizationId!: number;
    @Column({ type: 'int' }) counterpartyId!: number;
    @Column({ type: 'int' }) amount!: number;
    @Column({ type: 'varchar' }) currencyCode!: string;
    @Column({ type: 'varchar', default: 'pending' }) status!: string;
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
let insideTransaction: () => Promise<void>;
const ctx = {} as RequestContext;

function mapEntity(entity: unknown): typeof TestProformaInvoice | typeof TestPaymentAttempt {
    if (entity === ProformaInvoice) return TestProformaInvoice;
    if (entity === PaymentAttempt) return TestPaymentAttempt;
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
        entities: [TestProformaInvoice, TestPaymentAttempt],
        synchronize: true,
    });
    await dataSource.initialize();
    const connection = {
        getRepository: (c: { __manager?: EntityManager }, entity: unknown) =>
            (c.__manager ?? dataSource.manager).getRepository(mapEntity(entity)),
        withTransaction: <T>(c: RequestContext, work: (tx: RequestContext) => Promise<T>) =>
            dataSource.transaction(manager => work({ ...c, __manager: manager } as never)),
    } as unknown as TransactionalConnection;
    const numbering = {
        next: async () => {
            await insideTransaction();
            return `n-${Math.random()}`;
        },
    };
    service = new PaymentAttemptService(
        connection,
        new ProformaInvoiceService(connection),
        {} as never,
        { report: async () => ({ id: 1 }) } as never,
        numbering as never,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.getRepository(TestPaymentAttempt).clear();
    await dataSource.getRepository(TestProformaInvoice).clear();
    insideTransaction = async () => undefined;
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
        // Second connection commits `paid` after the pending call read `pending`, before its update.
        insideTransaction = async () => {
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
});
