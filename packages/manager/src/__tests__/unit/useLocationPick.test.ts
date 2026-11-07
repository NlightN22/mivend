import { beforeEach, describe, expect, it, vi } from 'vitest';

const geo = vi.hoisted(() => ({ loadGeoConfig: vi.fn(), searchAddress: vi.fn() }));
vi.mock('../../api/geo', () => geo);

import { useLocationPick } from '../../composables/useLocationPick';

const config = { providers: [{ key: 'open', publicKey: null }], defaultProvider: 'open' };

describe('useLocationPick', () => {
    beforeEach(() => {
        geo.loadGeoConfig.mockReset().mockResolvedValue(config);
        geo.searchAddress
            .mockReset()
            .mockResolvedValue([{ address: 'A', latitude: 1, longitude: 2 }]);
    });

    it('opens near the first geocoded hit for the typed address when nothing is chosen', async () => {
        const pick = useLocationPick(
            () => 'Street 1',
            () => null,
            () => null,
        );
        await pick.start();
        expect(pick.open.value).toBe(true);
        expect(pick.suggestionPoint.value).toEqual({ latitude: 1, longitude: 2 });
    });

    it('does not search when a location is already set or the address is short', async () => {
        const set = useLocationPick(
            () => 'Street 1',
            () => ({ latitude: 5, longitude: 6 }),
            () => null,
        );
        await set.start();
        const short = useLocationPick(
            () => 'ab',
            () => null,
            () => null,
        );
        await short.start();
        expect(geo.searchAddress).not.toHaveBeenCalled();
        expect(set.suggestionPoint.value).toBeNull();
    });

    it('still opens when the search fails and reports failure when the config cannot load', async () => {
        geo.searchAddress.mockRejectedValue(new Error('down'));
        const pick = useLocationPick(
            () => 'Street 1',
            () => null,
            () => null,
        );
        await pick.start();
        expect(pick.open.value).toBe(true);
        expect(pick.suggestionPoint.value).toBeNull();

        geo.loadGeoConfig.mockRejectedValue(new Error('down'));
        const broken = useLocationPick(
            () => 'Street 1',
            () => null,
            () => null,
        );
        await broken.start();
        expect(broken.failed.value).toBe(true);
        expect(broken.open.value).toBe(false);
    });
});
