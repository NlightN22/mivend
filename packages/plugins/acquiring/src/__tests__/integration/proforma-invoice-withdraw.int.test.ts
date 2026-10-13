import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, EntityManager, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { PaymentAttempt } from '../../entities/payment-attempt.entity';
import { ProformaInvoice } from '../../entities/proforma-invoice.entity';
import { SettlementEntry } from '../../entities/settlement-entry.entity';
import { ProformaInvoiceWithdrawService } from '../../proforma-invoice-withdraw.service';

@Entity('proforma_invoice')
class TestProformaInvoice {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) orderId!: number;
    @Column({ type: 'varchar', default: 'pending' }) status!: string;
    @Column({ type: 'int', nullable: true }) supersededById!: number | null;
    @Column({ type: 'timestamptz', nullable: true }) withdrawnAt!: Date | null;
    @Column({ type: 'varchar', nullable: true }) withdrawnByAdministratorId!: string | null;
}

@Entity('settlement_entry')
class TestSettlementEntry {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int', nullable: true }) proformaInvoiceId!: number | null;
    @Column({ type: 'int' }) amount!: number;
}

@Entity('payment_attempt')
class TestPaymentAttempt {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int', nullable: true }) proformaInvoiceId!: number | null;
    @Column({ type: 'varchar' }) status!: string;
}

let dataSource: DataSource;
let service: ProformaInvoiceWithdrawService;
const { schema, extra } = testSchemaOptions('proformaInvoice_withdraw');
const ctx = {} as RequestContext;

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
    const mirrors = new Map<unknown, unknown>([
        [ProformaInvoice, TestProformaInvoice],
        [SettlementEntry, TestSettlementEntry],
        [PaymentAttempt, TestPaymentAttempt],
    ]);
    const connection = {
        getRepository: (c: RequestContext, entity: unknown) => {
            const manager = (c as unknown as { __manager?: EntityManager }).__manager;
            if (typeof entity === 'string') {
                return { query: (sql: string, params?: unknown[]) => manager!.query(sql, params) };
            }
            return (manager ?? dataSource).getRepository(mirrors.get(entity) as never);
        },
        withTransaction: async (c: RequestContext, work: (x: RequestContext) => Promise<unknown>) =>
            dataSource.transaction(manager =>
                work({ ...c, __manager: manager } as unknown as RequestContext),
            ),
    } as unknown as TransactionalConnection;
    service = new ProformaInvoiceWithdrawService(connection);
});

beforeEach(async () => {
    await dataSource.query('TRUNCATE "proforma_invoice", "settlement_entry", "payment_attempt"');
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const addInvoice = async (status = 'issued') =>
    (await dataSource.getRepository(TestProformaInvoice).save({ orderId: 7, status })).id;

describe('ProformaInvoiceWithdrawService (real Postgres)', () => {
    it('cancels an unpaid current version and records who and when; a repeat is a no-op', async () => {
        const id = await addInvoice();
        const first = await service.withdraw(ctx, id, 'admin-1');
        const second = await service.withdraw(ctx, id, 'admin-2');

        expect(first.status).toBe('cancelled');
        expect(second.withdrawnByAdministratorId).toBe('admin-1');
        expect(second.withdrawnAt).toEqual(first.withdrawnAt);
        expect(first.withdrawnAt).toBeInstanceOf(Date);
    });

    it('refuses a version that has a settlement allocation even when its status is not paid', async () => {
        const id = await addInvoice('issued');
        await dataSource
            .getRepository(TestSettlementEntry)
            .save({ proformaInvoiceId: id, amount: 100 });

        await expect(service.withdraw(ctx, id, 'admin-1')).rejects.toThrow('recorded payment');
        const row = await dataSource.getRepository(TestProformaInvoice).findOneByOrFail({ id });
        expect(row.status).toBe('issued');
    });

    it('refuses a version that has an active payment attempt', async () => {
        const id = await addInvoice('issued');
        await dataSource
            .getRepository(TestPaymentAttempt)
            .save({ proformaInvoiceId: id, status: 'pending' });

        await expect(service.withdraw(ctx, id, 'admin-1')).rejects.toThrow('payment in progress');
    });

    it('ignores finished attempts and allocations of another version', async () => {
        const id = await addInvoice('issued');
        const other = await addInvoice('issued');
        await dataSource
            .getRepository(TestPaymentAttempt)
            .save({ proformaInvoiceId: id, status: 'failed' });
        await dataSource
            .getRepository(TestSettlementEntry)
            .save({ proformaInvoiceId: other, amount: 50 });

        expect((await service.withdraw(ctx, id, null)).status).toBe('cancelled');
    });

    it('refuses a superseded version', async () => {
        const id = await addInvoice('superseded');
        await expect(service.withdraw(ctx, id, null)).rejects.toThrow('current version');
    });
});
