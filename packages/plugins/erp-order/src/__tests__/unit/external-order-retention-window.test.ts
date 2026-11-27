import { describe, it, expect } from 'vitest';

import { isBeyondRetention } from '../../external-order-retention.service';

describe('isBeyondRetention', () => {
    const now = new Date('2026-11-27T12:00:00Z');

    it('is true only for a date strictly before now minus the window', () => {
        expect(isBeyondRetention(new Date('2025-11-27T11:59:59Z'), 12, now)).toBe(true);
        expect(isBeyondRetention(new Date('2025-11-27T12:00:00Z'), 12, now)).toBe(false);
        expect(isBeyondRetention(new Date('2026-06-01T00:00:00Z'), 12, now)).toBe(false);
    });

    it('follows the configured number of months', () => {
        expect(isBeyondRetention(new Date('2026-04-01T00:00:00Z'), 6, now)).toBe(true);
    });
});
