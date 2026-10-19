import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';
import { ProformaInvoiceService } from '../../proforma-invoice.service';

// VendureEntity needs a bootstrapped EntityIdStrategy, so the test uses a plain TypeORM entity
// mirroring the production table schema against real Postgres, not the ProformaInvoice class.
@Entity('proforma_invoice')
@Index(['counterpartyId'])
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

let dataSource: DataSource;
let service: ProformaInvoiceService;
const mockCtx = {} as RequestContext;
const { schema, extra } = testSchemaOptions('proformaInvoice_service');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestProformaInvoice],
        synchronize: true,
    });
    await dataSource.initialize();

    const connectionShim = {
        getRepository: () => dataSource.getRepository(TestProformaInvoice),
    } as unknown as TransactionalConnection;

    service = new ProformaInvoiceService(connectionShim);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.getRepository(TestProformaInvoice).clear();
});

describe('ProformaInvoiceService.findForCounterparty (integration, real Postgres)', () => {
    it('only returns proforma invoices for that counterparty (no cross-tenant leak)', async () => {
        await dataSource.getRepository(TestProformaInvoice).save([
            { orderId: 1, organizationId: 1, counterpartyId: 1, amount: 1000, currencyCode: 'RUB' },
            { orderId: 2, organizationId: 1, counterpartyId: 1, amount: 500, currencyCode: 'RUB' },
            { orderId: 3, organizationId: 1, counterpartyId: 2, amount: 999, currencyCode: 'RUB' },
        ]);

        const result = await service.findForCounterparty(mockCtx, 1);

        expect(result.totalItems).toBe(2);
        expect(result.items.every(proformaInvoice => proformaInvoice.counterpartyId === 1)).toBe(
            true,
        );
    });

    it('paginates and filters by status', async () => {
        await dataSource.getRepository(TestProformaInvoice).save([
            {
                orderId: 1,
                organizationId: 1,
                counterpartyId: 5,
                amount: 1000,
                currencyCode: 'RUB',
                status: 'paid',
            },
            {
                orderId: 2,
                organizationId: 1,
                counterpartyId: 5,
                amount: 500,
                currencyCode: 'RUB',
                status: 'pending',
            },
        ]);

        const result = await service.findForCounterparty(mockCtx, 5, { status: 'paid' });

        expect(result.totalItems).toBe(1);
        expect(result.items[0].status).toBe('paid');
    });
});
