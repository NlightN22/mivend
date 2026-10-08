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
import { IntegrationInboxService } from '../../../integration-inbox.service';
import type { ResyncReplayClient } from '../../../resync-replay.client';
import type { InboundStream } from '../../../types';

let dataSource: DataSource;
let inbox: IntegrationInboxService;

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
});

afterEach(async () => {
    await dataSource.getRepository(IntegrationInboxEvent).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

async function seed(
    stream: InboundStream,
    entityId: string,
    status: 'failed' | 'processed',
): Promise<number> {
    const row = await inbox.enqueue({
        stream,
        entityId,
        version: '1',
        sourceEventId: `evt-${stream}-${entityId}`,
        payload: {},
    });
    await dataSource.getRepository(IntegrationInboxEvent).update(row.id, { status });
    return row.id;
}

async function statusOf(id: number): Promise<string> {
    return (await dataSource.getRepository(IntegrationInboxEvent).findOneByOrFail({ id })).status;
}

function service(replay: ReturnType<typeof vi.fn>): IntegrationInboxReplayService {
    return new IntegrationInboxReplayService(dataSource, {
        replay,
    } as unknown as ResyncReplayClient);
}

describe('IntegrationInboxReplayService', () => {
    it('replays a failed row by aggregate type and marks it resolved', async () => {
        const id = await seed('price-type', 'pt-1', 'failed');
        const replay = vi
            .fn()
            .mockResolvedValue([{ entityId: 'pt-1', status: 'replayed_from_state' }]);

        const results = await service(replay).replayFailed([id]);

        expect(replay).toHaveBeenCalledWith('priceType', ['pt-1']);
        expect(results).toEqual([
            expect.objectContaining({ outcome: 'REPLAYED', entityId: 'pt-1' }),
        ]);
        expect(await statusOf(id)).toBe('resolved');
    });

    it('leaves the row failed when Integration Service no longer knows the entity', async () => {
        const id = await seed('bank', 'b-1', 'failed');
        const replay = vi.fn().mockResolvedValue([{ entityId: 'b-1', status: 'not_found' }]);

        const [result] = await service(replay).replayFailed([id]);

        expect(result.outcome).toBe('NOT_FOUND');
        expect(await statusOf(id)).toBe('failed');
    });

    it('does not call the receiver for vat-rate or for rows that are not failed', async () => {
        const vat = await seed('vat-rate', 'v-1', 'failed');
        const ok = await seed('bank', 'b-2', 'processed');
        const replay = vi.fn();

        const results = await service(replay).replayFailed([vat, ok]);

        expect(replay).not.toHaveBeenCalled();
        expect(results.map(r => r.outcome).sort()).toEqual(['NOT_FAILED', 'UNSUPPORTED']);
        expect(await statusOf(vat)).toBe('failed');
    });

    it('reports FAILED and keeps rows failed when the replay call throws (no swallowed error)', async () => {
        const id = await seed('unit', 'u-1', 'failed');
        const replay = vi.fn().mockRejectedValue(new Error('IS unreachable'));

        const [result] = await service(replay).replayFailed([id]);

        expect(result).toMatchObject({ outcome: 'FAILED', message: 'IS unreachable' });
        expect(await statusOf(id)).toBe('failed');
    });

    it('is idempotent: a second call finds the row resolved and replays nothing', async () => {
        const id = await seed('bank', 'b-3', 'failed');
        const replay = vi
            .fn()
            .mockResolvedValue([{ entityId: 'b-3', status: 'replayed_from_outbox' }]);
        const svc = service(replay);

        await svc.replayFailed([id]);
        const [again] = await svc.replayFailed([id]);

        expect(again.outcome).toBe('NOT_FAILED');
        expect(replay).toHaveBeenCalledTimes(1);
    });
});
