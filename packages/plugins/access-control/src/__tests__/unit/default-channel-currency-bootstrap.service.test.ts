import { describe, it, expect, vi } from 'vitest';
import type { ChannelService, ProcessContext } from '@vendure/core';

import { DefaultChannelCurrencyBootstrapService } from '../../default-channel-currency-bootstrap.service';

describe('DefaultChannelCurrencyBootstrapService', () => {
    function build(current: string, code: string | undefined, isWorker = false) {
        const update = vi.fn();
        const service = new DefaultChannelCurrencyBootstrapService(
            {
                getDefaultChannel: vi
                    .fn()
                    .mockResolvedValue({ id: 1, defaultCurrencyCode: current }),
                update,
            } as unknown as ChannelService,
            { isWorker } as unknown as ProcessContext,
            { defaultCurrencyCode: code },
        );
        return { service, update };
    }

    it('switches the default channel to the configured currency', async () => {
        const { service, update } = build('USD', 'RUB');
        await service.onApplicationBootstrap();
        expect(update).toHaveBeenCalledWith(expect.anything(), {
            id: 1,
            defaultCurrencyCode: 'RUB',
            availableCurrencyCodes: ['RUB'],
        });
    });

    it('is a no-op when already configured, unset, or on a worker', async () => {
        for (const b of [build('RUB', 'RUB'), build('USD', undefined), build('USD', 'RUB', true)]) {
            await b.service.onApplicationBootstrap();
            expect(b.update).not.toHaveBeenCalled();
        }
    });
});
