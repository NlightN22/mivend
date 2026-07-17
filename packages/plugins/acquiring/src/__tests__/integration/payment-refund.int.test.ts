import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { PaymentRefundService } from '../../payment-refund.service';
import { DisputeService } from '../../dispute.service';

// Mirrors the real payment_refund/dispute tables against real Postgres — same approach as this
// directory's invoice.service.int.test.ts (VendureEntity needs a bootstrapped EntityIdStrategy).
@Entity('payment_refund')
class TestPaymentRefund {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'int' }) @Index() paymentId!: number;
    @Column({ type: 'int' }) amount!: number;
    @Column({ type: 'varchar', default: 'pending' }) status!: string;
    @Column({ type: 'varchar', nullable: true }) providerRefundId!: string | null;
    @Column({ type: 'varchar' }) reason!: string;
    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' }) createdAt!: Date;
}

@Entity('dispute')
class TestDispute {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'int' }) @Index() paymentId!: number;
    @Column({ type: 'varchar' }) type!: string;
    @Column({ type: 'varchar', default: 'opened' }) status!: string;
    @Column({ type: 'int' }) amount!: number;
    @Column({ type: 'timestamp' }) openedAt!: Date;
}

let dataSource: DataSource;
let refundService: PaymentRefundService;
let disputeService: DisputeService;
const mockCtx = {} as RequestContext;

beforeAll(async () => {
    dataSource = new DataSource({
        type: 'postgres',
        host: process.env['TEST_DB_HOST'] ?? 'localhost',
        port: Number(process.env['TEST_DB_PORT'] ?? 5432),
        username: process.env['TEST_DB_USER'] ?? 'postgres',
        password: process.env['TEST_DB_PASSWORD'] ?? 'postgres',
        database: process.env['TEST_DB_NAME'] ?? 'mivend_test',
        entities: [TestPaymentRefund, TestDispute],
        synchronize: true,
        dropSchema: true,
    });
    await dataSource.initialize();

    const connectionShim = {
        getRepository: (_ctx: unknown, entity: unknown) =>
            entity === TestPaymentRefund || (entity as { name?: string }).name === 'PaymentRefund'
                ? dataSource.getRepository(TestPaymentRefund)
                : dataSource.getRepository(TestDispute),
    } as unknown as TransactionalConnection;

    refundService = new PaymentRefundService(connectionShim);
    disputeService = new DisputeService(connectionShim);
});

afterAll(async () => {
    await dataSource.destroy();
});

beforeEach(async () => {
    await dataSource.getRepository(TestPaymentRefund).clear();
    await dataSource.getRepository(TestDispute).clear();
});

describe('PaymentRefundService (integration, real Postgres)', () => {
    it('persists a refund modeled on a real Robokassa RefundOperation response (OpKey -> providerRefundId)', async () => {
        const refund = await refundService.create(mockCtx, {
            paymentId: 42,
            amount: 5000,
            reason: 'Customer requested full refund',
            providerRefundId: '48213077',
            status: 'succeeded',
        });

        expect(refund.id).toBeDefined();
        const found = await refundService.findByPaymentId(mockCtx, 42);
        expect(found).toHaveLength(1);
        expect(found[0].providerRefundId).toBe('48213077');
        expect(found[0].status).toBe('succeeded');
    });

    it('scopes findByPaymentId to only that payment (no cross-payment leak)', async () => {
        await refundService.create(mockCtx, { paymentId: 1, amount: 100, reason: 'a' });
        await refundService.create(mockCtx, { paymentId: 2, amount: 200, reason: 'b' });

        const found = await refundService.findByPaymentId(mockCtx, 1);
        expect(found).toHaveLength(1);
        expect(found[0].paymentId).toBe(1);
    });
});

describe('DisputeService (integration, real Postgres)', () => {
    it('persists a chargeback with its own independent lifecycle (never folded into PaymentAttempt.paymentStatus)', async () => {
        const dispute = await disputeService.create(mockCtx, {
            paymentId: 42,
            type: 'chargeback',
            amount: 5000,
        });
        expect(dispute.status).toBe('opened');

        const found = await disputeService.findByPaymentId(mockCtx, 42);
        expect(found).toHaveLength(1);
        expect(found[0].type).toBe('chargeback');
    });
});
