import { describe, expect, it } from 'vitest';
import {
    clipText,
    defaultTtlMs,
    flightVector,
    isClientOrigin,
    shouldPersist,
} from '../../composables/notifyRules';

describe('notify rules', () => {
    it('persists by default and only an explicit ephemeral opt-out or a missing store skips it', () => {
        expect(shouldPersist({}, true)).toBe(true);
        expect(shouldPersist({ ephemeral: false }, true)).toBe(true);
        expect(shouldPersist({ ephemeral: true }, true)).toBe(false);
        expect(shouldPersist({}, false)).toBe(false);
    });

    it('keeps errors and warnings on screen longer than the rest', () => {
        expect(defaultTtlMs('error')).toBeGreaterThan(defaultTtlMs('success'));
        expect(defaultTtlMs('warning')).toBe(defaultTtlMs('error'));
        expect(defaultTtlMs('info')).toBe(defaultTtlMs('success'));
    });

    it('clips text to the cap including the ellipsis and leaves short text alone', () => {
        expect(clipText('abc', 3)).toBe('abc');
        expect(clipText('abcd', 3)).toBe('ab…');
        expect(clipText('abcd', 3)).toHaveLength(3);
    });

    it('recognises client-origin items by the source marker', () => {
        expect(isClientOrigin({ sourceType: 'client' })).toBe(true);
        expect(isClientOrigin({ sourceType: 'reservation' })).toBe(false);
    });

    it('computes the centre-to-centre flight vector from a popup to the bell', () => {
        expect(
            flightVector(
                { left: 100, top: 100, width: 200, height: 40 },
                { left: 400, top: 10, width: 40, height: 40 },
            ),
        ).toEqual({ x: 220, y: -90 });
    });
});
