import { beforeEach, describe, expect, it, vi } from 'vitest';

const search = vi.fn();
const loadConfig = vi.fn();
vi.mock('../../stores/geo', () => ({
    useGeoStore: () => ({ search, reverse: vi.fn(), loadConfig }),
}));
vi.mock('@mivend/ui-kit', () => ({ searchesThroughHost: (key: string) => key === 'open' }));

import { useLocationPick } from '../../pages/account/useLocationPick';

function config(defaultProvider: string) {
    loadConfig.mockResolvedValue({ providers: [{ key: defaultProvider }], defaultProvider });
}

async function start() {
    const pick = useLocationPick(
        () => 'Some street 1',
        () => null,
        () => null,
    );
    await pick.start();
    return pick;
}

beforeEach(() => {
    search.mockReset();
    loadConfig.mockReset();
});

describe('useLocationPick first hit', () => {
    it('asks the server for a suggestion when the default provider searches through the host', async () => {
        config('open');
        search.mockResolvedValue([{ address: 'x', latitude: 1, longitude: 2 }]);
        const pick = await start();
        expect(search).toHaveBeenCalledTimes(1);
        expect(pick.suggestionPoint.value).toEqual({ latitude: 1, longitude: 2 });
    });

    it('skips the server call for a browser-only provider', async () => {
        config('provider-a');
        const pick = await start();
        expect(search).not.toHaveBeenCalled();
        expect(pick.suggestionPoint.value).toBeNull();
        expect(pick.open.value).toBe(true);
    });
});
