import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { TaxZoneService } from '../../tax-zone.service';

const ctx = {} as RequestContext;
const ZONE = { id: 'zone-1', name: 'Russia' };

function makeService(
    channel: { defaultTaxZone?: unknown; defaultShippingZone?: unknown },
    existingZone: typeof ZONE | null = ZONE,
): {
    service: TaxZoneService;
    channelService: {
        getDefaultChannel: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
    };
    save: ReturnType<typeof vi.fn>;
} {
    const save = vi.fn(async (z: unknown) => ({ id: 'zone-new', ...(z as object) }));
    const repo = {
        findOne: vi.fn().mockResolvedValue(existingZone),
        create: vi.fn((z: unknown) => z),
        save,
    };
    const channelService = {
        getDefaultChannel: vi.fn().mockResolvedValue({ id: 'ch-1', ...channel }),
        update: vi.fn().mockResolvedValue({}),
    };
    const service = new TaxZoneService(
        { getRepository: () => repo } as never,
        channelService as never,
    );
    return { service, channelService, save };
}

// #144: products can't be priced until the channel has a default tax zone.
describe('TaxZoneService', () => {
    it('assigns the zone to a channel missing both default zones', async () => {
        const { service, channelService } = makeService({});

        await service.findOrCreateDefaultZone(ctx);

        expect(channelService.update).toHaveBeenCalledWith(ctx, {
            id: 'ch-1',
            defaultTaxZoneId: 'zone-1',
            defaultShippingZoneId: 'zone-1',
        });
    });

    it('never overrides a channel zone that is already set', async () => {
        const { service, channelService } = makeService({
            defaultTaxZone: { id: 'other' },
            defaultShippingZone: { id: 'other' },
        });

        await service.findOrCreateDefaultZone(ctx);

        expect(channelService.update).not.toHaveBeenCalled();
    });

    it('fills only the missing one when the other default zone is already set', async () => {
        const { service, channelService } = makeService({ defaultShippingZone: { id: 'other' } });

        await service.findOrCreateDefaultZone(ctx);

        expect(channelService.update).toHaveBeenCalledWith(ctx, {
            id: 'ch-1',
            defaultTaxZoneId: 'zone-1',
        });
    });

    it('bootstrap repair is a no-op when the zone does not exist yet', async () => {
        const { service, channelService, save } = makeService({}, null);

        await service.ensureChannelDefaultsForExistingZone(ctx);

        expect(save).not.toHaveBeenCalled();
        expect(channelService.update).not.toHaveBeenCalled();
    });
});
