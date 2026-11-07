import { describe, expect, it } from 'vitest';
import { resolveInitialView } from '../../../composables/location/initialView';
import { chooseProvider } from '../../../composables/location/providerPreference';

const config = {
    providers: [{ key: 'open' }, { key: 'provider-a' }],
    defaultProvider: 'provider-a',
    defaultLatitude: 10,
    defaultLongitude: 20,
    defaultZoom: 7,
};

describe('resolveInitialView', () => {
    const suggestion = { latitude: 1, longitude: 2 };
    const sibling = { latitude: 3, longitude: 4 };

    it('prefers the picked suggestion, then a sibling point, then config', () => {
        expect(resolveInitialView({ suggestion, sibling, config }).source).toBe('suggestion');
        expect(resolveInitialView({ sibling, config }).center).toEqual(sibling);
        expect(resolveInitialView({ config })).toMatchObject({ source: 'config', zoom: 7 });
    });

    it('skips invalid coordinates and falls back to the world view without config', () => {
        const bad = { latitude: 0, longitude: 0 };
        expect(resolveInitialView({ suggestion: bad, config }).source).toBe('config');
        expect(resolveInitialView({ config: { providers: [] } }).source).toBe('world');
    });
});

describe('chooseProvider', () => {
    it('uses the stored key only while enabled, else the default, else the first', () => {
        expect(chooseProvider(config, 'open')).toBe('open');
        expect(chooseProvider(config, 'gone')).toBe('provider-a');
        expect(chooseProvider({ providers: [{ key: 'open' }] }, null)).toBe('open');
        expect(chooseProvider({ providers: [] }, null)).toBeNull();
    });
});
