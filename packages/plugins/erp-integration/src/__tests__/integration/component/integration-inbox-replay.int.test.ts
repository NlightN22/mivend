import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { IntegrationInboxReplayService } from '../../../integration-inbox-replay.service';
import { IntegrationInboxReplayStateService } from '../../../integration-inbox-replay-state.service';
import { IntegrationInboxService } from '../../../integration-inbox.service';
import type { ResyncReplayClient } from '../../../resync-replay.client';
import type { InboundStream } from '../../../types';

let dataSource: DataSource;
let inbox: IntegrationInboxService;
let state: IntegrationInboxReplayStateService;

const { schema, extra } = testSchemaOptions('erp_integration_inbox_replay');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [IntegrationInboxEvent],
        synchronize: true,
    });
    await dataSource.initialize();
    inbox = new IntegrationInboxService(dataSource);
    state = new IntegrationInboxReplayStateService(dataSource);
});

afterEach(async () => {
    await dataSource.getRepository(IntegrationInboxEvent).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

let counter = 0;
async function seed(
    stream: InboundStream,
    entityId: string,
    status: 'failed' | 'processed' | 'pending',
): Promise<number> {
    const row = await inbox.enqueue({
        stream,
        entityId,
        version: String(++counter),
        sourceEventId: `evt-${counter}`,
        payload: {},
    });
    await dataSource.getRepository(IntegrationInboxEvent).update(row.id, { status });
    return row.id;
}

async function statusOf(id: number): Promise<string> {
    return (await dataSource.getRepository(IntegrationInboxEvent).findOneByOrFail({ id })).status;
}

async function lastErrorOf(id: number): Promise<string | null> {
    return (await dataSource.getRepository(IntegrationInboxEvent).findOneByOrFail({ id }))
        .lastError;
}

function service(replay: ReturnType<typeof vi.fn>): IntegrationInboxReplayService {
    return new IntegrationInboxReplayService(
        dataSource,
        { replay } as unknown as ResyncReplayClient,
        state,
    );
}

const accepted = (entityId: string) =>
    vi.fn().mockResolvedValue([{ entityId, status: 'replayed_from_state' }]);

describe('replay request', () => {
    it('moves a failed row to replay_requested, never straight to resolved', async () => {
        const id = await seed('price-type', 'pt-1', 'failed');
        const replay = accepted('pt-1');

        const results = await service(replay).replayFailed([id]);

        expect(replay).toHaveBeenCalledWith('priceType', ['pt-1']);
        expect(results).toEqual([
            expect.objectContaining({ outcome: 'REPLAYED', entityId: 'pt-1' }),
        ]);
        expect(await statusOf(id)).toBe('replay_requested');
    });

    it('keeps the row failed and annotated when Integration Service does not know the entity', async () => {
        const id = await seed('bank', 'b-1', 'failed');
        const replay = vi.fn().mockResolvedValue([{ entityId: 'b-1', status: 'not_found' }]);

        const [result] = await service(replay).replayFailed([id]);

        expect(result.outcome).toBe('NOT_FOUND');
        expect(await statusOf(id)).toBe('failed');
        expect(await lastErrorOf(id)).toContain('replay did not resolve');
    });

    it('keeps the row failed when the replay call throws (error is not swallowed)', async () => {
        const id = await seed('unit', 'u-1', 'failed');
        const replay = vi.fn().mockRejectedValue(new Error('IS unreachable'));

        const [result] = await service(replay).replayFailed([id]);

        expect(result).toMatchObject({ outcome: 'FAILED', message: 'IS unreachable' });
        expect(await statusOf(id)).toBe('failed');
    });

    it('does not call the receiver for vat-rate or rows that are not failed', async () => {
        const vat = await seed('vat-rate', 'v-1', 'failed');
        const ok = await seed('bank', 'b-2', 'processed');
        const replay = vi.fn();

        const results = await service(replay).replayFailed([vat, ok]);

        expect(replay).not.toHaveBeenCalled();
        expect(results.map(r => r.outcome).sort()).toEqual(['NOT_FAILED', 'UNSUPPORTED']);
    });

    it('a second click while replay_requested does nothing; two concurrent clicks ask the receiver once', async () => {
        const id = await seed('bank', 'b-3', 'failed');
        const replay = accepted('b-3');
        const svc = service(replay);

        const [a, b] = await Promise.all([svc.replayFailed([id]), svc.replayFailed([id])]);
        const again = await svc.replayFailed([id]);

        expect(replay).toHaveBeenCalledTimes(1);
        expect([a[0].outcome, b[0].outcome].sort()).toEqual(['NOT_FAILED', 'REPLAYED']);
        expect(again[0].outcome).toBe('NOT_FAILED');
        expect(await statusOf(id)).toBe('replay_requested');
    });
});

describe('closing a replay_requested row', () => {
    async function requested(stream: InboundStream, entityId: string): Promise<number> {
        const id = await seed(stream, entityId, 'failed');
        await service(accepted(entityId)).replayFailed([id]);
        return id;
    }

    it.each([
        ['applied', undefined],
        ['superseded', 'a newer version was already processed'],
        ['noop', 'tombstone for a row never had'],
    ] as const)('resolves when the replayed event is processed as %s', async (outcome, reason) => {
        const id = await requested('bank', 'e-1');
        const fresh = await seed('bank', 'e-1', 'pending');

        await inbox.markProcessed(fresh, outcome, reason ?? null);

        expect(await statusOf(id)).toBe('resolved');
    });

    it('does not resolve on an event that was already waiting before the replay was requested', async () => {
        const older = await seed('bank', 'e-2', 'pending');
        const id = await requested('bank', 'e-2');

        await inbox.markProcessed(older);

        expect(await statusOf(id)).toBe('replay_requested');
    });

    it('ignores events of other entities and other streams', async () => {
        const id = await requested('bank', 'e-3');
        const otherEntity = await seed('bank', 'e-other', 'pending');
        const otherStream = await seed('unit', 'e-3', 'pending');

        await inbox.markProcessed(otherEntity);
        await inbox.markProcessed(otherStream);

        expect(await statusOf(id)).toBe('replay_requested');
    });

    it('goes back to failed, annotated, when the replayed event is dead-lettered', async () => {
        const id = await requested('bank', 'e-4');
        const fresh = await seed('bank', 'e-4', 'pending');
        await dataSource.query(
            "UPDATE integration_inbox_event SET first_failed_at = now() - interval '25 hours' WHERE id = $1",
            [fresh],
        );

        await inbox.markFailed(fresh, new Error('counterparty not synced yet'));

        expect(await statusOf(fresh)).toBe('failed');
        expect(await statusOf(id)).toBe('failed');
        expect(await lastErrorOf(id)).toContain(
            'replay did not resolve: the replayed event failed: counterparty not synced yet',
        );
    });

    it('keeps waiting while the replayed event is only retrying (not dead-lettered yet)', async () => {
        const id = await requested('bank', 'e-5');
        const fresh = await seed('bank', 'e-5', 'pending');

        await inbox.markFailed(fresh, new Error('not synced yet'));

        expect(await statusOf(fresh)).toBe('pending');
        expect(await statusOf(id)).toBe('replay_requested');
    });
});

describe('timeout sweep', () => {
    async function requestedAgo(entityId: string, minutes: number): Promise<number> {
        const id = await seed('bank', entityId, 'failed');
        await service(accepted(entityId)).replayFailed([id]);
        await dataSource.query(
            `UPDATE integration_inbox_event
                SET replay_requested_at = now() - ($2 || ' minutes')::interval
              WHERE id = $1`,
            [id, String(minutes)],
        );
        return id;
    }

    it('returns a row to failed when no new event arrived within the timeout', async () => {
        const id = await requestedAgo('t-1', 90);

        expect(await state.expireStale()).toBe(1);

        expect(await statusOf(id)).toBe('failed');
        expect(await lastErrorOf(id)).toContain('replay did not resolve: no replayed event');
    });

    it('leaves a recent request, and a request whose new event is still pending, alone', async () => {
        const recent = await requestedAgo('t-2', 5);
        const waiting = await requestedAgo('t-3', 90);
        await seed('bank', 't-3', 'pending');

        expect(await state.expireStale()).toBe(0);

        expect(await statusOf(recent)).toBe('replay_requested');
        expect(await statusOf(waiting)).toBe('replay_requested');
    });

    it('returns a row to failed when the newer event already ended failed', async () => {
        const id = await requestedAgo('t-4', 5);
        await seed('bank', 't-4', 'failed');

        expect(await state.expireStale()).toBe(1);

        expect(await lastErrorOf(id)).toContain('the replayed event failed');
    });

    it('a replay_requested row cannot be replayed again until the sweep returned it', async () => {
        const id = await requestedAgo('t-5', 5);
        const replay = accepted('t-5');

        const [blocked] = await service(replay).replayFailed([id]);

        expect(blocked.outcome).toBe('NOT_FAILED');
        expect(replay).not.toHaveBeenCalled();
    });

    it('race: the sweep and the processor closing the row end in exactly one terminal state', async () => {
        for (let n = 0; n < 15; n++) {
            const id = await requestedAgo(`race-${n}`, 90);
            const fresh = await seed('bank', `race-${n}`, 'pending');

            await Promise.all([state.expireStale(), inbox.markProcessed(fresh)]);

            const final = await statusOf(id);
            expect(['resolved', 'failed']).toContain(final);
            if (final === 'failed')
                expect(await lastErrorOf(id)).toContain('replay did not resolve');
        }
    });
});
