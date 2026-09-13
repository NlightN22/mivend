import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { PaymentReconciliationIssueService } from '../../payment-reconciliation-issue.service';

// Same approach as invoice.service.int.test.ts: PaymentReconciliationIssue extends VendureEntity,
// which needs a bootstrapped EntityIdStrategy — mirror the production table with a standalone
// TypeORM entity against real Postgres instead of using the real class.
@Entity('payment_reconciliation_issue')
class TestPaymentReconciliationIssue {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) issueType!: string;
    @Column({ type: 'int', nullable: true }) paymentId!: number | null;
    @Column({ type: 'int', nullable: true }) invoiceId!: number | null;
    @Column({ type: 'int', nullable: true }) organizationId!: number | null;
    @Column({ type: 'varchar', nullable: true }) providerPaymentId!: string | null;
    @Column({ type: 'varchar', nullable: true }) erpDocumentId!: string | null;
    @Column({ type: 'int', nullable: true }) expectedAmount!: number | null;
    @Column({ type: 'int', nullable: true }) actualAmount!: number | null;
    @Column({ type: 'varchar', nullable: true }) expectedCurrency!: string | null;
    @Column({ type: 'varchar', nullable: true }) actualCurrency!: string | null;
    @Column({ type: 'timestamp' }) detectedAt!: Date;
    @Column({ type: 'varchar', default: 'open' }) status!: string;
    @Column({ type: 'varchar', nullable: true }) resolution!: string | null;
}

let dataSource: DataSource;
let service: PaymentReconciliationIssueService;
const mockCtx = {} as RequestContext;
const { schema, extra } = testSchemaOptions('payment_reconciliation_issue');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestPaymentReconciliationIssue],
        synchronize: true,
    });
    await dataSource.initialize();

    const connectionShim = {
        getRepository: () => dataSource.getRepository(TestPaymentReconciliationIssue),
        rawConnection: dataSource,
    } as unknown as TransactionalConnection;

    service = new PaymentReconciliationIssueService(
        connectionShim,
        { create: async () => ({}) } as never,
        { getCurrentAdministrator: async () => null } as never,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.getRepository(TestPaymentReconciliationIssue).clear();
});

async function createIssue(
    overrides: Partial<TestPaymentReconciliationIssue> = {},
): Promise<TestPaymentReconciliationIssue> {
    return dataSource.getRepository(TestPaymentReconciliationIssue).save({
        issueType: 'AMOUNT_MISMATCH',
        paymentId: null,
        invoiceId: 1,
        organizationId: 1,
        providerPaymentId: 'prov-1',
        erpDocumentId: null,
        expectedAmount: 1000,
        actualAmount: 900,
        expectedCurrency: 'RUB',
        actualCurrency: 'RUB',
        detectedAt: new Date(),
        status: 'open',
        resolution: null,
        ...overrides,
    });
}

// issue #76's dashboard read model — open payment reconciliation issues for a manager to notice.
describe('PaymentReconciliationIssueService.findOpen (integration, real Postgres)', () => {
    it('returns an open issue', async () => {
        const issue = await createIssue();
        const result = await service.findOpen(mockCtx);
        expect(result.items.map(i => i.id)).toEqual([issue.id]);
        expect(result.totalItems).toBe(1);
    });

    it('does not return a resolved or ignored issue', async () => {
        await createIssue({ status: 'resolved' });
        await createIssue({ status: 'ignored' });
        const result = await service.findOpen(mockCtx);
        expect(result.items).toEqual([]);
        expect(result.totalItems).toBe(0);
    });

    it('paginates with take/skip', async () => {
        await Promise.all(Array.from({ length: 5 }, () => createIssue()));
        const page1 = await service.findOpen(mockCtx, { take: 2, skip: 0 });
        const page2 = await service.findOpen(mockCtx, { take: 2, skip: 2 });
        expect(page1.totalItems).toBe(5);
        expect(page2.totalItems).toBe(5);
        expect(page1.items).toHaveLength(2);
        expect(page2.items).toHaveLength(2);
        const page1Ids = page1.items.map(i => i.id);
        const page2Ids = page2.items.map(i => i.id);
        expect(page1Ids.some(id => page2Ids.includes(id))).toBe(false);
    });

    it('orders newest-detected first, with id as a tiebreaker', async () => {
        const older = await createIssue({ detectedAt: new Date('2026-01-01T00:00:00Z') });
        const newer = await createIssue({ detectedAt: new Date('2026-01-02T00:00:00Z') });
        const sameTimestampA = await createIssue({ detectedAt: new Date('2026-01-03T00:00:00Z') });
        const sameTimestampB = await createIssue({ detectedAt: new Date('2026-01-03T00:00:00Z') });

        const result = await service.findOpen(mockCtx);
        const resultIds = result.items.map(i => i.id);
        expect(resultIds).toEqual([sameTimestampB.id, sameTimestampA.id, newer.id, older.id]);
    });
});
