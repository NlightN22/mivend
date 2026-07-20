import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
    Column,
    DataSource,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { InboxService } from '../../inbox.service';

// InboxService.claimBatch's real risk is concurrency, not lifecycle logic (that's covered by the
// unit test's mocked-repo scenarios) — two independent callers (the scheduled BullMQ sweep and
// the admin-triggered "run sweep now" mutation, see invoice.resolver.ts) can call it at the same
// moment. This suite exercises that for real against Postgres: real concurrent claimBatch calls
// (not two sequential ones — see docs/testing-strategy.md's concurrency pattern), plus recovery
// of a row abandoned mid-'processing' by a crashed worker.
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
let inboxService: InboxService;
const mockCtx = {} as RequestContext;

function buildConnectionShim(): TransactionalConnection {
    return {
        getRepository: () => dataSource.getRepository(TestIncomingPaymentEvent),
    } as unknown as TransactionalConnection;
}

const { schema, extra } = testSchemaOptions('payment_inbox_claim');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestIncomingPaymentEvent],
        synchronize: true,
    });
    await dataSource.initialize();
    inboxService = new InboxService(buildConnectionShim());
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

afterEach(async () => {
    await dataSource.getRepository(TestIncomingPaymentEvent).clear();
});

async function seedPending(count: number, providerPrefix: string): Promise<void> {
    const repo = dataSource.getRepository(TestIncomingPaymentEvent);
    for (let i = 0; i < count; i++) {
        await repo.save(
            repo.create({
                provider: 'bank-transfer-erp',
                providerEventId: `${providerPrefix}-${i}`,
                payloadHash: 'hash',
                payload: '{}',
                status: 'pending',
                attempts: 0,
            }),
        );
    }
}

describe('InboxService.claimBatch: concurrent claim (integration, real Postgres)', () => {
    it('two real concurrent claimBatch calls never both claim the same row', async () => {
        await seedPending(10, 'concurrent');

        const [batchA, batchB] = await Promise.all([
            inboxService.claimBatch(mockCtx, 10),
            inboxService.claimBatch(mockCtx, 10),
        ]);

        const idsA = batchA.map(row => row.id);
        const idsB = batchB.map(row => row.id);
        const overlap = idsA.filter(id => idsB.includes(id));

        expect(overlap).toEqual([]);
        expect(idsA.length + idsB.length).toBe(10);

        const allProcessing = await dataSource
            .getRepository(TestIncomingPaymentEvent)
            .find({ where: { status: 'processing' } });
        expect(allProcessing).toHaveLength(10);
    });

    it('a row already claimed is not claimed again by a later call while still processing', async () => {
        await seedPending(3, 'held');

        const firstClaim = await inboxService.claimBatch(mockCtx, 10);
        expect(firstClaim).toHaveLength(3);

        const secondClaim = await inboxService.claimBatch(mockCtx, 10);
        expect(secondClaim).toHaveLength(0);
    });
});

describe('InboxService.claimBatch: stuck "processing" recovery (integration, real Postgres)', () => {
    it('reclaims a row abandoned in "processing" past the staleness threshold', async () => {
        const repo = dataSource.getRepository(TestIncomingPaymentEvent);
        const stuck = await repo.save(
            repo.create({
                provider: 'bank-transfer-erp',
                providerEventId: 'stuck-1',
                payloadHash: 'hash',
                payload: '{}',
                status: 'processing',
                attempts: 0,
            }),
        );
        // Simulate a worker that claimed this row 10 minutes ago and then crashed — backdate
        // updatedAt via a DB-relative expression (past the 5-minute STUCK_PROCESSING_THRESHOLD_MS
        // in inbox.service.ts), not an app-side `new Date(Date.now() - ...)`: the app process and
        // the test Postgres container's clocks are not guaranteed to agree (real skew observed
        // while writing this test), and claimBatch's own staleness check is entirely DB-side
        // (`now() - interval`) for exactly that reason — so the test must set up its fixture the
        // same way to stay meaningful.
        await dataSource.query(
            `UPDATE "${schema}"."incoming_payment_event" SET "updatedAt" = now() - interval '10 minutes' WHERE id = $1`,
            [stuck.id],
        );

        const claimed = await inboxService.claimBatch(mockCtx, 10);

        expect(claimed.map(row => row.id)).toContain(stuck.id);
    });

    it('does not reclaim a row that is still recently "processing"', async () => {
        const repo = dataSource.getRepository(TestIncomingPaymentEvent);
        const fresh = await repo.save(
            repo.create({
                provider: 'bank-transfer-erp',
                providerEventId: 'fresh-1',
                payloadHash: 'hash',
                payload: '{}',
                status: 'processing',
                attempts: 0,
            }),
        );

        const claimed = await inboxService.claimBatch(mockCtx, 10);

        expect(claimed.map(row => row.id)).not.toContain(fresh.id);
    });
});
