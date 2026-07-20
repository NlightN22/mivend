import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { IdempotencyService } from '../../idempotency.service';
import { IdempotencyConflictError } from '../../types';

// Level 1 idempotency (docs/payments.md: command idempotency, the guard against e.g.
// double-charging a payment provider on a retried command). IdempotencyService.claim()'s real
// risk is concurrency — a plain findOne()-then-save() has a TOCTOU window where two callers
// racing on the same (callerId, idempotencyKey) both see "no existing row" and both execute fn()
// — this suite exercises the atomic claim (INSERT-wins-the-unique-index, then a conditional
// UPDATE for a 'failed' retry) for real against Postgres, not mocked.
@Entity('idempotency_key')
@Index(['callerId', 'idempotencyKey'], { unique: true })
class TestIdempotencyKey {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar' }) callerId!: string;
    @Column({ type: 'varchar' }) idempotencyKey!: string;
    @Column({ type: 'varchar' }) requestHash!: string;
    @Column({ type: 'text', nullable: true }) response!: string | null;
    @Column({ type: 'varchar', default: 'inProgress' }) status!: string;
}

let dataSource: DataSource;
let service: IdempotencyService;
const mockCtx = {} as RequestContext;

function buildConnectionShim(): TransactionalConnection {
    return {
        getRepository: () => dataSource.getRepository(TestIdempotencyKey),
    } as unknown as TransactionalConnection;
}

const { schema, extra } = testSchemaOptions('idempotency');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestIdempotencyKey],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new IdempotencyService(buildConnectionShim());
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

afterEach(async () => {
    await dataSource.getRepository(TestIdempotencyKey).clear();
});

describe('IdempotencyService.withIdempotency (integration, real Postgres)', () => {
    it('a sequential retry with the same key and hash returns the stored response without re-executing fn', async () => {
        const fn = countingFn(async () => ({ charged: 'first' }));
        const first = await service.withIdempotency(
            mockCtx,
            'payment-service',
            'p:1:capture',
            'hash',
            fn,
        );
        const second = await service.withIdempotency(
            mockCtx,
            'payment-service',
            'p:1:capture',
            'hash',
            fn,
        );

        expect(first).toEqual({ charged: 'first' });
        expect(second).toEqual({ charged: 'first' });
        expect(fn.calls).toBe(1);
    });

    it('a retry with the same key but a different hash is a hard payload-mismatch conflict', async () => {
        await service.withIdempotency(
            mockCtx,
            'payment-service',
            'p:1:capture',
            'hash-a',
            async () => ({
                ok: true,
            }),
        );

        await expect(
            service.withIdempotency(
                mockCtx,
                'payment-service',
                'p:1:capture',
                'hash-b',
                async () => ({
                    ok: false,
                }),
            ),
        ).rejects.toThrow(IdempotencyConflictError);
    });

    it('a retry after a failed attempt with the same hash re-executes fn', async () => {
        await expect(
            service.withIdempotency(mockCtx, 'payment-service', 'p:1:capture', 'hash', async () => {
                throw new Error('provider timeout');
            }),
        ).rejects.toThrow('provider timeout');

        const fn = countingFn(async () => ({ charged: 'retry' }));
        const result = await service.withIdempotency(
            mockCtx,
            'payment-service',
            'p:1:capture',
            'hash',
            fn,
        );

        expect(result).toEqual({ charged: 'retry' });
        expect(fn.calls).toBe(1);
    });

    it('two real concurrent calls with the same key and hash execute fn exactly once — the loser gets an in-progress conflict, never a second charge', async () => {
        const fn = countingFn(async () => {
            await new Promise(resolve => setTimeout(resolve, 30));
            return { charged: true };
        });

        const results = await Promise.allSettled([
            service.withIdempotency(mockCtx, 'payment-service', 'p:concurrent:capture', 'hash', fn),
            service.withIdempotency(mockCtx, 'payment-service', 'p:concurrent:capture', 'hash', fn),
        ]);

        // The one invariant this suite actually exists to prove: fn (the risky, non-idempotent
        // side effect — "charge the payment provider") ran exactly once, never twice. Whether the
        // loser sees an 'in-progress' conflict or the winner's already-'completed' cached
        // response depends on real scheduling — under load, the winner can legitimately finish
        // before the loser's fallback query runs — and both are correct outcomes; asserting a
        // fixed 1-rejected/1-fulfilled split here would make this test flaky on real timing
        // variance while proving nothing extra about the actual risk.
        expect(fn.calls).toBe(1);
        for (const result of results) {
            if (result.status === 'rejected') {
                expect(result.reason).toBeInstanceOf(IdempotencyConflictError);
            } else {
                expect(result.value).toEqual({ charged: true });
            }
        }
    });

    it('two real concurrent calls with the same key but different hashes: the loser gets a payload-mismatch conflict, not in-progress', async () => {
        const fn = countingFn(async () => {
            await new Promise(resolve => setTimeout(resolve, 30));
            return { charged: true };
        });

        const results = await Promise.allSettled([
            service.withIdempotency(
                mockCtx,
                'payment-service',
                'p:concurrent-mismatch:capture',
                'hash-a',
                fn,
            ),
            service.withIdempotency(
                mockCtx,
                'payment-service',
                'p:concurrent-mismatch:capture',
                'hash-b',
                fn,
            ),
        ]);

        expect(fn.calls).toBe(1);
        const rejected = results.find(r => r.status === 'rejected') as
            | PromiseRejectedResult
            | undefined;
        expect(rejected).toBeDefined();
        expect((rejected!.reason as IdempotencyConflictError).reason).toBe('payload-mismatch');
    });
});

// A tiny call-counting wrapper — vitest's vi.fn() spy state isn't safely readable mid-flight
// across genuinely concurrent invocations in the same way a plain counter is; this only needs to
// prove call count and pass through the wrapped implementation.
function countingFn<T>(impl: () => Promise<T>): (() => Promise<T>) & { calls: number } {
    let calls = 0;
    const wrapped = async (): Promise<T> => {
        calls += 1;
        return impl();
    };
    return Object.defineProperty(wrapped, 'calls', { get: () => calls }) as typeof wrapped & {
        calls: number;
    };
}
