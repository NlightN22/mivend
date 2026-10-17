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

// claimBatch's real risk is concurrency: the scheduled sweep and admin trigger can overlap.
// Tests use real parallel calls against Postgres, not sequential ones, to exercise the race.
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
        // Backdate updatedAt with a DB-side expression, not an app-side Date: app and DB clocks can skew.
        // claimBatch's staleness check runs on the DB clock (now() - interval), so the fixture must match.
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

describe('InboxService outcome writes (integration, real Postgres)', () => {
    async function seedProcessing(ref: string): Promise<TestIncomingPaymentEvent> {
        const repo = dataSource.getRepository(TestIncomingPaymentEvent);
        return repo.save(
            repo.create({
                provider: 'bank-transfer-erp',
                providerEventId: ref,
                payloadHash: 'hash',
                payload: '{}',
                status: 'processing',
                attempts: 0,
            }),
        );
    }

    it('concurrent markFailed calls each count one attempt (no lost increment)', async () => {
        const row = await seedProcessing('attempts-1');

        await Promise.all([
            inboxService.markFailed(mockCtx, row.id, new Error('a')),
            inboxService.markFailed(mockCtx, row.id, new Error('b')),
        ]);

        const after = await dataSource.getRepository(TestIncomingPaymentEvent).findOneByOrFail({
            id: row.id,
        });
        expect(after.attempts).toBe(1);
    });

    it('a stale worker cannot overwrite a settled row with markProcessed or markFailed', async () => {
        const row = await seedProcessing('stale-1');
        await inboxService.markProcessed(mockCtx, row.id);

        await inboxService.markFailed(mockCtx, row.id, new Error('stale'));
        await inboxService.markProcessed(mockCtx, row.id);

        const after = await dataSource.getRepository(TestIncomingPaymentEvent).findOneByOrFail({
            id: row.id,
        });
        expect(after.status).toBe('processed');
        expect(after.attempts).toBe(0);
    });

    it('markFailed dead-letters on the fifth attempt', async () => {
        const row = await seedProcessing('dead-1');
        const repo = dataSource.getRepository(TestIncomingPaymentEvent);
        await repo.update(row.id, { attempts: 4 });

        await inboxService.markFailed(mockCtx, row.id, new Error('last'));

        const after = await repo.findOneByOrFail({ id: row.id });
        expect(after.status).toBe('failed');
        expect(after.attempts).toBe(5);
    });

    it('enqueue with a rejectReason stores the row terminal, never claimable', async () => {
        const row = await inboxService.enqueue(
            mockCtx,
            'branch-kassa',
            'no-rrn-1',
            'h',
            {},
            'no rrn',
        );

        expect(row.status).toBe('failed');
        expect(await inboxService.claimBatch(mockCtx, 10)).toEqual([]);
    });
});
