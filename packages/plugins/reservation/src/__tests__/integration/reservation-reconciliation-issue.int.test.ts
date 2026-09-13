import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ReservationReconciliationIssueService } from '../../reservation-reconciliation-issue.service';

// Same approach as plugin-acquiring's invoice.service.int.test.ts: ReservationReconciliationIssue
// extends VendureEntity, which needs a bootstrapped EntityIdStrategy — mirror the production
// table with a standalone TypeORM entity against real Postgres instead of using the real class.
@Entity('reservation_reconciliation_issue')
@Index(['orderId'])
class TestReservationReconciliationIssue {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) issueType!: string;
    @Column({ type: 'varchar' }) orderId!: string;
    @Column({ type: 'varchar', nullable: true }) productVariantId!: string | null;
    @Column({ type: 'int', nullable: true }) localQuantity!: number | null;
    @Column({ type: 'int', nullable: true }) erpQuantity!: number | null;
    @Column({ type: 'varchar', nullable: true }) externalProductId!: string | null;
    @Column({ type: 'varchar' }) orderEntityId!: string;
    @Column({ type: 'timestamp' }) detectedAt!: Date;
    @Column({ type: 'varchar', default: 'open' }) status!: string;
    @Column({ type: 'varchar', nullable: true }) resolution!: string | null;
}

let dataSource: DataSource;
let service: ReservationReconciliationIssueService;
const mockCtx = {} as RequestContext;
const { schema, extra } = testSchemaOptions('reservation_reconciliation_issue');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestReservationReconciliationIssue],
        synchronize: true,
    });
    await dataSource.initialize();

    const connectionShim = {
        getRepository: () => dataSource.getRepository(TestReservationReconciliationIssue),
        rawConnection: dataSource,
    } as unknown as TransactionalConnection;

    service = new ReservationReconciliationIssueService(connectionShim, {
        create: async () => ({}),
    } as never);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.getRepository(TestReservationReconciliationIssue).clear();
});

async function createIssue(
    overrides: Partial<TestReservationReconciliationIssue> = {},
): Promise<TestReservationReconciliationIssue> {
    return dataSource.getRepository(TestReservationReconciliationIssue).save({
        issueType: 'QUANTITY_MISMATCH',
        orderId: 'order-1',
        productVariantId: 'variant-1',
        localQuantity: 5,
        erpQuantity: 3,
        externalProductId: null,
        orderEntityId: 'erp-order-1',
        detectedAt: new Date(),
        status: 'open',
        resolution: null,
        ...overrides,
    });
}

// issue #76's dashboard read model — open reconciliation drifts for a manager to notice.
describe('ReservationReconciliationIssueService.findOpen (integration, real Postgres)', () => {
    it('returns an open issue', async () => {
        const issue = await createIssue();
        const result = await service.findOpen(mockCtx);
        expect(result.items.map(i => i.id)).toEqual([issue.id]);
        expect(result.totalItems).toBe(1);
    });

    it('does not return a resolved issue', async () => {
        await createIssue({ status: 'resolved' });
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
        const sameTimestampA = await createIssue({
            orderId: 'order-2',
            detectedAt: new Date('2026-01-03T00:00:00Z'),
        });
        const sameTimestampB = await createIssue({
            orderId: 'order-3',
            detectedAt: new Date('2026-01-03T00:00:00Z'),
        });

        const result = await service.findOpen(mockCtx);
        const resultIds = result.items.map(i => i.id);
        expect(resultIds).toEqual([sameTimestampB.id, sameTimestampA.id, newer.id, older.id]);
    });
});
