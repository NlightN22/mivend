import { describe, expect, it, Mock, vi } from 'vitest';

vi.mock('@vendure/core', async importOriginal => {
    const actual = await importOriginal<typeof import('@vendure/core')>();
    return { ...actual, Logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } };
});

import { Logger } from '@vendure/core';
import { ExchangeHealthPollerService } from '../../exchange-health-poller.service';
import { ExchangeHealthReadError } from '../../exchange-health';

function setup(fetchHealth: () => Promise<unknown>): {
    service: ExchangeHealthPollerService;
    upsert: Mock;
} {
    const upsert = vi.fn(async () => undefined);
    const service = new ExchangeHealthPollerService(
        { fetchHealth } as never,
        { getRepository: () => ({ upsert }) } as never,
        { create: async () => ({}) } as never,
    );
    return { service, upsert };
}

describe('ExchangeHealthPollerService', () => {
    it('stores the service status and the health on success', async () => {
        const health = { status: 'DOWN' };
        const { service, upsert } = setup(async () => health);
        expect(await service.pollOnce()).toEqual({ state: 'DOWN', reason: null });
        expect(upsert).toHaveBeenCalledWith(
            expect.objectContaining({ key: 'exchange', state: 'DOWN', reason: null, health }),
            ['key'],
        );
    });

    it('stores UNKNOWN with the reason class on a failed read, replacing the previous answer', async () => {
        const { service, upsert } = setup(async () => {
            throw new ExchangeHealthReadError(
                'UNAUTHORIZED',
                'exchange health endpoint returned 401',
            );
        });
        expect(await service.pollOnce()).toEqual({ state: 'UNKNOWN', reason: 'UNAUTHORIZED' });
        expect(upsert).toHaveBeenCalledWith(
            expect.objectContaining({ state: 'UNKNOWN', reason: 'UNAUTHORIZED', health: null }),
            ['key'],
        );
        expect(Logger.warn).toHaveBeenCalled();
    });

    it('treats an unexpected error as UNREACHABLE and still writes', async () => {
        const { service, upsert } = setup(async () => {
            throw new Error('boom');
        });
        expect((await service.pollOnce()).reason).toBe('UNREACHABLE');
        expect(upsert).toHaveBeenCalledOnce();
    });

    it('logs NOT_CONFIGURED at debug, not as a warning every poll', async () => {
        vi.mocked(Logger.warn).mockClear();
        const { service } = setup(async () => {
            throw new ExchangeHealthReadError('NOT_CONFIGURED', 'not configured');
        });
        expect((await service.pollOnce()).reason).toBe('NOT_CONFIGURED');
        expect(Logger.warn).not.toHaveBeenCalled();
        expect(Logger.debug).toHaveBeenCalled();
    });
});
