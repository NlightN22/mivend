import { describe, expect, it, vi } from 'vitest';

vi.mock('@vendure/core', async importOriginal => {
    const actual = await importOriginal<typeof import('@vendure/core')>();
    return { ...actual, Logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } };
});

import { ExchangeHealthPollerService } from '../../exchange-health-poller.service';

const health = (publishStatus: string | null): Record<string, unknown> => ({
    status: publishStatus ?? 'OK',
    publish: publishStatus ? { status: publishStatus, aggregates: [] } : null,
    mappingErrors: [],
});

function setup(
    h: Record<string, unknown>,
    fetchMappingErrors: () => Promise<unknown>,
): {
    service: ExchangeHealthPollerService;
    upsert: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
} {
    const upsert = vi.fn(async () => undefined);
    const read = vi.fn(fetchMappingErrors);
    const service = new ExchangeHealthPollerService(
        { fetchHealth: async () => h, fetchMappingErrors: read } as never,
        { getRepository: () => ({ upsert }) } as never,
        { create: async () => ({}) } as never,
    );
    return { service, upsert, read };
}

const errors = [{ kind: 'item', code: 'c', message: 'm', occurrences: 1, lastSeenAt: null }];

describe('poller mapping errors', () => {
    it('reads and stores mapping errors when publish is not OK', async () => {
        const { service, upsert, read } = setup(health('DEGRADED'), async () => errors);
        await service.pollOnce();
        expect(read).toHaveBeenCalledOnce();
        expect(upsert.mock.calls[0][0].health.mappingErrors).toEqual(errors);
    });

    it.each([null, 'OK'])('makes no extra read when publish is %s', async status => {
        const { service, read } = setup(health(status), async () => errors);
        await service.pollOnce();
        expect(read).not.toHaveBeenCalled();
    });

    it('stores the health with no errors when the extra read fails and keeps the state', async () => {
        const { service, upsert } = setup(health('DOWN'), async () => {
            throw new Error('boom');
        });
        expect(await service.pollOnce()).toEqual({ state: 'DOWN', reason: null });
        expect(upsert.mock.calls[0][0].health.mappingErrors).toEqual([]);
    });
});
